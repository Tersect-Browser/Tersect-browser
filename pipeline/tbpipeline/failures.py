"""What went wrong in a build, step by step.

Every rule body runs inside `recorded(rule, wildcards)`. An exception it
raises is written to failures/<rule>[-<wildcards>].json in the working
directory before Snakemake reports it, so the builder service (and
`tb-dataset status`) can name the step, the accession or chromosome and the
pipeline's own message without parsing Snakemake's output:

    {"rule": "normalise", "wildcards": {"sample": "A"},
     "type": "StepError", "message": "No variants left for A ...", "time": ...}

The directory is cleared when a build starts.
"""
import contextlib
import json
import os
import shutil
import time

DIRECTORY = 'failures'


@contextlib.contextmanager
def recorded(rule, wildcards=None):
    try:
        yield
    except Exception as error:
        try:
            save(os.getcwd(), rule, dict(wildcards.items()) if wildcards else {}, error)
        except OSError:
            pass  # never hide the original error
        raise


def save(work_dir, rule, wildcards, error):
    directory = os.path.join(work_dir, DIRECTORY)
    os.makedirs(directory, exist_ok=True)
    name = '-'.join([rule] + ['%s' % v for v in wildcards.values()])
    record = {'rule': rule, 'wildcards': wildcards, 'type': type(error).__name__,
              'message': str(error).strip(), 'time': time.time()}
    url = getattr(error, 'url', None)
    if url:
        record['url'] = url
    path = os.path.join(directory, name + '.json')
    with open(path + '.tmp', 'w') as handle:
        json.dump(record, handle, indent=2)
    os.replace(path + '.tmp', path)


def read(work_dir):
    """Recorded failures, earliest first."""
    directory = os.path.join(work_dir, DIRECTORY)
    records = []
    if os.path.isdir(directory):
        for name in os.listdir(directory):
            if name.endswith('.json'):
                try:
                    with open(os.path.join(directory, name)) as handle:
                        records.append(json.load(handle))
                except (OSError, ValueError):
                    continue
    return sorted(records, key=lambda r: r.get('time', 0))


def clear(work_dir):
    shutil.rmtree(os.path.join(work_dir, DIRECTORY), ignore_errors=True)
