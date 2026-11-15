"""Datasets: published ones and the builds that make them.

    GET    /api/datasets                       ManagedDataset[]
    POST   /api/datasets/validate              {manifest} -> {errors: ValidationIssue[]}
    POST   /api/datasets/manifest.yaml         {manifest} -> YAML
    PATCH  /api/datasets/{id}                  {listed}: show in or hide from the public list
    DELETE /api/datasets/{id}                  unpublish (tb-dataset remove)
    POST   /api/datasets/{id}/add              Draft for adding accessions
    POST   /api/datasets/{id}/rebuild          {id} of a new build
    GET    /api/datasets/{id}/manifest.yaml    the manifest it was last built from

A dataset is published when store.publish has written its record to the
`datasets` collection. A dataset that only has builds (in progress, or
failed before publishing) is listed too, from its latest build.

Dataset ids may contain any printable character, "/" included, hence the
`:path` parameters.
"""
import json
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from .. import manifest as pipeline_manifest, settings, store
from . import builds, drafts, manifests, progress

router = APIRouter()


class ManifestRequest(BaseModel):
    manifest: dict


def _yaml_response(text, name):
    return PlainTextResponse(text, media_type='text/yaml', headers={
        'Content-Disposition': 'attachment; filename="%s.yaml"' % (
            pipeline_manifest.slug(name) or 'manifest')})


# ---------------------------------------------------------- manifests --

@router.post('/datasets/validate')
def validate(body: ManifestRequest):
    _, issues = manifests.validate(body.manifest)
    return {'errors': issues}


@router.post('/datasets/manifest.yaml')
def manifest_yaml(body: ManifestRequest):
    data, _ = manifests.to_data(body.manifest, resolve=manifests.lenient_resolve)
    return _yaml_response(manifests.to_yaml(data), data.get('id') or 'manifest')


# ------------------------------------------------------------ listing --

def _latest_builds():
    """Latest builder build per dataset id (not of removed datasets)."""
    latest = {}
    for doc in builds.db()[builds.COLLECTION].find(
            {'source': builds.SOURCE, 'dataset_removed': {'$ne': True}}).sort('created_at', -1):
        latest.setdefault(doc['dataset_id'], doc)
    return latest


def _accession_counts(view_ids):
    counts = {}
    for view in builds.db().views.find({'_id': {'$in': [v for v in view_ids if v]}},
                                       {'settings.accession_infos.id': 1}):
        counts[view['_id']] = len((view.get('settings') or {}).get('accession_infos') or [])
    return counts


def managed(dataset, build, counts, manifest_known):
    """ManagedDataset (types.ts) from a published record and/or a build."""
    dataset_id = (dataset or build)['_id'] if dataset else build['dataset_id']
    status = 'ready'
    if build and build['status'] in builds.ACTIVE:
        status = 'building'
    elif build and build['status'] == 'failed':
        status = 'failed'
    elif build and build['status'] == 'cancelled' and not dataset:
        status = 'failed'
    accessions = counts.get((dataset or {}).get('view_id'))
    if accessions is None:
        accessions = (build or {}).get('accessions') or 0
    return {
        'id': dataset_id,
        'description': (dataset or {}).get('description') or (build or {}).get('description_text'),
        'reference': (dataset or {}).get('reference') or (build or {}).get('reference') or '',
        'accessions': accessions,
        'status': status,
        'progress': progress.percent(build.get('stages')) if status == 'building' else None,
        'build_id': build['_id'] if build else None,
        'view_id': (dataset or {}).get('view_id'),
        'has_manifest': manifest_known,
        # Unpublished datasets have nothing to list yet.
        'listed': bool(dataset.get('listed', True)) if dataset else False,
    }


def _has_manifest(dataset, build):
    if build and build['status'] == 'succeeded' and os.path.isfile(build.get('manifest') or ''):
        return True
    path = ((dataset or {}).get('build') or {}).get('manifest')
    if path and os.path.isfile(path):
        return True
    return builds.last_manifest((dataset or {}).get('_id') or build['dataset_id']) is not None


@router.get('/datasets')
def list_datasets():
    published = {d['_id']: d for d in builds.db().datasets.find()}
    latest = _latest_builds()
    counts = _accession_counts([d.get('view_id') for d in published.values()])
    result = []
    for dataset_id in list(published) + [i for i in latest if i not in published]:
        dataset, build = published.get(dataset_id), latest.get(dataset_id)
        result.append(managed(dataset, build, counts, _has_manifest(dataset, build)))
    return result


# ------------------------------------------------------------ actions --

def _manifest_of(dataset_id):
    path = builds.last_manifest(dataset_id)
    if not path:
        raise HTTPException(404, 'No manifest is known for "%s".' % dataset_id)
    return path


class ListedRequest(BaseModel):
    listed: bool


@router.patch('/datasets/{dataset_id:path}')
def set_listed(dataset_id: str, body: ListedRequest):
    """List or unlist a published dataset. An unlisted dataset is left out
    of the public dataset list (tbapi /datasets) but keeps working: its share
    links open, and it stays here, on Home, for management."""
    result = builds.db().datasets.update_one({'_id': dataset_id},
                                             {'$set': {'listed': body.listed}})
    if not result.matched_count:
        raise HTTPException(404, 'No published dataset "%s"' % dataset_id)
    return {'id': dataset_id, 'listed': body.listed}


@router.delete('/datasets/{dataset_id:path}', status_code=204)
def delete_dataset(dataset_id: str):
    active = builds.active_build(dataset_id)
    if active:
        raise HTTPException(409, 'A build of "%s" is %s; cancel it before deleting the dataset.'
                            % (dataset_id, active['status']))
    removed = store.remove_dataset(dataset_id)
    # Keep the build history, but stop listing the dataset.
    marked = builds.db()[builds.COLLECTION].update_many(
        {'source': builds.SOURCE, 'dataset_id': dataset_id},
        {'$set': {'dataset_removed': True}}).matched_count
    if not removed and not marked:
        raise HTTPException(404, 'No dataset "%s"' % dataset_id)


def _sequences(slug):
    """The reference sequences of the last build, as SequenceInfo."""
    try:
        with open(os.path.join(settings.work_dir(slug), 'chromosomes.json')) as handle:
            return [{'name': c['name'], 'length': c['size']} for c in json.load(handle)]
    except (OSError, ValueError, KeyError):
        return None


@router.post('/datasets/{dataset_id:path}/add')
def add_accessions(dataset_id: str):
    data = builds.manifest_data(_manifest_of(dataset_id))
    if data.get('index') or not data.get('samples'):
        raise HTTPException(400, '"%s" was built from an existing Tersect index; '
                                 'accessions cannot be added to it.' % dataset_id)
    dataset = builds.db().datasets.find_one({'_id': dataset_id}) or {}
    count = _accession_counts([dataset.get('view_id')]).get(dataset.get('view_id'))
    return drafts.create({
        'mode': 'add',
        'base_dataset': dataset_id,
        'base_accessions': count if count is not None else len(data['samples']),
        'step': 'accessions',
        'form': manifests.form_from(data, _sequences(pipeline_manifest.slug(dataset_id))),
        'build_id': None,
    })


@router.post('/datasets/{dataset_id:path}/rebuild')
def rebuild(dataset_id: str, request: Request):
    data = builds.manifest_data(_manifest_of(dataset_id))
    issues = manifests.check(data)
    if issues:
        return builds.invalid(issues)
    try:
        build_id = builds.create(data, rebuild=True, description='rebuild',
                                 started_by=builds.started_by(request), rebuild_of=dataset_id)
    except builds.Conflict as error:
        raise HTTPException(409, str(error))
    return {'id': build_id}


@router.get('/datasets/{dataset_id:path}/manifest.yaml')
def dataset_manifest(dataset_id: str):
    with open(_manifest_of(dataset_id)) as handle:
        return _yaml_response(handle.read(), dataset_id)
