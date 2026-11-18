"""Loading into ClickHouse and publishing to the application database.

A build loads its tables into staging tables first (`stage`). Only `publish`
changes what users see, and does so in this order:

  1. reference chromosomes and distance matrices (MongoDB)
  2. variant and gene tables: staging partitions swapped in (ClickHouse)
  3. the dataset record (MongoDB) - the dataset appears, or is updated, here

A failure before step 3 leaves a new dataset invisible and an existing one
serving its previous data (except for distance matrices, which are rebuilt
in place).
"""
import datetime
import glob
import hashlib
import os
import subprocess
import sys

from . import settings

SCHEMA = os.path.join(settings.REPO, 'clickhouse', 'schema.sql')
TABLES = ('variants', 'genes')
# --group-1 ... --group-19 from docs/design/tersect-theme.css
GROUP_COLORS = ['#E5A50A', '#8E5BA8', '#F07F1A', '#7DB7E8', '#CF2440', '#B9A774',
                '#17995C', '#E890B1', '#1F78B4', '#F4937A', '#6C5CB8', '#B5477A',
                '#D4C81E', '#9A3A1E', '#8DB51A', '#7A5630', '#E4592A', '#3F6B4A',
                '#2BB3B1']


def _literal(value):
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def _stage_name(dataset_id, table):
    return 'tersect.%s_stage_%s' % (table, hashlib.sha256(dataset_id.encode()).hexdigest()[:12])


def apply_schema(client):
    with open(SCHEMA) as handle:
        statements = [s.strip() for s in handle.read().split(';')]
    for statement in statements:
        body = '\n'.join(l for l in statement.splitlines() if not l.strip().startswith('--'))
        if body.strip():
            client.command(body)


def stage(manifest, variant_files, genes_file):
    """Load the dataset's Parquet tables into staging tables."""
    client = settings.clickhouse_client()
    apply_schema(client)
    counts = {}
    for table, files in (('variants', variant_files),
                         ('genes', [genes_file] if genes_file else [])):
        name = _stage_name(manifest.id, table)
        client.command('DROP TABLE IF EXISTS %s' % name)
        client.command('CREATE TABLE %s AS tersect.%s' % (name, table))
        for path in files:
            with open(path, 'rb') as handle:
                client.raw_insert(name, insert_block=handle, fmt='Parquet')
        counts[table] = client.command('SELECT count() FROM %s' % name)
    client.close()
    return counts


def swap_in(manifest, parquet=None):
    """Replace the dataset's rows with the staged ones, table by table.

    A previous publish consumes the staging tables; with `parquet`
    ((variant files, genes file)) they are reloaded if missing, so publishing
    again works without re-running the build.
    """
    client = settings.clickhouse_client()
    missing = [t for t in TABLES if not client.command(
        'EXISTS TABLE %s' % _stage_name(manifest.id, t))]
    if missing:
        if not parquet:
            raise RuntimeError('Nothing staged for "%s"' % manifest.id)
        stage(manifest, *parquet)
    partition = _literal(manifest.id)
    for table in TABLES:
        name = _stage_name(manifest.id, table)
        client.command('ALTER TABLE tersect.%s REPLACE PARTITION %s FROM %s'
                       % (table, partition, name))
        client.command('DROP TABLE IF EXISTS %s' % name)
    client.close()


def remove_variants(dataset_id):
    client = settings.clickhouse_client()
    apply_schema(client)
    for table in TABLES:
        client.command('ALTER TABLE tersect.%s DROP PARTITION %s'
                       % (table, _literal(dataset_id)))
    client.close()


def _script(name, *args):
    command = [sys.executable, os.path.join(settings.SCRIPTS, name),
               settings.CONFIG_FILE] + list(args)
    subprocess.run(command, check=True)


def _view_settings(manifest, accessions):
    infos, groups = [], {}
    by_name = {s.name: s for s in manifest.samples}
    for accession in accessions:
        sample = by_name.get(accession)
        info = {'id': accession, 'Label': sample.label if sample else accession}
        if sample:
            if sample.group:
                info['Group'] = sample.group
                groups.setdefault(sample.group, []).append(accession)
            info.update(sample.info)
        infos.append(info)
    fields = sorted({key for info in infos for key in info})
    for info in infos:  # every accession has every column
        for key in fields:
            info.setdefault(key, '')
    settings_ = {'dataset_id': manifest.id, 'accession_infos': infos, 'plugins': []}
    if groups:
        settings_['accession_groups'] = [
            {'name': name, 'category': 'Group', 'accessions': members,
             'color': GROUP_COLORS[i % len(GROUP_COLORS)]}
            for i, (name, members) in enumerate(groups.items())]
    return settings_


def publish(manifest, tsi_next, reference_fasta, accessions, variant_search,
            build_info, parquet=None):
    cfg = settings.config()
    client, db = settings.mongo()
    try:
        existing = db.datasets.find_one({'_id': manifest.id})
        tsi = os.path.join(settings.dataset_dir(manifest.slug), manifest.slug + '.tsi')
        os.replace(tsi_next, tsi)

        # 1. Reference and distance matrices.
        if reference_fasta:
            _script('add_reference_genome.py', reference_fasta, manifest.reference_id,
                    '-f', '--tsi', tsi)
        elif not db.chromosomes.find_one({'reference': manifest.reference_id}):
            # Without the sequence, sizes come from the index and gaps are unknown.
            from .genomics import tersect_chromosomes
            db.chromosomes.insert_many([dict(c, reference=manifest.reference_id, gaps=[])
                                        for c in tersect_chromosomes(tsi)])
        _script('build_tersect_index.py', manifest.id, tsi, '-f')
        if existing:
            # Cached trees were built from the previous data.
            db.trees.delete_many({'datasetId': manifest.id})
            db.speciestreecaches.delete_many({'datasetId': manifest.id})

        # 2. Variant search tables.
        if variant_search:
            swap_in(manifest, parquet)
        elif existing and existing.get('variant_search'):
            remove_variants(manifest.id)

        # 3. The dataset record and its default view.
        view = _view_settings(manifest, accessions)
        if existing and existing.get('view_id') and db.views.find_one({'_id': existing['view_id']}):
            view_id = existing['view_id']
            db.views.update_one({'_id': view_id}, {'$set': {'settings': view}})
        else:
            sys.path.insert(0, settings.SCRIPTS)
            from tbutils import randomHash
            while True:
                view_id = randomHash('tersectsalt', 2000000000)
                if not db.views.find_one({'_id': view_id}):
                    break
            db.views.insert_one({'_id': view_id, 'settings': view})
        record = {
            '_id': manifest.id,
            'view_id': view_id,
            'tsi_location': tsi,
            'reference': manifest.reference_id,
            'description': manifest.description,
            'variant_search': variant_search,
            # What the distance index counts; window distances computed from
            # the variant store use the same rules.
            'tersect': {'homozygous': manifest.tersect_homozygous,
                        'types': manifest.tersect_types},
            'build': build_info,
            # Shown in the public dataset list; unlisting (from the builder)
            # survives rebuilds. Share links work either way.
            'listed': existing.get('listed', True) if existing else True,
        }
        db.datasets.replace_one({'_id': manifest.id}, record, upsert=True)
        return record
    finally:
        client.close()


def remove_dataset(dataset_id):
    """Unpublish a dataset: its record, views, cached trees, distance
    matrices and variant tables. Files under datasets/<slug>/ are kept.
    Returns False if there was no such dataset."""
    client, db = settings.mongo()
    try:
        dataset = db.datasets.find_one({'_id': dataset_id})
        if not dataset:
            return False
        db.datasets.delete_one({'_id': dataset_id})
        db.views.delete_many({'settings.dataset_id': dataset_id})
        db.trees.delete_many({'datasetId': dataset_id})
        db.speciestreecaches.delete_many({'datasetId': dataset_id})
        for matrix in db.matrices.find({'dataset_id': dataset_id}):
            if os.path.isfile(matrix.get('matrix_file', '')):
                os.remove(matrix['matrix_file'])
        db.matrices.delete_many({'dataset_id': dataset_id})
    finally:
        client.close()
    if dataset.get('variant_search'):
        remove_variants(dataset_id)
    return True


def record_build(manifest, status, **fields):
    """Build history, shown by `tb-dataset status` and the builder service.

    Under the builder service (TB_BUILD_MANAGED set) the service owns the
    build's `status` and `error`, so the pipeline's view is recorded as
    `pipeline_status` and `pipeline_error` instead: one writer per field.
    """
    client, db = settings.mongo()
    try:
        now = datetime.datetime.now(datetime.timezone.utc)
        managed = bool(os.environ.get('TB_BUILD_MANAGED'))
        update = {'dataset_id': manifest.id, 'manifest': manifest.path,
                  'manifest_sha256': manifest.sha256,
                  'pipeline_status' if managed else 'status': status,
                  'updated_at': now}
        if managed and 'error' in fields:
            fields['pipeline_error'] = fields.pop('error')
        if managed:
            fields.pop('finished_at', None)
        update.update(fields)
        build_id = os.environ.get('TB_BUILD_ID') or '%s@%s' % (manifest.slug, manifest.sha256[:12])
        db.dataset_builds.update_one({'_id': build_id},
                                     {'$set': update, '$setOnInsert': {'started_at': now}},
                                     upsert=True)
    finally:
        client.close()


def parquet_files(directory):
    return sorted(glob.glob(os.path.join(directory, '*.parquet')))
