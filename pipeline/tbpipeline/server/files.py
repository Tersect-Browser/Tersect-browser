"""Input files: where they are, whether they can be reached, what is in them.

    GET  /api/config                 BuilderConfig
    GET  /api/storage                free and total bytes on the data disk
    GET  /api/server-files?path=     browse the shared server folders
    POST /api/datasets/check-urls    reachability and size of URLs
    POST /api/datasets/inspect       sequences, samples, contigs, seqids

A file is a FileRef (web/src/features/datasets/types.ts): an upload id, a
URL or a path in a shared server folder (TB_SERVER_FOLDERS, colon-separated,
default /data). resolve_ref() turns one into a manifest location.

Paths are confined to the shared folders by their real path; URLs must be
http, https or ftp and, unless TB_BUILDER_ALLOW_PRIVATE_URLS is set, must not
resolve to private or loopback addresses. Tools get argument lists, never a
shell, and run with timeouts.
"""
import asyncio
import ftplib
import gzip
import hashlib
import ipaddress
import json
import os
import shutil
import socket
import subprocess
import threading
import time
import zlib
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import fetch, settings
from . import uploads

router = APIRouter()

URL_SCHEMES = ('http', 'https', 'ftp')
URL_TIMEOUT = 10          # seconds, per URL check
MAX_URLS = 1000           # per check-urls request
TOOL_TIMEOUT = 120        # seconds, header reads and small indexes
FAIDX_TIMEOUT = 900       # seconds, indexing a whole FASTA
# GFF read before giving up (uncompressed bytes, seconds): local, remote.
GFF_BUDGET = {'local': (2 << 30, 30), 'remote': (64 << 20, 20)}
VCF_SCAN_RECORDS = 200_000  # records scanned for contigs when the header has none


class FileRef(BaseModel):
    source: Literal['upload', 'url', 'server']
    location: str
    name: str = ''
    size: int | None = None


class InspectRequest(BaseModel):
    file: FileRef
    kind: Literal['fasta', 'gff', 'vcf', 'tsi']


class CheckUrlsRequest(BaseModel):
    urls: list[str]


# ------------------------------------------------------- shared folders --

def shared_roots() -> list[str]:
    """Real paths of the shared server folders that exist."""
    roots = []
    for root in os.environ.get('TB_SERVER_FOLDERS', '/data').split(':'):
        if root and os.path.isdir(root):
            real = os.path.realpath(root)
            if real not in roots:
                roots.append(real)
    return roots


def _root_of(real: str) -> str | None:
    for root in shared_roots():
        if real == root or real.startswith(root.rstrip(os.sep) + os.sep):
            return root
    return None


def confine(path: str) -> str:
    """Real path of `path` if it is inside a shared folder, else ValueError."""
    if not isinstance(path, str) or not os.path.isabs(path) or '\0' in path:
        raise ValueError('%s is not an absolute path' % path)
    real = os.path.realpath(path)
    if _root_of(real) is None:
        raise ValueError('%s is not in a shared server folder' % path)
    return real


# ---------------------------------------------------------------- URLs --

def _private_urls_allowed() -> bool:
    return os.environ.get('TB_BUILDER_ALLOW_PRIVATE_URLS', '').lower() in ('1', 'true', 'yes')


def _check_addresses(host: str, addresses):
    """Refuse hosts that resolve to private, loopback or link-local addresses."""
    if _private_urls_allowed():
        return
    for address in addresses:
        ip = ipaddress.ip_address(address.split('%')[0])
        if getattr(ip, 'ipv4_mapped', None):
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast:
            raise ValueError('%s resolves to a private address' % host)


def _resolve_host(host: str, port: int):
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError('host not found: %s' % host)
    return [info[4][0] for info in infos]


def validate_url(url: str) -> str:
    """The URL if it is http, https or ftp with a host, else ValueError."""
    if not isinstance(url, str) or any(c.isspace() for c in url.strip()):
        raise ValueError('Not a valid URL: %s' % url)
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in URL_SCHEMES:
        raise ValueError('Only http, https and ftp URLs are supported: %s' % url)
    if not parsed.hostname:
        raise ValueError('The URL has no host: %s' % url)
    return url


def public_url(url: str) -> str:
    """validate_url, and refuse hosts on private networks (SSRF)."""
    url = validate_url(url)
    parsed = urlparse(url)
    port = parsed.port or {'http': 80, 'https': 443, 'ftp': 21}[parsed.scheme]
    _check_addresses(parsed.hostname, _resolve_host(parsed.hostname, port))
    return url


def _status_text(status: int) -> str:
    reasons = {401: 'access denied', 403: 'access denied', 404: 'not found',
               410: 'not found', 429: 'too many requests'}
    return '%s (%d)' % (reasons.get(status, 'server error' if status >= 500
                                    else 'request failed'), status)


async def _guard_request(request: httpx.Request):
    """httpx hook, run for each request including redirects."""
    if _private_urls_allowed():
        return
    host = request.url.host
    port = request.url.port or (443 if request.url.scheme == 'https' else 80)
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError('host not found: %s' % host)
    _check_addresses(host, [info[4][0] for info in infos])


def _guard_request_sync(request: httpx.Request):
    """Like _guard_request, for the blocking client."""
    if not _private_urls_allowed():
        port = request.url.port or (443 if request.url.scheme == 'https' else 80)
        _check_addresses(request.url.host, _resolve_host(request.url.host, port))


def http_client(timeout: float = URL_TIMEOUT) -> httpx.Client:
    """Blocking client that follows redirects, checking every hop (SSRF)."""
    return httpx.Client(follow_redirects=True, timeout=timeout, max_redirects=10,
                        headers={'User-Agent': 'tersect-browser-pipeline'},
                        event_hooks={'request': [_guard_request_sync]})


def _ftp_size(url: str) -> dict:
    parsed = urlparse(url)
    _check_addresses(parsed.hostname, _resolve_host(parsed.hostname, parsed.port or 21))
    try:
        with ftplib.FTP(timeout=URL_TIMEOUT) as ftp:
            ftp.connect(parsed.hostname, parsed.port or 21)
            ftp.login(parsed.username or 'anonymous', parsed.password or '')
            ftp.voidcmd('TYPE I')
            size = ftp.size(parsed.path)
        return {'ok': True, 'status': None, 'size': size, 'error': None}
    except ftplib.error_perm as error:
        message = 'not found' if str(error).startswith('550') else str(error)
        return {'ok': False, 'status': None, 'size': None, 'error': message}


def _size_from(response: httpx.Response) -> int | None:
    content_range = response.headers.get('Content-Range', '')
    if '/' in content_range and content_range.rsplit('/', 1)[1].isdigit():
        return int(content_range.rsplit('/', 1)[1])
    length = response.headers.get('Content-Length')
    # Content-Length of a compressed or ranged response is not the file size.
    if length and length.isdigit() and response.status_code == 200 \
            and not response.headers.get('Content-Encoding'):
        return int(length)
    return None


async def _check_http(client: httpx.AsyncClient, url: str) -> dict:
    response = await client.head(url)
    if response.status_code in (403, 405, 501):
        # HEAD not allowed: ask for the first byte instead.
        async with client.stream('GET', url, headers={'Range': 'bytes=0-0'}) as response:
            pass
    status = response.status_code
    if status >= 400:
        return {'ok': False, 'status': status, 'size': None, 'error': _status_text(status)}
    return {'ok': True, 'status': status, 'size': _size_from(response), 'error': None}


async def check_url(client: httpx.AsyncClient, url: str) -> dict:
    """One UrlCheck: {url, ok, status, size, error}."""
    result = {'url': url}
    try:
        url = validate_url(url)
        if urlparse(url).scheme == 'ftp':
            result.update(await asyncio.wait_for(asyncio.to_thread(_ftp_size, url),
                                                 URL_TIMEOUT * 2))
        else:
            result.update(await _check_http(client, url))
    except ValueError as error:
        result.update(ok=False, status=None, size=None, error=str(error))
    except (httpx.TimeoutException, asyncio.TimeoutError, TimeoutError, socket.timeout):
        result.update(ok=False, status=None, size=None, error='timed out')
    except httpx.TooManyRedirects:
        result.update(ok=False, status=None, size=None, error='too many redirects')
    except (httpx.HTTPError, OSError, ftplib.Error) as error:
        result.update(ok=False, status=None, size=None,
                      error='could not connect (%s)' % (str(error) or type(error).__name__))
    return result


async def check_urls(urls: list[str]) -> list[dict]:
    limits = asyncio.Semaphore(16)
    async with httpx.AsyncClient(
            follow_redirects=True, timeout=URL_TIMEOUT, max_redirects=10,
            headers={'User-Agent': 'tersect-browser-pipeline'},
            event_hooks={'request': [_guard_request]}) as client:
        async def one(url):
            async with limits:
                return await check_url(client, url)
        return await asyncio.gather(*(one(url) for url in urls))


# ---------------------------------------------------------- references --

def resolve_ref(ref: dict) -> str:
    """Manifest location of a FileRef: a file path or a URL. ValueError if unusable."""
    source, location = ref.get('source'), ref.get('location')
    name = ref.get('name') or location
    if not isinstance(location, str) or not location:
        raise ValueError('%s: no location given' % (name or 'File'))
    if source == 'upload':
        record = uploads.info(location)
        if record is None:
            raise ValueError('Upload of %s was not found; upload it again.' % name)
        if not record['complete']:
            raise ValueError('Upload of %s is not complete (%d%%).'
                             % (record['filename'], uploads.progress(record)))
        return uploads.path_of(location)
    if source == 'server':
        path = confine(location)
        if not os.path.isfile(path):
            raise ValueError('%s is not a file' % location)
        return path
    if source == 'url':
        return public_url(location)
    raise ValueError('Unknown file source: %s' % source)


# -------------------------------------------------------------- tools --

def _run(args: list[str], timeout: int = TOOL_TIMEOUT) -> str:
    """stdout of a tool; ValueError with its last stderr line on failure."""
    try:
        done = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise ValueError('%s took longer than %ds' % (args[0], timeout))
    if done.returncode != 0:
        raise ValueError(_tool_error(done.stderr) or '%s failed (exit %d)'
                         % (args[0], done.returncode))
    return done.stdout


def _tool_error(stderr: str) -> str:
    """The most telling stderr line: htslib's first [E::...] error, else the last line."""
    lines = [line.strip() for line in stderr.splitlines() if line.strip()]
    errors = [line for line in lines if line.startswith('[E::')]
    line = (errors or lines or [''])[0 if errors else -1]
    # Drop the "[E::function] " / "[faidx] " prefix.
    return line.split('] ', 1)[1] if line.startswith('[') and '] ' in line else line


def _compression(path: str) -> str:
    """'bgzf', 'gzip' or 'none', from the first bytes."""
    with open(path, 'rb') as handle:
        head = handle.read(18)
    if head[:2] != b'\x1f\x8b':
        return 'none'
    # BGZF: gzip with FEXTRA and a 'BC' subfield.
    return 'bgzf' if len(head) >= 14 and head[3] & 4 and head[12:14] == b'BC' else 'gzip'


def _open_text(path: str):
    return gzip.open(path, 'rt', errors='replace') if _compression(path) != 'none' \
        else open(path, errors='replace')


def _inspect_cache(path: str, kind: str) -> str:
    """Cache file for results about `path`, keyed by path, size and mtime."""
    stat = os.stat(path)
    key = hashlib.sha256(('%s|%d|%d' % (path, stat.st_size, stat.st_mtime_ns)).encode())
    folder = os.path.join(settings.cache_dir(), 'inspect')
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, '%s.%s' % (key.hexdigest()[:24], kind))


def _read_fai(text: str) -> list[dict]:
    sequences = []
    for line in text.splitlines():
        fields = line.split('\t')
        if len(fields) >= 2 and fields[1].isdigit():
            sequences.append({'name': fields[0], 'length': int(fields[1])})
    return sequences


def fasta_sequences(path: str) -> list[dict]:
    """Sequence names and lengths of a local FASTA (plain, bgzip or gzip)."""
    cached = _inspect_cache(path, 'fai')
    if os.path.exists(cached):
        with open(cached) as handle:
            return _read_fai(handle.read())
    if _compression(path) == 'gzip':
        # samtools cannot index plain gzip; count the lengths instead.
        sequences, name, length = [], None, 0
        with gzip.open(path, 'rb') as handle:
            for line in handle:
                if line.startswith(b'>'):
                    if name is not None:
                        sequences.append({'name': name, 'length': length})
                    name, length = line[1:].split(None, 1)[0].decode(errors='replace') \
                        if line[1:].strip() else '', 0
                elif name is not None:
                    length += len(line.strip())
        if name is not None:
            sequences.append({'name': name, 'length': length})
        if not sequences:
            raise ValueError('No FASTA sequences found (no ">" header lines)')
        text = ''.join('%s\t%d\n' % (s['name'], s['length']) for s in sequences)
    else:
        existing = path + '.fai'
        if os.path.exists(existing) and os.path.getmtime(existing) >= os.path.getmtime(path):
            with open(existing) as handle:
                return _read_fai(handle.read())
        # Index into the cache: shared folders are read-only.
        args = ['samtools', 'faidx', '--fai-idx', cached + '.tmp']
        if _compression(path) == 'bgzf':
            args += ['--gzi-idx', cached + '.gzi']
        try:
            _run(args + [path], timeout=FAIDX_TIMEOUT)
        except ValueError as error:
            raise ValueError('Not a FASTA file (or not readable): %s' % error)
        with open(cached + '.tmp') as handle:
            text = handle.read()
        if not _read_fai(text):
            raise ValueError('No FASTA sequences found')
    with open(cached + '.tmp', 'w') as handle:
        handle.write(text)
    os.replace(cached + '.tmp', cached)
    return _read_fai(text)


def tsi_samples(path: str) -> list[str]:
    """Sample names in a Tersect index."""
    cached = _inspect_cache(path, 'samples.json')
    if os.path.exists(cached):
        with open(cached) as handle:
            return json.load(handle)
    copy = None
    try:
        source = path
        if not os.access(path, os.W_OK):
            # tersect opens the index read-write, so a file in a read-only
            # shared folder is read from a temporary copy.
            copy = cached + '.tsi'
            shutil.copyfile(path, copy)
            source = copy
        try:
            out = _run(['tersect', 'samples', '-n', source])
        except ValueError as error:
            raise ValueError('Not a Tersect index (.tsi): %s' % error)
    finally:
        if copy and os.path.exists(copy):
            os.remove(copy)
    samples = [line.strip() for line in out.splitlines() if line.strip()]
    if not samples:
        raise ValueError('No samples found; is this a Tersect index (.tsi)?')
    with open(cached + '.tmp', 'w') as handle:
        json.dump(samples, handle)
    os.replace(cached + '.tmp', cached)
    return samples


def vcf_header(location: str) -> dict:
    """Samples, contigs and FORMAT/GT of a VCF (local path or URL), from its header."""
    try:
        header = _run(['bcftools', 'view', '-h', '--no-version', location])
    except ValueError as error:
        raise ValueError('Could not read the VCF header: %s' % error)
    samples, contigs, has_gt = [], [], False
    for line in header.splitlines():
        if line.startswith('##contig=<'):
            for field in line[len('##contig=<'):].rstrip('>').split(','):
                if field.startswith('ID='):
                    contigs.append(field[3:])
                    break
        elif line.startswith('##FORMAT=<') and 'ID=GT,' in line:
            has_gt = True
        elif line.startswith('#CHROM'):
            samples = line.split('\t')[9:]
    result = {'samples': samples, 'contigs': contigs, 'has_genotypes': has_gt and bool(samples)}
    if not contigs:
        result['contigs'], complete = _record_contigs(location)
        if not complete:
            result['note'] = ('The header has no ##contig lines; contigs are from the '
                              'first %s records.' % format(VCF_SCAN_RECORDS, ','))
    return result


def _record_contigs(location: str) -> tuple[list[str], bool]:
    """CHROM values of the first records, and whether the whole file was read."""
    process = subprocess.Popen(['bcftools', 'query', '-f', '%CHROM\n', location],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    timer = threading.Timer(TOOL_TIMEOUT, process.kill)
    timer.start()
    contigs, count, complete = {}, 0, True
    try:
        for line in process.stdout:
            contigs.setdefault(line.rstrip('\n'), None)
            count += 1
            if count >= VCF_SCAN_RECORDS:
                complete = False
                break
    finally:
        timer.cancel()
        process.kill()
        process.wait()
    return list(contigs), complete


def _gff_seqids(lines, budget) -> tuple[list[str], bool]:
    """Unique column-1 ids in order, and whether the input was read to the end."""
    (max_bytes, max_seconds), seqids, read, started = budget, {}, 0, time.monotonic()
    for line in lines:
        read += len(line)
        if line.startswith('##FASTA'):
            return list(seqids), True
        if line and not line.startswith('#'):
            seqid = line.split('\t', 1)[0].strip()
            if seqid:
                seqids.setdefault(seqid, None)
        if read > max_bytes or time.monotonic() - started > max_seconds:
            return list(seqids), False
    return list(seqids), True


def _url_lines(url: str):
    """Lines of a (possibly gzip or bgzip) file at a URL, streamed."""
    public_url(url)
    if urlparse(url).scheme == 'ftp':
        raise ValueError('Gene models over FTP are read when the build downloads them')
    with http_client() as client, client.stream('GET', url) as response:
        if response.status_code >= 400:
            raise ValueError('Could not download the file: %s' % _status_text(response.status_code))
        inflate, pending, gzipped = None, b'', None
        for block in response.iter_raw(1 << 16):
            if gzipped is None:
                gzipped = block[:2] == b'\x1f\x8b'
            if gzipped:
                data = b''
                while block:  # bgzip is many gzip members
                    inflate = inflate or zlib.decompressobj(16 + zlib.MAX_WBITS)
                    data += inflate.decompress(block)
                    block = inflate.unused_data
                    if inflate.eof:
                        inflate = None
            else:
                data = block
            pending += data
            *lines, pending = pending.split(b'\n')
            for line in lines:
                yield line.decode(errors='replace')
        if pending:
            yield pending.decode(errors='replace')


# ---------------------------------------------- FASTA by URL (download) --

# URL -> {'done': bytes, 'total': bytes or None, 'error': str or None}
_downloads = {}
_downloads_lock = threading.Lock()


def _cache_target(url: str) -> str:
    """Where fetch.cached() keeps a URL, so a build reuses our download."""
    return fetch.cache_path(url)


def _download(url: str, target: str):
    """Download into the pipeline cache under a private name, then rename.

    A build that starts meanwhile downloads on its own (fetch.py), and both
    end with the same complete file at `target`.
    """
    state = _downloads[url]
    part = '%s.inspect-%d.part' % (target, os.getpid())
    try:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        if urlparse(url).scheme == 'ftp':
            fetch._download(url, part)  # urllib handles FTP; no SSRF hook needed past public_url
        else:
            with http_client(timeout=120) as client, client.stream('GET', url) as response, \
                    open(part, 'wb') as out:
                if response.status_code >= 400:
                    raise ValueError(_status_text(response.status_code))
                length = response.headers.get('Content-Length')
                state['total'] = int(length) if length and length.isdigit() else None
                for block in response.iter_raw(1 << 20):
                    out.write(block)
                    state['done'] += len(block)
        if not os.path.exists(target):
            os.replace(part, target)
        with _downloads_lock:
            del _downloads[url]
    except Exception as error:  # reported by the next inspect
        state['error'] = 'Download failed: %s' % error
    finally:
        if os.path.exists(part):
            os.remove(part)


def _remote_fai(url: str) -> list[dict] | None:
    """Sequences from <url>.fai, if the server has one."""
    if urlparse(url).scheme == 'ftp':
        return None
    try:
        with http_client() as client, client.stream('GET', url + '.fai') as response:
            if response.status_code != 200:
                return None
            body = b''
            for block in response.iter_bytes():
                body += block
                if len(body) > 16 << 20:
                    return None
        return _read_fai(body.decode(errors='replace')) or None
    except (httpx.HTTPError, OSError, ValueError):
        return None


def _fasta_url(url: str) -> dict:
    target = _cache_target(url)
    if os.path.exists(target):
        return {'sequences': fasta_sequences(target)}
    sequences = _remote_fai(url)
    if sequences:
        return {'sequences': sequences}
    with _downloads_lock:
        state = _downloads.get(url)
        if state is None or state['error']:
            if state and state['error']:
                error = state['error']
                del _downloads[url]
                return {'sequences': None, 'error': error + '. Inspect again to retry.'}
            state = _downloads[url] = {'done': 0, 'total': None, 'error': None}
            threading.Thread(target=_download, args=(url, target), daemon=True).start()
    if state['total']:
        progress = ' (%d%%)' % (100 * state['done'] // state['total'])
    else:
        progress = ''
    return {'sequences': None,
            'note': 'Downloading the FASTA%s; sequences are listed once it finishes.' % progress}


# ------------------------------------------------------------ inspect --

def inspect(ref: dict, kind: str) -> dict:
    """InspectResult for a FileRef. Problems are returned as `error`, never raised."""
    result = {'kind': kind, 'size': ref.get('size')}
    try:
        if ref.get('source') == 'upload':
            record = uploads.info(ref.get('location'))
            if record is None:
                raise ValueError('Upload not found; upload the file again.')
            result['size'] = record['size']
            if not record['complete']:
                result['note'] = 'Inspected once the upload finishes'
                return result
        location = resolve_ref(ref)
        remote = ref['source'] == 'url'
        if not remote:
            result['size'] = os.path.getsize(location)
        else:
            check = asyncio.run(check_urls([location]))[0]
            if not check['ok']:
                raise ValueError('The URL cannot be read: %s' % check['error'])
            result['size'] = result['size'] or check['size']
        if kind == 'fasta':
            result.update(_fasta_url(location) if remote
                          else {'sequences': fasta_sequences(location)})
        elif kind == 'vcf':
            result.update(vcf_header(location))
        elif kind == 'gff':
            if remote:
                target = _cache_target(location)
                local = os.path.exists(target)
                lines = _open_text(target) if local else _url_lines(location)
            else:
                local, lines = True, _open_text(location)
            try:
                seqids, complete = _gff_seqids(lines, GFF_BUDGET['local' if local else 'remote'])
            finally:
                getattr(lines, 'close', lambda: None)()
            if not seqids and complete:
                raise ValueError('No features found in the GFF file')
            result['seqids'] = seqids
            if not complete:
                result['note'] = 'Sequence ids from the start of the file only'
        elif kind == 'tsi':
            if remote:
                result['samples'] = None
                result['note'] = 'Samples are listed once the index is downloaded by the build'
            else:
                result['samples'] = tsi_samples(location)
    except (ValueError, OSError, EOFError, zlib.error, UnicodeError) as error:
        result['error'] = str(error) or type(error).__name__
    except Exception as error:  # never a 500 for a bad file
        result['error'] = 'Could not read the file: %s' % (str(error) or type(error).__name__)
    return result


# -------------------------------------------------------------- routes --

@router.get('/config')
def get_config():
    enabled = bool(os.environ.get('TB_ASSISTANT_URL', '').strip())
    return {'assistant': enabled,
            'assistant_model': (os.environ.get('TB_ASSISTANT_MODEL', '').strip() or 'qwen3:14b')
            if enabled else None,
            'max_upload': uploads.max_upload()}


@router.get('/storage')
def get_storage():
    free, total = uploads.free_space()
    return {'free': free, 'total': total}


@router.get('/server-files')
def server_files(path: str = ''):
    """A shared folder's entries: folders first, then files, by name."""
    if not path:
        return {'path': '', 'parent': None,
                'entries': [{'name': os.path.basename(root) or root, 'path': root,
                             'kind': 'dir', 'size': None} for root in shared_roots()]}
    try:
        folder = confine(path)
    except ValueError as error:
        raise HTTPException(403, str(error))
    if not os.path.isdir(folder):
        raise HTTPException(404, '%s is not a folder' % path)
    dirs, files = [], []
    try:
        entries = list(os.scandir(folder))
    except PermissionError:
        raise HTTPException(403, 'The server cannot read %s' % path)
    for entry in entries:
        if entry.name.startswith('.'):
            continue
        full = os.path.join(folder, entry.name)
        if _root_of(os.path.realpath(full)) is None:
            continue  # a symlink out of the shared folders
        try:
            if entry.is_dir():
                dirs.append({'name': entry.name, 'path': full, 'kind': 'dir', 'size': None})
            elif entry.is_file():
                files.append({'name': entry.name, 'path': full, 'kind': 'file',
                              'size': entry.stat().st_size})
        except OSError:
            continue
    dirs.sort(key=lambda e: e['name'].lower())
    files.sort(key=lambda e: e['name'].lower())
    root = _root_of(folder)
    return {'path': folder, 'parent': None if folder == root else os.path.dirname(folder),
            'entries': dirs + files}


@router.post('/datasets/check-urls')
async def post_check_urls(body: CheckUrlsRequest):
    if len(body.urls) > MAX_URLS:
        raise HTTPException(400, 'At most %d URLs at a time' % MAX_URLS)
    return await check_urls(body.urls)


@router.post('/datasets/inspect')
def post_inspect(body: InspectRequest):
    return inspect(body.file.model_dump(), body.kind)
