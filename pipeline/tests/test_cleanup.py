"""Deleting a dataset's files: what is listed, what is spared, and that
nothing outside the dataset's own folders can be reached."""
import os

import pytest
import yaml

from tbpipeline import fetch, settings
from tbpipeline.server import builds, cleanup, drafts, uploads

URL_A = 'https://example.org/data/a.vcf.gz'
URL_SHARED = 'https://example.org/ref/genome.fa.gz'
UP1, UP2 = 'a' * 32, 'b' * 32      # upload ids are 32 hex characters


class Cursor(list):
    def sort(self, *args, **kwargs):
        return self


class Collection:
    """The few pymongo calls cleanup makes, over a list of dicts."""

    def __init__(self, docs=()):
        self.docs = list(docs)

    def _match(self, doc, query):
        for key, want in query.items():
            value = doc
            for part in key.split('.'):
                value = (value or {}).get(part) if isinstance(value, dict) else None
            if isinstance(want, dict):
                if '$ne' in want and value == want['$ne']:
                    return False
                if '$in' in want and value not in want['$in']:
                    return False
            elif value != want:
                return False
        return True

    def find(self, query=None, projection=None):
        return Cursor(d for d in self.docs if self._match(d, query or {}))

    def find_one(self, query=None, projection=None):
        return next(iter(self.find(query)), None)


class Db:
    def __init__(self, **collections):
        self._collections = collections

    def __getattr__(self, name):
        return self._collections.setdefault(name, Collection())

    __getitem__ = __getattr__


def write(path, content='x' * 1000):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as handle:
        handle.write(content)
    return path


@pytest.fixture
def world(tmp_path, monkeypatch):
    """A data root with two datasets, A and B, that share a reference download.
    A also has its own VCF download, an upload, and a server-folder file."""
    root = str(tmp_path / 'data')
    shared = str(tmp_path / 'shared')          # a server folder, outside the data root
    monkeypatch.setattr(settings, 'data_root', lambda: root)
    upload = write(os.path.join(root, 'uploads', UP1, 'mine.vcf.gz'))
    draft_upload = write(os.path.join(root, 'uploads', UP2, 'draft.vcf.gz'))
    server_file = write(os.path.join(shared, 'big.vcf.gz'))

    def manifest(build_id, data):
        return write(os.path.join(root, 'builds', build_id, 'manifest.yaml'), yaml.safe_dump(data))

    m_a = manifest('a1', {'id': 'Set A', 'reference': {'id': 'r', 'fasta': URL_SHARED},
                          'samples': [{'name': 's1', 'vcf': URL_A}, {'name': 's2', 'vcf': upload},
                                      {'name': 's3', 'vcf': draft_upload},
                                      {'name': 's4', 'vcf': server_file}]})
    m_b = manifest('b1', {'id': 'Set B', 'reference': {'id': 'r', 'fasta': URL_SHARED},
                          'samples': [{'name': 't1', 'vcf': 'https://example.org/b.vcf.gz'}]})
    write(os.path.join(root, 'builds', 'a1', 'build.log'))
    for slug in ('Set_A', 'Set_B'):
        write(os.path.join(root, 'datasets', slug, slug + '.tsi'))
        write(os.path.join(root, 'pipeline', slug, 'samples', 's.vcf.gz'))
        write(os.path.join(root, 'gp_data_copy', 'genomes', slug, 'reference.fa.gz'))
        write(os.path.join(root, 'gp_data_copy', 'jbrowse', slug + '.json'))
    # Set A and Set B annotated with the same database; "old" is nobody's.
    for name in ('r_abc123', 'old_000000'):
        write(os.path.join(root, 'pipeline', 'snpeff', name + '.config'))
        write(os.path.join(root, 'pipeline', 'snpeff', 'data', name, 'snpEffectPredictor.bin'))
    for slug in ('Set_A', 'Set_B'):
        write(os.path.join(root, 'pipeline', slug, 'snpeff.json'), '{"database": "r_abc123"}')
    for url in (URL_A, URL_SHARED, 'https://example.org/b.vcf.gz'):
        write(fetch.cache_path(url))

    db = Db(datasets=Collection([{'_id': 'Set A'}, {'_id': 'Set B'}]),
            dataset_builds=Collection([
                {'_id': 'a1', 'source': 'builder', 'dataset_id': 'Set A', 'manifest': m_a},
                {'_id': 'b1', 'source': 'builder', 'dataset_id': 'Set B', 'manifest': m_b}]))
    draft_docs = Collection([{'_id': 'd1', 'form': {
        'vcfs': [{'file': {'source': 'upload', 'location': UP2, 'name': 'draft.vcf.gz'}}]}}])
    monkeypatch.setattr(builds, 'db', lambda: db)
    monkeypatch.setattr(drafts, 'collection', lambda: draft_docs)
    return {'root': root, 'shared': shared, 'db': db, 'server_file': server_file}


def rel(world, groups):
    return {key: sorted(os.path.relpath(p, world['root']) for p in paths)
            for key, paths in groups.items()}


def test_plan_lists_only_what_the_dataset_alone_owns(world):
    groups = rel(world, cleanup.plan('Set A'))
    assert groups['published'] == ['datasets/Set_A', 'gp_data_copy/genomes/Set_A',
                                   'gp_data_copy/jbrowse/Set_A.json']
    assert groups['work'] == ['builds/a1', 'pipeline/Set_A']
    # Its own download and upload; not the reference Set B also uses, not the
    # upload a draft refers to, not the server-folder file.
    assert groups['inputs'] == [os.path.relpath(fetch.cache_path(URL_A), world['root']),
                                'uploads/' + UP1]


def test_remove_frees_the_files_and_spares_the_rest(world):
    root = world['root']
    groups = cleanup.plan('Set A')
    expected = cleanup.measure(groups)
    assert expected['bytes'] > 0 and [p['key'] for p in expected['parts']] == [
        'published', 'work', 'inputs', 'annotation']
    assert cleanup.remove(groups) == expected['bytes']
    for gone in ('datasets/Set_A', 'pipeline/Set_A', 'builds/a1', 'uploads/' + UP1,
                 'gp_data_copy/genomes/Set_A', 'gp_data_copy/jbrowse/Set_A.json'):
        assert not os.path.exists(os.path.join(root, gone)), gone
    assert not os.path.exists(fetch.cache_path(URL_A))
    for kept in ('datasets/Set_B', 'pipeline/Set_B', 'builds/b1', 'uploads/' + UP2,
                 'pipeline/snpeff/r_abc123.config', 'pipeline/snpeff/data/r_abc123',
                 'gp_data_copy/genomes/Set_B'):
        assert os.path.exists(os.path.join(root, kept)), kept
    assert os.path.exists(fetch.cache_path(URL_SHARED))      # Set B still needs it
    assert os.path.exists(world['server_file'])              # never ours to delete


def test_last_dataset_takes_the_shared_download_with_it(world):
    world['db'].datasets.docs = [{'_id': 'Set A'}]
    world['db'].dataset_builds.docs = [d for d in world['db'].dataset_builds.docs
                                       if d['dataset_id'] == 'Set A']
    inputs = rel(world, cleanup.plan('Set A'))['inputs']
    assert os.path.relpath(fetch.cache_path(URL_SHARED), world['root']) in inputs


@pytest.mark.parametrize('dataset_id', ['..', '.', '../Set_B', 'Set_B/../..', '/', ''])
def test_hostile_ids_reach_nothing(world, dataset_id):
    groups = cleanup.plan(dataset_id)
    root = os.path.realpath(world['root'])
    for paths in groups.values():
        for path in paths:
            real = os.path.realpath(path)
            # At most a folder named after the id's own slug; never a parent,
            # the data root, or another dataset's folder.
            assert real.startswith(root + os.sep) and real.count(os.sep) >= root.count(os.sep) + 2
            assert 'Set_B' not in os.path.relpath(real, root).split(os.sep)
    cleanup.remove(groups)
    for kept in ('datasets/Set_A', 'datasets/Set_B', 'pipeline/cache', 'uploads/' + UP1, 'builds/b1'):
        assert os.path.exists(os.path.join(world['root'], kept)), kept


def test_two_ids_with_one_folder_name_keep_the_folder(world):
    world['db'].datasets.docs.append({'_id': 'Set/A'})        # also "Set_A" on disk
    groups = rel(world, cleanup.plan('Set A'))
    assert groups['published'] == [] and 'pipeline/Set_A' not in groups['work']


def test_snpeff_database_goes_with_the_last_dataset_that_uses_it(world):
    root = world['root']
    # Set B's build also used it: kept.
    assert cleanup.plan('Set A')['annotation'] == []
    # Once Set B's build directory is gone, Set A is the last user.
    import shutil
    shutil.rmtree(os.path.join(root, 'pipeline', 'Set_B'))
    assert rel(world, cleanup.plan('Set A'))['annotation'] == [
        'pipeline/snpeff/data/r_abc123', 'pipeline/snpeff/r_abc123.config']
    cleanup.remove(cleanup.plan('Set A'))
    assert not os.path.exists(os.path.join(root, 'pipeline/snpeff/data/r_abc123'))
    # A database no build names is not this dataset's to remove.
    assert os.path.exists(os.path.join(root, 'pipeline/snpeff/data/old_000000'))
    assert os.path.exists(os.path.join(root, 'pipeline/snpeff/old_000000.config'))


@pytest.mark.parametrize('name', ['../../datasets', '..', '', 'a/b', None, 7])
def test_snpeff_name_from_a_build_file_is_not_trusted(world, name):
    import json
    root = world['root']
    import shutil
    shutil.rmtree(os.path.join(root, 'pipeline', 'Set_B'))
    with open(os.path.join(root, 'pipeline', 'Set_A', 'snpeff.json'), 'w') as handle:
        json.dump({'database': name}, handle)
    assert cleanup.plan('Set A')['annotation'] == []
