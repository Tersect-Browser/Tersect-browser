"""Bring inputs into the working directory.

URLs are downloaded once into a shared cache (keyed by URL) and linked from
there, so rebuilding a dataset or building another one from the same files
does not download them again. Local files are linked, not copied.
"""
import hashlib
import os
import shutil
import time
import urllib.request

from .manifest import is_url
from . import settings

CHUNK = 1 << 20


def _download(url, target, attempts=4):
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
                    shutil.copyfileobj(response, out, CHUNK)
            os.replace(part, target)
            return
        except OSError as error:
            if attempt == attempts:
                raise RuntimeError('Download failed after %d attempts: %s (%s)'
                                   % (attempts, url, error))
            wait = 5 * attempt
            print('  download interrupted (%s); retrying in %ds' % (error, wait))
            time.sleep(wait)


def cached(location):
    """Local path of `location`, downloading it into the cache if a URL."""
    if not is_url(location):
        return location
    cache = settings.cache_dir()
    os.makedirs(cache, exist_ok=True)
    key = hashlib.sha256(location.encode()).hexdigest()[:16]
    name = os.path.basename(location.split('?')[0]) or 'download'
    target = os.path.join(cache, '%s-%s' % (key, name))
    if not os.path.exists(target):
        print('Downloading %s' % location)
        _download(location, target)
    return target


def link(location, target):
    """Make `target` point at the (possibly downloaded) input."""
    source = cached(location)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    if os.path.lexists(target):
        os.remove(target)
    os.symlink(source, target)
