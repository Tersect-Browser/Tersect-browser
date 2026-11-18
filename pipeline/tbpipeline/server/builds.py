"""Dataset builds: a queue in MongoDB, one worker, progress over SSE.

    GET  /api/builds                      recent builds, newest first
    POST /api/builds                      {manifest, draft_id, rebuild_of} -> {id}
    GET  /api/builds/{id}                 Build (web/src/features/datasets/types.ts)
    GET  /api/builds/{id}/events          SSE: `event: build` per change
    POST /api/builds/{id}/cancel          stop it (queued or running)
    POST /api/builds/{id}/retry           queue it again; finished steps are kept
    GET  /api/builds/{id}/manifest.yaml

A build is a document in `dataset_builds` (the collection the pipeline's
store.record_build writes; the build id is its TB_BUILD_ID) and a folder:

    <data_root>/builds/<id>/manifest.yaml   what is built
    <data_root>/builds/<id>/build.log       downloads and Snakemake's output

Status changes only through _transition(), along TRANSITIONS:

    queued -> running -> succeeded | failed | cancelled
    queued -> cancelled;  failed | cancelled -> queued (retry)
    running -> queued     (the builder restarted mid-build; see below)

One worker thread runs one build at a time: it downloads the manifest's URLs
itself (the "Fetching files" stage, with byte counts), then runs
`python -m tbpipeline.cli build <manifest>` in its own process group and
follows its output (progress.SnakemakeProgress).

Restart policy: a build still marked running when the builder starts was
interrupted by the builder stopping, not by a problem in the build. It is
queued again at its old place, at the front, and resumes: Snakemake skips
finished steps and steps write to temporary names, so at most the steps that
were in flight run again. Failing it would only make the user press Retry for
the same effect.
"""
import asyncio
import collections
import datetime
import json
import logging
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from .. import failures, fetch, manifest as pipeline_manifest, settings
from . import manifests, progress

router = APIRouter()
log = logging.getLogger('tbpipeline.builder')

COLLECTION = 'dataset_builds'
DRAFTS = 'dataset_drafts'
SOURCE = 'builder'               # marks the builds this service made
LOG_LINES = 200
PUBLISH_EVERY = 1.0              # seconds between progress writes
STOP_GRACE = 30                  # seconds between SIGTERM and SIGKILL
HEARTBEAT = 15                   # seconds between SSE comments
PIPELINE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ACTIVE = ('queued', 'running')
TERMINAL = ('succeeded', 'failed', 'cancelled')
TRANSITIONS = {
    'queued': {'running', 'cancelled'},
    'running': {'succeeded', 'failed', 'cancelled', 'queued'},
    'failed': {'queued'},
    'cancelled': {'queued'},
    'succeeded': set(),
}


class Conflict(Exception):
    pass


# ----------------------------------------------------------- storage --

_client = None
_client_lock = threading.Lock()


def db():
    """The application database; one client per process (it is thread-safe)."""
    global _client
    with _client_lock:
        if _client is None:
            _client = settings.mongo()
        return _client[1]


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def iso(value):
    if not isinstance(value, datetime.datetime):
        return value
    if value.tzinfo is None:   # pymongo returns naive UTC
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.isoformat().replace('+00:00', 'Z')


def _seconds(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.timestamp()


def builds_dir():
    return os.path.join(settings.data_root(), 'builds')


def build_dir(build_id):
    return os.path.join(builds_dir(), build_id)


def manifest_path(build_id):
    return os.path.join(build_dir(build_id), 'manifest.yaml')


def format_bytes(count):
    """Decimal units, as web/src/features/datasets/format.ts writes them."""
    value, unit = float(count), 0
    units = ['B', 'KB', 'MB', 'GB', 'TB']
    while value >= 1000 and unit < len(units) - 1:
        value /= 1000
        unit += 1
    return ('%.1f %s' if unit >= 3 and value < 10 else '%.0f %s') % (value, units[unit])


def initial_stages():
    return [{'key': key, 'status': 'todo', 'done': None, 'total': None, 'detail': None,
             'elapsed': None, 'unit': None} for key in progress.STAGE_KEYS]


def _transition(build_id, to, only_from=None, **fields):
    """Move a build to status `to` if TRANSITIONS allow it from its current
    status (and it is in `only_from`, if given); returns whether it did.
    Atomic, so concurrent callers (worker, cancel, retry) cannot both win."""
    sources = [s for s, targets in TRANSITIONS.items() if to in targets
               and (only_from is None or s in only_from)]
    fields.update(status=to, updated_at=now())
    result = db()[COLLECTION].update_one(
        {'_id': build_id, 'status': {'$in': sources}}, {'$set': fields})
    return result.modified_count == 1


def get_doc(build_id):
    return db()[COLLECTION].find_one({'_id': build_id, 'source': SOURCE})


# ------------------------------------------------------ Build JSON --

def _queue():
    """Ids of queued builds in queue order, and the running build."""
    queued = [d['_id'] for d in db()[COLLECTION].find(
        {'source': SOURCE, 'status': 'queued'}, {'_id': 1}).sort('queued_at', 1)]
    running = db()[COLLECTION].find_one({'source': SOURCE, 'status': 'running'},
                                        {'dataset_id': 1})
    return queued, running


def _view_ids(dataset_ids):
    return {d['_id']: d.get('view_id') for d in db().datasets.find(
        {'_id': {'$in': list(set(dataset_ids))}}, {'view_id': 1})}


def to_api(doc, queue=None, view_ids=None):
    """A build document as the Build of types.ts."""
    if queue is None:
        queue = _queue()
    if view_ids is None:
        view_ids = _view_ids([doc['dataset_id']])
    queued, running = queue
    status = doc['status']
    started, finished = _seconds(doc.get('started_at')), _seconds(doc.get('finished_at'))
    if status == 'running' and started:
        elapsed = round(time.time() - started)
    elif started and finished and status in TERMINAL:
        elapsed = round(finished - started)
    else:
        elapsed = None
    position = queued.index(doc['_id']) + 1 if doc['_id'] in queued else None
    error = doc.get('error')
    return {
        'id': doc['_id'],
        'dataset_id': doc['dataset_id'],
        'status': status,
        'rebuild': bool(doc.get('rebuild')),
        'description': doc.get('description'),
        'queue_position': position,
        'ahead': running['dataset_id'] if position and running else None,
        'created_at': iso(doc.get('created_at')),
        'started_at': iso(doc.get('started_at')),
        'finished_at': iso(doc.get('finished_at')),
        'elapsed': elapsed,
        'started_by': doc.get('started_by'),
        'stages': doc.get('stages') or initial_stages(),
        'log': doc.get('log') or [],
        # record_build writes a plain string when the pipeline runs on its own.
        'error': error if isinstance(error, dict) else None,
        'summary': doc.get('summary'),
        'draft_id': doc.get('draft_id'),
        'view_id': view_ids.get(doc['dataset_id']),
    }


# ----------------------------------------------------------- create --

_create_lock = threading.Lock()
_wake = threading.Event()


def active_build(dataset_id):
    return db()[COLLECTION].find_one({'source': SOURCE, 'dataset_id': dataset_id,
                                      'status': {'$in': list(ACTIVE)}})


def create(data, draft_id=None, rebuild=False, description=None, started_by=None,
           rebuild_of=None):
    """Queue a build of validated manifest data; returns its id."""
    dataset_id = data['id']
    with _create_lock:
        if active_build(dataset_id):
            raise Conflict('A build of "%s" is already queued or running.' % dataset_id)
        build_id = uuid.uuid4().hex[:16]
        os.makedirs(build_dir(build_id), exist_ok=True)
        with open(manifest_path(build_id), 'w') as handle:
            handle.write(manifests.to_yaml(data, header=(
                'Built with the Tersect Browser dataset builder (build %s).\n'
                'Rebuild with: tb-dataset build %s' % (build_id, manifest_path(build_id)))))
        stamp = now()
        db()[COLLECTION].insert_one({
            '_id': build_id,
            'source': SOURCE,
            'dataset_id': dataset_id,
            'reference': (data.get('reference') or {}).get('id'),
            'description_text': data.get('description'),
            'accessions': len(data.get('samples') or []),
            'status': 'queued',
            'rebuild': rebuild,
            'rebuild_of': rebuild_of,
            'description': description,
            'draft_id': draft_id,
            'started_by': started_by,
            'manifest': manifest_path(build_id),
            'created_at': stamp,
            'queued_at': stamp,
            'updated_at': stamp,
            'started_at': None,
            'finished_at': None,
            'stages': initial_stages(),
            'log': [],
            'error': None,
            'summary': None,
        })
    if draft_id:
        db()[DRAFTS].update_one({'_id': draft_id}, {'$set': {'build_id': build_id}})
    _wake.set()
    return build_id


def last_manifest(dataset_id):
    """Path of the manifest the dataset was last built from successfully:
    a builder build, or the manifest a command-line build recorded."""
    for doc in db()[COLLECTION].find(
            {'source': SOURCE, 'dataset_id': dataset_id, 'status': 'succeeded'},
            {'manifest': 1}).sort('finished_at', -1):
        if doc.get('manifest') and os.path.isfile(doc['manifest']):
            return doc['manifest']
    dataset = db().datasets.find_one({'_id': dataset_id}, {'build.manifest': 1})
    path = ((dataset or {}).get('build') or {}).get('manifest')
    return path if path and os.path.isfile(path) else None


def manifest_data(path):
    """Manifest data of a manifest file, with local paths made absolute."""
    return manifests.absolutize(manifests.read_yaml(path), os.path.dirname(path))


# ----------------------------------------------------------- worker --

class _Cancelled(Exception):
    pass


class _Running:
    """The build the worker is running now."""

    def __init__(self, build_id):
        self.build_id = build_id
        self.cancel = threading.Event()
        self.process = None


_current = None
_current_lock = threading.Lock()
_worker = None


def start_worker():
    """Recover interrupted builds and start the queue worker (one build at a time)."""
    global _worker
    if _worker and _worker.is_alive():
        return
    try:
        _recover()
    except Exception:
        log.exception('Could not recover interrupted builds')
    _worker = threading.Thread(target=_loop, name='build-worker', daemon=True)
    _worker.start()


def _orphan_alive(doc):
    """Whether the pipeline process of an interrupted build is still running.

    Checked by command line, not just pid: pids are reused after a restart."""
    pid = doc.get('pid')
    if not pid:
        return False
    try:
        with open('/proc/%d/cmdline' % pid, 'rb') as handle:
            cmdline = handle.read().decode(errors='replace')
    except OSError:
        return False
    return doc['_id'] in cmdline and 'tbpipeline.cli' in cmdline


def _recover():
    for doc in db()[COLLECTION].find({'source': SOURCE, 'status': 'running'}):
        if _orphan_alive(doc):
            # Its output cannot be followed from here; stop it and resume.
            try:
                os.killpg(doc['pid'], signal.SIGTERM)
            except OSError:
                pass
            for _ in range(STOP_GRACE):
                if not _orphan_alive(doc):
                    break
                time.sleep(1)
        _append_log(doc['_id'], 'The builder restarted during this build; it is '
                                'queued again and resumes where it stopped.')
        # queued_at is kept, so it goes back to the front of the queue.
        _transition(doc['_id'], 'queued', pid=None, cancel_requested=False)
        log.info('Re-queued interrupted build %s', doc['_id'])


def _append_log(build_id, line):
    try:
        with open(os.path.join(build_dir(build_id), 'build.log'), 'a') as handle:
            handle.write(line + '\n')
    except OSError:
        pass


def _claim():
    """The next queued build, now running; None if the queue is empty."""
    from pymongo import ReturnDocument
    return db()[COLLECTION].find_one_and_update(
        {'source': SOURCE, 'status': 'queued'},
        {'$set': {'status': 'running', 'started_at': now(), 'finished_at': None,
                  'updated_at': now(), 'error': None, 'summary': None,
                  'stages': initial_stages(), 'log': [], 'cancel_requested': False,
                  'pid': None}},
        sort=[('queued_at', 1)], return_document=ReturnDocument.AFTER)


def _loop():
    global _current
    while True:
        try:
            doc = _claim()
        except Exception:
            log.exception('Could not read the build queue')
            time.sleep(10)
            continue
        if doc is None:
            _wake.wait(5)
            _wake.clear()
            continue
        running = _Running(doc['_id'])
        with _current_lock:
            _current = running
        try:
            Job(doc, running).run()
        except Exception as error:
            log.exception('Build %s failed in the builder', doc['_id'])
            _transition(doc['_id'], 'failed', finished_at=now(), error={
                'stage': 'fetch', 'message': 'The builder failed: %s' % error,
                'accession': None, 'file': None, 'chromosome': None, 'fix': None})
        finally:
            with _current_lock:
                _current = None


def request_cancel(build_id):
    """Cancel a queued build now, or stop the running one (SIGTERM to its
    process group, SIGKILL after STOP_GRACE seconds)."""
    if _transition(build_id, 'cancelled', only_from=('queued',), finished_at=now()):
        return True
    with _current_lock:
        running = _current if _current and _current.build_id == build_id else None
    if running is None:
        return False
    db()[COLLECTION].update_one({'_id': build_id}, {'$set': {'cancel_requested': True}})
    running.cancel.set()
    process = running.process
    if process and process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except OSError:
            pass

        def kill_later():
            try:
                process.wait(STOP_GRACE)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except OSError:
                    pass
        threading.Thread(target=kill_later, daemon=True).start()
    return True


class Job:
    """One run of one build, in the worker thread."""

    def __init__(self, doc, running):
        self.doc = doc
        self.id = doc['_id']
        self.running = running
        self.directory = build_dir(self.id)
        self.log_path = os.path.join(self.directory, 'build.log')
        self.tail = collections.deque(maxlen=LOG_LINES)
        self.fetch = {'key': 'fetch', 'status': 'todo', 'done': None, 'total': None,
                      'detail': None, 'elapsed': None, 'unit': 'files'}
        self.snakemake = None
        self.manifest = None
        self.started = time.time()
        self._published = 0

    # -- progress --

    def stages(self, status='running'):
        rest = (self.snakemake.stages(time.time(), status) if self.snakemake
                else initial_stages()[1:])
        if status == 'cancelled':
            for stage in rest:
                if stage['status'] == 'active':
                    stage['status'] = 'cancelled'
        return [dict(self.fetch)] + rest

    def line(self, text):
        self.tail.append(text)
        if self.snakemake:
            self.snakemake.feed(text)

    def note(self, text):
        """A line from the builder itself, in the log file and the tail."""
        with open(self.log_path, 'a') as handle:
            handle.write(text + '\n')
        self.line(text)

    def publish(self, force=False, **fields):
        if not force and time.time() - self._published < PUBLISH_EVERY:
            return
        self._published = time.time()
        fields.update(stages=self.stages(), log=progress.flag_errors(list(self.tail)),
                      updated_at=now())
        db()[COLLECTION].update_one({'_id': self.id, 'status': 'running'},
                                    {'$set': fields})

    def check_cancel(self):
        if self.running.cancel.is_set():
            raise _Cancelled()

    # -- the run --

    def run(self):
        os.makedirs(self.directory, exist_ok=True)
        self.note('== Build %s of "%s" started %s'
                  % (self.id, self.doc['dataset_id'], iso(now())))
        try:
            self.manifest = pipeline_manifest.load(manifest_path(self.id))
        except (OSError, pipeline_manifest.ManifestError) as error:
            self.note('Invalid manifest: %s' % error)
            return self.finish('failed', {'stage': 'fetch', 'message': str(error),
                                          'accession': None, 'file': None,
                                          'chromosome': None,
                                          'fix': {'step': 'review', 'kind': None,
                                                  'target': None}})
        m = self.manifest
        self.snakemake = progress.SnakemakeProgress(
            from_vcfs=m.from_vcfs, samples=len(m.samples),
            chromosomes=len(m.chromosomes) if m.chromosomes else None,
            annotate=m.annotate, rebuild=bool(self.doc.get('rebuild')))
        try:
            self.download()
            self.check_cancel()
            code = self.pipeline()
        except _Cancelled:
            return self.finish('cancelled')
        except fetch.DownloadError as error:
            self.note(str(error))
            self.fetch['status'] = 'failed'
            return self.finish('failed', progress.build_error(
                {'type': 'DownloadError', 'url': error.url, 'message': str(error)},
                self.files()))
        if self.running.cancel.is_set():
            return self.finish('cancelled')
        if code == 0:
            return self.finish('succeeded')
        return self.finish('failed', self.failure(code))

    def files(self):
        """The manifest's inputs, for naming files in a BuildError."""
        m = self.manifest
        return {'fasta': m.fasta, 'gff': m.gff, 'index': m.index,
                'samples': [{'name': s.name, 'vcf': s.vcf} for s in m.samples]}

    def download(self):
        """The fetch stage: every URL of the manifest into the download cache,
        before Snakemake (whose steps then find them there)."""
        m = self.manifest
        urls = []
        for location in [m.fasta, m.gff, m.index] + [s.vcf for s in m.samples]:
            if location and pipeline_manifest.is_url(location) and location not in urls:
                urls.append(location)
        started = time.time()
        self.fetch.update(status='active', done=0, total=len(urls))
        if not urls:
            self.fetch.update(status='done', detail='no downloads', elapsed=0,
                              done=None, total=None)
            self.publish(force=True)
            return
        sizes = {}
        for url in urls:
            path = fetch.cache_path(url)
            if os.path.exists(path):
                sizes[url] = os.path.getsize(path)

        def describe(received=None):
            known = sum(sizes.values())
            text = '%d file%s · %s' % (len(urls), '' if len(urls) == 1 else 's',
                                       format_bytes(known))
            if received is not None:
                text += ' · %s downloaded' % format_bytes(received)
            return text

        self.publish(force=True)
        for i, url in enumerate(urls):
            self.check_cancel()

            def report(done, total, url=url):
                self.check_cancel()
                if total:
                    sizes[url] = total
                self.fetch.update(detail=describe(done), elapsed=round(time.time() - started))
                self.publish()
            if url not in sizes:
                self.note('Downloading %s' % url)
            # Downloads in the worker thread; fetch.cached resumes partial files.
            path = fetch.cached(url, progress=report)
            sizes[url] = os.path.getsize(path)
            self.fetch.update(done=i + 1, detail=describe(), elapsed=round(time.time() - started))
            self.publish(force=True)
        self.fetch.update(status='done', detail=describe())

    def pipeline(self):
        """Run tb-dataset build and follow its output; returns the exit code."""
        command = [sys.executable, '-m', 'tbpipeline.cli', 'build', manifest_path(self.id),
                   '--cores', os.environ.get('TB_BUILD_CORES', str(os.cpu_count() or 2))]
        env = dict(os.environ, TB_BUILD_ID=self.id, TB_BUILD_MANAGED='1',
                   PYTHONUNBUFFERED='1',
                   PYTHONPATH=os.pathsep.join(
                       [PIPELINE_DIR] + [p for p in os.environ.get('PYTHONPATH', '').split(
                           os.pathsep) if p]))
        work = settings.work_dir(self.manifest.slug)
        with open(self.log_path, 'ab') as out, open(self.log_path, 'r', errors='replace') as reader:
            reader.seek(0, os.SEEK_END)
            with _current_lock:
                self.running.process = process = subprocess.Popen(
                    command, stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                    cwd=self.directory, env=env, start_new_session=True)
            if self.running.cancel.is_set():   # cancelled while starting
                os.killpg(process.pid, signal.SIGTERM)
            db()[COLLECTION].update_one({'_id': self.id}, {'$set': {'pid': process.pid}})
            pending = ''
            while True:
                exited = process.poll() is not None
                chunk = reader.read()
                if chunk:
                    pending += chunk
                    *lines, pending = pending.split('\n')
                    for text in lines:
                        self.line(text)
                self.learn_chromosomes(work)
                self.publish()
                if exited and not chunk:
                    break
                time.sleep(0.5)
            if pending:
                self.line(pending)
        return process.returncode

    def learn_chromosomes(self, work):
        """Chromosome count from the reference step, once it is known to be
        this build's (the manifest may not list them)."""
        p = self.snakemake
        if p.chromosomes is not None or not p.table_seen:
            return
        reference_ran = any(j['rule'] == 'reference' and j['end'] for j in p.jobs.values())
        if p.table.get('reference') and not reference_ran:
            return
        try:
            with open(os.path.join(work, 'chromosomes.json')) as handle:
                p.chromosomes = len(json.load(handle))
        except (OSError, ValueError):
            pass

    def failure(self, code):
        """BuildError for a failed pipeline run."""
        work = settings.work_dir(self.manifest.slug)
        recorded = [r for r in failures.read(work) if r.get('time', 0) >= self.started - 1]
        if recorded:
            return progress.build_error(recorded[0], self.files())
        # Failed outside a step: the command line's own message, or Snakemake's.
        message = None
        for text in reversed(self.tail):
            text = text.strip()
            if text.startswith(('Invalid manifest:', 'Another build of')):
                message = text
                break
        failed = self.snakemake.failed[0] if self.snakemake.failed else {}
        if message is None:
            message = ('A pipeline step failed (%s); see the log.' % failed['rule']
                       if failed else 'The pipeline stopped (exit code %s); see the log.' % code)
        return progress.build_error({'rule': failed.get('rule'),
                                     'wildcards': failed.get('wildcards'),
                                     'stage': None if failed else 'reference',
                                     'message': message}, self.files())

    def summary(self):
        work = settings.work_dir(self.manifest.slug)
        dataset = db().datasets.find_one({'_id': self.manifest.id}) or {}
        build = dataset.get('build') or {}
        try:
            with open(os.path.join(work, 'chromosomes.json')) as handle:
                chromosomes = len(json.load(handle))
        except (OSError, ValueError):
            chromosomes = len(self.manifest.chromosomes or [])
        accessions = build.get('samples') or len(self.manifest.samples)
        if not accessions and dataset.get('view_id'):
            view = db().views.find_one({'_id': dataset['view_id']}) or {}
            accessions = len((view.get('settings') or {}).get('accession_infos') or [])
        return {'accessions': accessions,
                'variants': build.get('variants'),
                'chromosomes': chromosomes,
                'duration': round(time.time() - _seconds(self.doc['started_at']))
                if self.doc.get('started_at') else round(time.time() - self.started)}

    def finish(self, status, error=None):
        if status == 'failed' and self.fetch['status'] == 'active':
            self.fetch['status'] = 'failed'
        if status == 'cancelled' and self.fetch['status'] == 'active':
            self.fetch['status'] = 'cancelled'
        fields = {'finished_at': now(), 'pid': None, 'error': error}
        if status == 'succeeded':
            fields['summary'] = self.summary()
            self.note('== Build succeeded')
        elif status == 'cancelled':
            self.note('== Build cancelled')
        else:
            self.note('== Build failed: %s' % (error or {}).get('message'))
        fields['stages'] = self.stages(status)
        fields['log'] = progress.flag_errors(list(self.tail))
        _transition(self.id, status, **fields)
        if status == 'succeeded' and self.doc.get('draft_id'):
            db()[DRAFTS].delete_one({'_id': self.doc['draft_id'], 'build_id': self.id})


# --------------------------------------------------------- endpoints --

class BuildRequest(BaseModel):
    manifest: dict
    draft_id: str | None = None
    rebuild_of: str | None = None


def started_by(request: Request):
    return request.headers.get('x-forwarded-user') or request.headers.get('x-remote-user') or None


def invalid(issues):
    first = issues[0]['message']
    more = len(issues) - 1
    return JSONResponse(status_code=400, content={
        'detail': 'The manifest has problems: %s%s' % (
            first, ' (and %d more)' % more if more else ''),
        'errors': issues})


def _shift_rows(issues, offset):
    """Issues about merged samples, renumbered as the added samples."""
    out = []
    for issue in issues:
        row = issue.get('row')
        if row is not None and row >= offset:
            issue = dict(issue, row=row - offset, field=re.sub(
                r'^samples\[(\d+)\]', lambda m: 'samples[%d]' % (int(m.group(1)) - offset),
                issue['field']))
        out.append(issue)
    return out


def _not_found(build_id):
    raise HTTPException(404, 'No build %s' % build_id)


@router.get('/builds')
def list_builds():
    docs = list(db()[COLLECTION].find({'source': SOURCE}).sort('created_at', -1).limit(50))
    queue = _queue()
    view_ids = _view_ids([d['dataset_id'] for d in docs])
    return [to_api(d, queue, view_ids) for d in docs]


@router.post('/builds')
def post_build(body: BuildRequest, request: Request):
    if body.rebuild_of:
        base_path = last_manifest(body.rebuild_of)
        if not base_path:
            raise HTTPException(404, 'No manifest is known for "%s", so accessions cannot '
                                     'be added to it.' % body.rebuild_of)
        base = manifest_data(base_path)
        if base.get('index'):
            raise HTTPException(400, '"%s" was built from an existing Tersect index; '
                                     'accessions cannot be added to it.' % body.rebuild_of)
        added, issues = manifests.to_data(body.manifest)
        # Reference and options come from the base; only the samples count.
        issues = [i for i in issues if i['field'].startswith('samples')]
        failed = {i['field'] for i in issues}
        data = manifests.merge_added(base, added)
        offset = len(base.get('samples') or [])
        issues += [i for i in _shift_rows(manifests.check(data), offset)
                   if i['field'] not in failed]
        if not added.get('samples'):
            issues.append({'field': 'samples', 'row': None, 'message': 'Add at least one accession.'})
        count = len(added.get('samples') or [])
        description = 'adding %d accession%s' % (count, '' if count == 1 else 's')
        rebuild = True
    else:
        data, issues = manifests.validate(body.manifest)
        description, rebuild = None, False
        if data.get('id') and db().datasets.find_one({'_id': data['id']}, {'_id': 1}):
            # Building over a published dataset replaces it: a rebuild.
            rebuild, description = True, 'rebuild'
    if issues:
        return invalid(issues)
    try:
        build_id = create(data, draft_id=body.draft_id, rebuild=rebuild,
                          description=description, started_by=started_by(request),
                          rebuild_of=body.rebuild_of)
    except Conflict as error:
        raise HTTPException(409, str(error))
    return {'id': build_id}


@router.get('/builds/{build_id}')
def get_build(build_id: str):
    doc = get_doc(build_id) or _not_found(build_id)
    return to_api(doc)


@router.get('/builds/{build_id}/events')
async def build_events(build_id: str, request: Request):
    if not await run_in_threadpool(get_doc, build_id):
        _not_found(build_id)

    async def stream():
        last, beat = None, time.time()
        while not await request.is_disconnected():
            doc = await run_in_threadpool(get_doc, build_id)
            if doc is None:
                return
            build = await run_in_threadpool(to_api, doc)
            payload = json.dumps(build)
            if payload != last:
                last = payload
                yield 'event: build\ndata: %s\n\n' % payload
                if build['status'] in TERMINAL:
                    return
            if time.time() - beat >= HEARTBEAT:
                beat = time.time()
                yield ': heartbeat\n\n'
            await asyncio.sleep(1)

    return StreamingResponse(stream(), media_type='text/event-stream',
                             headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@router.post('/builds/{build_id}/cancel')
def cancel_build(build_id: str):
    doc = get_doc(build_id) or _not_found(build_id)
    if doc['status'] in TERMINAL:
        raise HTTPException(409, 'The build has already %s.' % doc['status'])
    if not request_cancel(build_id):
        raise HTTPException(409, 'The build could not be cancelled (it may just have finished).')
    # The worker records the outcome once the pipeline has stopped.
    for _ in range(40):
        doc = get_doc(build_id)
        if doc['status'] in TERMINAL:
            break
        time.sleep(0.25)
    return to_api(doc)


@router.post('/builds/{build_id}/retry')
def retry_build(build_id: str):
    doc = get_doc(build_id) or _not_found(build_id)
    if doc['status'] not in ('failed', 'cancelled'):
        raise HTTPException(409, 'Only a failed or cancelled build can be retried.')
    with _create_lock:
        other = active_build(doc['dataset_id'])
        if other and other['_id'] != build_id:
            raise HTTPException(409, 'Another build of "%s" is queued or running.'
                                % doc['dataset_id'])
        if not _transition(build_id, 'queued', queued_at=now(), error=None,
                           finished_at=None, summary=None, stages=initial_stages()):
            raise HTTPException(409, 'The build could not be queued again.')
    _append_log(build_id, '== Queued again (retry); finished steps are kept.')
    _wake.set()
    return to_api(get_doc(build_id))


@router.get('/builds/{build_id}/manifest.yaml')
def build_manifest(build_id: str):
    doc = get_doc(build_id) or _not_found(build_id)
    path = manifest_path(doc['_id'])
    if not os.path.isfile(path):
        raise HTTPException(404, 'The manifest of this build is gone.')
    with open(path) as handle:
        return PlainTextResponse(handle.read(), media_type='text/yaml', headers={
            'Content-Disposition': 'attachment; filename="%s.yaml"'
                                   % pipeline_manifest.slug(doc['dataset_id'])})
