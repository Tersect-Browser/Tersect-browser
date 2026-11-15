"""Resumable uploads: the tus 1.0.0 protocol (https://tus.io/protocols/resumable-upload).

Core protocol plus the creation, termination and checksum extensions. Each
upload is a folder:

    <data_root>/uploads/<id>/<sanitised filename>
    <data_root>/uploads/<id>/upload.json   {id, filename, size, offset,
                                            sha256, complete, created_at}

upload.json is the source of truth for the offset: a PATCH first truncates
the file to it, so bytes written before a crash and not yet recorded are
simply sent again. The sha256 of the whole file is computed while writing
(or by reading the file back, after a restart) and stored on completion.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import shutil
import time

import anyio
from fastapi import APIRouter, Request, Response
from starlette.requests import ClientDisconnect

from .. import settings

router = APIRouter()

TUS_VERSION = '1.0.0'
EXTENSIONS = 'creation,termination,checksum'
CHECKSUMS = {'sha1': hashlib.sha1, 'sha256': hashlib.sha256, 'md5': hashlib.md5}
ID_PATTERN = re.compile(r'^[0-9a-f]{32}$')
INFO_FILE = 'upload.json'
# Bytes buffered before a disk write, and between upload.json updates.
WRITE_BLOCK = 4 << 20
SAVE_EVERY = 64 << 20

# In-process state: running hashes (id -> (offset covered, hasher)) and the
# uploads a PATCH is writing to now.
_hashers = {}
_busy = set()


# ------------------------------------------------------------- helpers --

def uploads_dir() -> str:
    """Folder holding every upload."""
    return os.path.join(settings.data_root(), 'uploads')


def free_space() -> tuple[int, int]:
    """(free, total) bytes on the disk holding the data root."""
    path = settings.data_root()
    while not os.path.exists(path):
        path = os.path.dirname(path)
    usage = shutil.disk_usage(path)
    return usage.free, usage.total


def max_upload() -> int | None:
    """Largest upload accepted (TB_MAX_UPLOAD bytes), or None."""
    value = os.environ.get('TB_MAX_UPLOAD')
    return int(value) if value else None


def _folder(upload_id: str) -> str | None:
    if not isinstance(upload_id, str) or not ID_PATTERN.match(upload_id):
        return None
    return os.path.join(uploads_dir(), upload_id)


def info(upload_id: str) -> dict | None:
    """The upload.json of an upload, or None if there is no such upload."""
    folder = _folder(upload_id)
    if folder is None:
        return None
    try:
        with open(os.path.join(folder, INFO_FILE)) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def path_of(upload_id: str) -> str:
    """Absolute path of the uploaded file (complete or not)."""
    record = info(upload_id)
    if record is None:
        raise ValueError('Upload %s not found' % upload_id)
    return os.path.join(_folder(upload_id), record['filename'])


def progress(record: dict) -> int:
    """Percentage received, rounded down."""
    return int(100 * record['offset'] / record['size']) if record['size'] else 100


def delete(upload_id: str) -> bool:
    """Remove an upload; False if there was none."""
    folder = _folder(upload_id)
    if folder is None or not os.path.isdir(folder):
        return False
    _hashers.pop(upload_id, None)
    shutil.rmtree(folder, ignore_errors=True)
    return True


def sanitise_filename(name: str) -> str:
    """A safe file name: last path segment, letters, digits, '.', '_', '-'."""
    name = os.path.basename(name.replace('\\', '/'))
    name = re.sub(r'[^A-Za-z0-9._-]', '_', name).lstrip('.')[:200]
    if not name or name == INFO_FILE:
        name = 'upload'
    return name


def _save(record: dict):
    """Write upload.json atomically."""
    target = os.path.join(_folder(record['id']), INFO_FILE)
    with open(target + '.tmp', 'w') as handle:
        json.dump(record, handle)
    os.replace(target + '.tmp', target)


def _sha256_of(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def _finish(record: dict):
    """Mark an upload complete, with the sha256 of the whole file."""
    covered, hasher = _hashers.pop(record['id'], (None, None))
    if hasher is not None and covered == record['size']:
        record['sha256'] = hasher.hexdigest()
    else:  # restarted mid-upload, or a chunk was discarded: read it back
        record['sha256'] = _sha256_of(path_of(record['id']))
    record['complete'] = True
    _save(record)


def _parse_metadata(header: str) -> dict:
    """Upload-Metadata: comma-separated "key base64value" pairs."""
    metadata = {}
    for pair in filter(None, (p.strip() for p in header.split(','))):
        key, _, value = pair.partition(' ')
        try:
            metadata[key] = base64.b64decode(value, validate=True).decode('utf-8') if value else ''
        except (ValueError, UnicodeDecodeError):
            raise ValueError('Upload-Metadata: %s is not valid base64' % key)
    return metadata


def _tus(status: int, detail: str | None = None, headers: dict | None = None) -> Response:
    """A response with the Tus-Resumable header (all tus responses have it)."""
    headers = {'Tus-Resumable': TUS_VERSION, **(headers or {})}
    return Response(detail, status_code=status, headers=headers,
                    media_type='text/plain' if detail else None)


def _version_error(request: Request) -> Response | None:
    # Lenient: a request without the header (e.g. the UI's plain DELETE) is
    # accepted; one asking for another version is not.
    version = request.headers.get('Tus-Resumable')
    if version is not None and version != TUS_VERSION:
        return _tus(412, 'Unsupported tus version', {'Tus-Version': TUS_VERSION})
    return None


# -------------------------------------------------------------- routes --

@router.options('/uploads')
@router.options('/uploads/{upload_id}')
def options(upload_id: str | None = None):
    headers = {'Tus-Version': TUS_VERSION, 'Tus-Extension': EXTENSIONS,
               'Tus-Checksum-Algorithm': ','.join(CHECKSUMS)}
    if max_upload():
        headers['Tus-Max-Size'] = str(max_upload())
    return _tus(204, headers=headers)


@router.post('/uploads')
def create(request: Request):
    """Creation: reserve an upload of Upload-Length bytes."""
    if error := _version_error(request):
        return error
    if request.headers.get('Upload-Defer-Length'):
        return _tus(400, 'Upload-Defer-Length is not supported')
    try:
        length = int(request.headers.get('Upload-Length', ''))
        if length < 0:
            raise ValueError
    except ValueError:
        return _tus(400, 'Upload-Length must be a non-negative integer')
    try:
        metadata = _parse_metadata(request.headers.get('Upload-Metadata', ''))
    except ValueError as error:
        return _tus(400, str(error))

    limit = max_upload()
    if limit is not None and length > limit:
        return _tus(413, 'The file is larger than the upload limit (%d bytes)' % limit)
    free, _ = free_space()
    if length > free:
        return _tus(413, 'Not enough free space on the server (%d bytes free)' % free)

    upload_id = secrets.token_hex(16)
    os.makedirs(_folder(upload_id))
    record = {
        'id': upload_id,
        'filename': sanitise_filename(metadata.get('filename') or metadata.get('name') or ''),
        'size': length,
        'offset': 0,
        'sha256': None,
        'complete': False,
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    _save(record)
    open(path_of(upload_id), 'wb').close()
    _hashers[upload_id] = (0, hashlib.sha256())
    if length == 0:
        _finish(record)
    # Relative, so the client resolves it against its own endpoint URL
    # (<base>api/uploads) and the proxy's base path is kept.
    return _tus(201, headers={'Location': 'uploads/' + upload_id, 'Upload-Offset': '0'})


@router.head('/uploads/{upload_id}')
def head(upload_id: str, request: Request):
    """Core: how much of the upload the server has."""
    if error := _version_error(request):
        return error
    record = info(upload_id)
    if record is None:
        return _tus(404, headers={'Cache-Control': 'no-store'})
    return _tus(200, headers={'Upload-Offset': str(record['offset']),
                              'Upload-Length': str(record['size']),
                              'Cache-Control': 'no-store'})


@router.patch('/uploads/{upload_id}')
async def patch(upload_id: str, request: Request):
    """Core: append the request body at Upload-Offset, streamed to disk."""
    if error := _version_error(request):
        return error
    if request.headers.get('Content-Type') != 'application/offset+octet-stream':
        return _tus(415, 'Content-Type must be application/offset+octet-stream')
    record = info(upload_id)
    if record is None:
        return _tus(404, 'Upload not found')
    try:
        offset = int(request.headers.get('Upload-Offset', ''))
    except ValueError:
        return _tus(400, 'Upload-Offset must be an integer')
    if offset != record['offset']:
        return _tus(409, 'Upload-Offset %d does not match the server offset %d'
                    % (offset, record['offset']),
                    {'Upload-Offset': str(record['offset'])})
    if record['complete']:
        return _tus(204, headers={'Upload-Offset': str(record['offset'])})

    checksum = None
    if header := request.headers.get('Upload-Checksum'):
        algorithm, _, expected = header.partition(' ')
        if algorithm not in CHECKSUMS:
            return _tus(400, 'Unsupported checksum algorithm %s' % algorithm)
        checksum = (CHECKSUMS[algorithm](), expected.strip())

    if upload_id in _busy:
        return _tus(423, 'Another request is writing to this upload')
    _busy.add(upload_id)
    try:
        return await _append(record, request, checksum)
    finally:
        _busy.discard(upload_id)


async def _append(record: dict, request: Request, checksum) -> Response:
    upload_id = record['id']
    start = record['offset']
    covered, hasher = _hashers.get(upload_id, (None, None))
    if covered != start:
        hasher = None  # the running hash no longer matches the file
    too_long = disconnected = False
    buffer = bytearray()
    unsaved = 0

    with open(path_of(upload_id), 'r+b') as handle:
        handle.truncate(start)
        handle.seek(start)

        async def flush():
            nonlocal unsaved
            if not buffer:
                return
            data = bytes(buffer)
            buffer.clear()
            await anyio.to_thread.run_sync(handle.write, data)
            if hasher is not None:
                hasher.update(data)
            if checksum:
                checksum[0].update(data)
            record['offset'] += len(data)
            unsaved += len(data)
            # Record progress now and then, so a restart loses little.
            if unsaved >= SAVE_EVERY and not checksum:
                await anyio.to_thread.run_sync(handle.flush)
                _save(record)
                unsaved = 0

        try:
            async for chunk in request.stream():
                if len(buffer) + len(chunk) > record['size'] - record['offset']:
                    too_long = True
                    break
                buffer.extend(chunk)
                if len(buffer) >= WRITE_BLOCK:
                    await flush()
        except ClientDisconnect:
            disconnected = True  # keep what arrived; the client resumes from HEAD
        if not too_long:
            await flush()
        handle.flush()

    if too_long:
        return _rollback(record, start, 413, 'The body is larger than Upload-Length')
    if checksum:
        if disconnected:  # a partial chunk cannot be verified
            return _rollback(record, start, 460, 'Checksum mismatch')
        digest = base64.b64encode(checksum[0].digest()).decode()
        if digest != checksum[1]:
            return _rollback(record, start, 460, 'Checksum mismatch')

    if hasher is not None:
        _hashers[upload_id] = (record['offset'], hasher)
    else:
        _hashers.pop(upload_id, None)
    if record['offset'] == record['size']:
        await anyio.to_thread.run_sync(_finish, record)
    else:
        _save(record)
    return _tus(204, headers={'Upload-Offset': str(record['offset'])})


def _rollback(record: dict, start: int, status: int, message: str) -> Response:
    """Discard the bytes of a rejected PATCH."""
    record['offset'] = start
    with open(path_of(record['id']), 'r+b') as handle:
        handle.truncate(start)
    _hashers.pop(record['id'], None)  # completion reads the file back
    _save(record)
    return _tus(status, message, {'Upload-Offset': str(start)})


@router.delete('/uploads/{upload_id}')
def terminate(upload_id: str, request: Request):
    """Termination: remove the upload and its file."""
    if error := _version_error(request):
        return error
    if upload_id in _busy:
        return _tus(423, 'The upload is being written; pause it first')
    if not delete(upload_id):
        return _tus(404, 'Upload not found')
    return _tus(204)
