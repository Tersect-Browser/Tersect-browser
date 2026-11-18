"""Files a dataset leaves on disk, and removing them when it is deleted.

Deleting a dataset from the browser used to keep every file, so disks filled
up with downloads and build directories of datasets nobody could see any more.
`plan()` lists what belongs to one dataset alone:

    datasets/<slug>/                  published index and tables
    pipeline/<slug>/                  the build's work directory
    gp_data_copy/genomes/<slug>/      genome browser files
    gp_data_copy/jbrowse/<slug>.json
    builds/<build id>/                manifests and logs of its builds
    pipeline/cache/<hash>-<name>      downloads only this dataset uses
    uploads/<upload id>/              uploads only this dataset uses
    pipeline/snpeff/<db>.config       the snpEff database its build used,
    pipeline/snpeff/data/<db>/        if no other dataset's build uses it

Never listed: files in server folders (the user's own data, read in place),
and any download, upload or snpEff database that another dataset's builds or
a draft still refer to. A snpEff database is made per reference genome and
reused by every dataset on it, so it goes with the last of them.

Every path is checked to be a direct child of the directory it is expected in,
under the data root, before anything is removed: dataset ids are free text.
"""
import json
import os
import re
import shutil

from .. import fetch, manifest as pipeline_manifest, settings
from . import builds, drafts, uploads

# (key, label) of the groups reported to the UI, in display order.
GROUPS = (('published', 'Published dataset'),
          ('work', 'Build files and logs'),
          ('inputs', 'Downloads and uploads'),
          ('annotation', 'Variant effect database'))

SAFE_NAME = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')


def _snpeff_database(work_dir: str) -> str | None:
    """Name of the snpEff database a build used (its snpeff.json), if any."""
    try:
        with open(os.path.join(work_dir, 'snpeff.json')) as handle:
            name = json.load(handle).get('database')
    except (OSError, ValueError, AttributeError):
        return None
    return name if isinstance(name, str) and SAFE_NAME.match(name) else None


def _snpeff_paths(slug: str) -> list[str]:
    """The dataset's snpEff database, unless another build directory uses it.

    "In use" is judged from the build directories on disk, whoever they
    belong to: a leftover directory of a deleted dataset keeps its database,
    which errs on the side of keeping.
    """
    pipeline_root = os.path.dirname(settings.work_dir(slug))
    name = _snpeff_database(settings.work_dir(slug))
    if not name:
        return []
    try:
        siblings = os.listdir(pipeline_root)
    except OSError:
        return []
    for other in siblings:
        if other != slug and _snpeff_database(os.path.join(pipeline_root, other)) == name:
            return []
    root = settings.snpeff_dir()
    candidates = ((os.path.join(root, name + '.config'), root),
                  (os.path.join(root, 'data', name), os.path.join(root, 'data')))
    return [path for path, parent in candidates if _child_of(path, parent)]


def manifest_inputs(data: dict) -> list[str]:
    """Locations (URLs or paths) of every input file a manifest names."""
    reference = data.get('reference') or {}
    locations = [reference.get('fasta'), reference.get('gff'), data.get('index')]
    locations += [(sample or {}).get('vcf') for sample in data.get('samples') or []]
    return [location for location in locations if isinstance(location, str) and location]


def _manifest_docs(query: dict) -> list[dict]:
    return list(builds.db()[builds.COLLECTION].find(
        dict(query, source=builds.SOURCE), {'manifest': 1, 'dataset_id': 1}))


def _inputs_of(docs, extra_paths=()) -> set[str]:
    """Input locations named by the manifests of some builds."""
    found = set()
    paths = {doc.get('manifest') for doc in docs} | set(extra_paths)
    for path in paths:
        if path and os.path.isfile(path):
            try:
                found.update(manifest_inputs(builds.manifest_data(path)))
            except (OSError, ValueError):
                continue    # an unreadable manifest names nothing we would remove
    return found


def _upload_folder(location: str) -> str | None:
    """The upload's folder, if `location` is a file directly inside one."""
    root = os.path.realpath(uploads.uploads_dir())
    folder = os.path.dirname(os.path.realpath(location))
    return folder if os.path.dirname(folder) == root else None


def _own_files(location: str) -> list[str]:
    """Files this service made for an input: its download or its upload."""
    if pipeline_manifest.is_url(location):
        path = fetch.cache_path(location)
        return [path, path + '.part']
    folder = _upload_folder(location)
    return [folder] if folder else []      # a server-folder file: not ours


def _child_of(path: str, parent: str) -> bool:
    """`path` exists and is a direct child of `parent`, under the data root."""
    root = os.path.realpath(settings.data_root())
    parent = os.path.realpath(parent)
    real = os.path.realpath(path)
    return (os.path.lexists(path) and os.path.dirname(real) == parent
            and parent.startswith(root + os.sep) and os.path.basename(real) not in ('', '.', '..'))


def plan(dataset_id: str) -> dict[str, list[str]]:
    """Paths to remove with the dataset, by group (see GROUPS)."""
    slug = pipeline_manifest.slug(dataset_id)
    db = builds.db()
    groups: dict[str, list[str]] = {key: [] for key, _ in GROUPS}

    # Another dataset whose id gives the same folder name keeps the folders.
    others = {d['_id'] for d in db.datasets.find({}, {'_id': 1})}
    others |= {d['dataset_id'] for d in _manifest_docs({'dataset_removed': {'$ne': True}})}
    others.discard(dataset_id)
    shared_slug = any(pipeline_manifest.slug(other) == slug for other in others)

    if slug not in ('', '.', '..') and not shared_slug:
        served = settings.served_dir()
        for group, path, parent in (
                ('published', settings.dataset_dir(slug), os.path.dirname(settings.dataset_dir(slug))),
                ('published', os.path.join(served, 'genomes', slug), os.path.join(served, 'genomes')),
                ('published', os.path.join(served, 'jbrowse', slug + '.json'),
                 os.path.join(served, 'jbrowse')),
                ('work', settings.work_dir(slug), os.path.dirname(settings.work_dir(slug)))):
            if _child_of(path, parent):
                groups[group].append(path)
        # Read now: the work directory that names the database is removed too.
        groups['annotation'] = _snpeff_paths(slug)

    mine = _manifest_docs({'dataset_id': dataset_id})
    for doc in mine:
        path = builds.build_dir(str(doc['_id']))
        if _child_of(path, builds.builds_dir()):
            groups['work'].append(path)

    # Inputs: what this dataset's manifests name, minus what anything else uses.
    dataset = db.datasets.find_one({'_id': dataset_id}, {'build.manifest': 1}) or {}
    wanted = _inputs_of(mine, [(dataset.get('build') or {}).get('manifest')])
    in_use = _inputs_of(_manifest_docs({'dataset_id': {'$in': sorted(others)}}),
                        [((d.get('build') or {}).get('manifest'))
                         for d in db.datasets.find({'_id': {'$in': sorted(others)}},
                                                   {'build.manifest': 1})])
    keep = {path for location in in_use for path in _own_files(location)}
    for draft in drafts.collection().find({}, {'form': 1}):
        for upload_id in drafts._upload_ids(draft.get('form')):
            folder = uploads._folder(upload_id)
            if folder:
                keep.add(os.path.realpath(folder))
    for location in sorted(wanted):
        for path in _own_files(location):
            parent = (os.path.realpath(uploads.uploads_dir()) if os.path.isdir(path)
                      else settings.cache_dir())
            if path not in keep and os.path.realpath(path) not in keep and _child_of(path, parent):
                groups['inputs'].append(path)
    return {key: sorted(set(paths)) for key, paths in groups.items()}


def size_of(path: str) -> int:
    """Bytes under a file or directory (links are not followed)."""
    if os.path.islink(path) or os.path.isfile(path):
        return os.lstat(path).st_size
    total = 0
    for folder, _, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(folder, name)).st_size
            except OSError:
                pass
    return total


def measure(groups: dict[str, list[str]]) -> dict:
    """{'bytes': total, 'parts': [{key, label, bytes}]} for the delete dialog."""
    parts = [{'key': key, 'label': label, 'bytes': sum(size_of(p) for p in groups.get(key, []))}
             for key, label in GROUPS]
    return {'bytes': sum(part['bytes'] for part in parts), 'parts': parts}


def remove(groups: dict[str, list[str]]) -> int:
    """Delete the planned paths; returns the bytes freed. A path that cannot
    be removed is left (and not counted) rather than failing the delete."""
    freed = 0
    for paths in groups.values():
        for path in paths:
            size = size_of(path)
            try:
                if os.path.isdir(path) and not os.path.islink(path):
                    shutil.rmtree(path)
                else:
                    os.remove(path)
                freed += size
            except OSError:
                continue
    return freed

