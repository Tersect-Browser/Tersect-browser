"""Bring inputs into the working directory.

URLs are downloaded once into a shared cache (keyed by URL) and linked from
there, so rebuilding a dataset or building another one from the same files
does not download them again. Local files are linked, not copied.
"""
import hashlib
import os
import time
import urllib.request

from .manifest import is_url
from . import settings

CHUNK = 1 << 20
ATTEMPTS = 3


class DownloadError(RuntimeError):
    """A URL could not be downloaded; `url` names it."""

    def __init__(self, url, message):
        super().__init__(message)
        self.url = url


def cache_path(location):
    """Where the download of a URL is kept (whether or not it exists yet)."""
    key = hashlib.sha256(location.encode()).hexdigest()[:16]
    name = os.path.basename(location.split('?')[0]) or 'download'
    return os.path.join(settings.cache_dir(), '%s-%s' % (key, name))


def _copy(response, out, progress, offset):
    """copyfileobj, reporting (bytes so far, total or None) after each chunk."""
    length = response.headers.get('Content-Length')
    total = offset + int(length) if length and length.isdigit() else None
    done = offset
    while True:
        block = response.read(CHUNK)
        if not block:
            break
        out.write(block)
        done += len(block)
        if progress:
            progress(done, total)


def _download(url, target, attempts=ATTEMPTS, progress=None):
    part = target + '.part'
    for attempt in range(1, attempts + 1):
        try:
            # Resume a partial download when the server supports it.
            offset = os.path.getsize(part) if os.path.exists(part) else 0
            request = urllib.request.Request(url, headers={'User-Agent': 'tersect-browser-pipeline'})
            if offset:
                request.add_header('Range', 'bytes=%d-' % offset)
            with urllib.request.urlopen(request, timeout=120) as response:
                if offset and response.status != 206:
                    offset = 0  # range not honoured: start again
                with open(part, 'ab' if offset else 'wb') as out:
                    _copy(response, out, progress, offset)
            os.replace(part, target)
            return
        except OSError as error:
            if attempt == attempts:
                raise DownloadError(url, 'Download failed after %d attempts: %s (%s)'
                                    % (attempts, url, error))
            wait = 5 * attempt
            print('  download interrupted (%s); retrying in %ds' % (error, wait))
            time.sleep(wait)


def cached(location, progress=None):
    """Local path of `location`, downloading it into the cache if a URL.

    `progress(bytes, total)` is called while downloading; it may raise to
    stop (the partial file is kept and resumed next time).
    """
    if not is_url(location):
        return location
    os.makedirs(settings.cache_dir(), exist_ok=True)
    target = cache_path(location)
    if not os.path.exists(target):
        print('Downloading %s' % location, flush=True)
        _download(location, target, progress=progress)
    return target


def link(location, target):
    """Make `target` point at the (possibly downloaded) input."""
    source = cached(location)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if os.path.lexists(target):
        os.remove(target)
    os.symlink(source, target)
