"""tb-dataset: build and manage Tersect Browser datasets.

    tb-dataset validate MANIFEST          check a manifest without building
    tb-dataset build MANIFEST [--cores N] [--force]
    tb-dataset status [DATASET_ID]        recent builds
    tb-dataset remove DATASET_ID          unpublish a dataset
"""
import argparse
import fcntl
import os
import subprocess
import sys

from . import manifest as manifests, settings, store

SNAKEFILE = os.path.join(os.path.dirname(__file__), '..', 'Snakefile')


def validate(args):
    m = manifests.load(args.manifest)
    source = ('%d samples' % len(m.samples)) if m.from_vcfs else 'existing index %s' % m.index
    print('OK: "%s" (%s) from %s; reference %s; annotation: %s'
          % (m.id, m.slug, source, m.reference_id, m.snpeff))
    return m


def memory_budget_mb():
    """Memory the pipeline may plan to use: 80% of what is available."""
    try:
        with open('/proc/meminfo') as handle:
            info = dict(line.split(':', 1) for line in handle)
        return int(int(info['MemAvailable'].split()[0]) / 1024 * 0.8)
    except (OSError, KeyError, ValueError):
        return 4000


def build(args):
    m = validate(args)
    work = settings.work_dir(m.slug)
    os.makedirs(work, exist_ok=True)
    command = ['snakemake', '--snakefile', os.path.realpath(SNAKEFILE),
               '--directory', work, '--config', 'manifest=%s' % m.path,
               '--cores', str(args.cores), '--rerun-incomplete', '--keep-going',
               '--printshellcmds', '--show-failed-logs',
               # Steps declare their memory (resources: mem_mb); only as many
               # run at once as fit, so snpEff and sort are not killed.
               '--resources', 'mem_mb=%d' % (args.memory or memory_budget_mb())]
    if args.force:
        command.append('--forceall')
    if args.dry_run:
        command.append('--dry-run')
    print('Working directory: %s' % work)
    # One build per dataset at a time. The OS releases this lock when the
    # process ends however it ends, so holding it also means any Snakemake
    # lock left in the directory is stale (from a killed build) and can go.
    lock = open(os.path.join(work, '.build.lock'), 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit('Another build of "%s" is running.' % m.id)
    if not args.dry_run:
        subprocess.run(command[:7] + ['--unlock'], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return subprocess.call(command)


def status(args):
    client, db = settings.mongo()
    query = {'dataset_id': args.dataset_id} if args.dataset_id else {}
    for build in db.dataset_builds.find(query).sort('updated_at', -1).limit(20):
        print('%-10s %-40s %s %s' % (build.get('status'), build.get('dataset_id'),
                                     build.get('updated_at', '')[:19] if isinstance(build.get('updated_at'), str)
                                     else build.get('updated_at'), build.get('error') or ''))
    client.close()


def remove(args):
    client, db = settings.mongo()
    dataset = db.datasets.find_one({'_id': args.dataset_id})
    if not dataset:
        sys.exit('No dataset "%s"' % args.dataset_id)
    db.datasets.delete_one({'_id': args.dataset_id})
    db.views.delete_many({'settings.dataset_id': args.dataset_id})
    db.trees.delete_many({'datasetId': args.dataset_id})
    db.speciestreecaches.delete_many({'datasetId': args.dataset_id})
    for matrix in db.matrices.find({'dataset_id': args.dataset_id}):
        if os.path.isfile(matrix.get('matrix_file', '')):
            os.remove(matrix['matrix_file'])
    db.matrices.delete_many({'dataset_id': args.dataset_id})
    client.close()
    if dataset.get('variant_search'):
        store.remove_variants(args.dataset_id)
    print('Removed "%s" (files under %s are kept)'
          % (args.dataset_id, settings.dataset_dir(manifests.slug(args.dataset_id))))


def main(argv=None):
    parser = argparse.ArgumentParser(prog='tb-dataset', description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    p = commands.add_parser('validate')
    p.add_argument('manifest')
    p.set_defaults(func=validate)
    p = commands.add_parser('build')
    p.add_argument('manifest')
    p.add_argument('--cores', type=int, default=os.cpu_count() or 2)
    p.add_argument('--memory', type=int, help='memory budget in MB (default: 80%% of available)')
    p.add_argument('--force', action='store_true', help='rebuild every step')
    p.add_argument('--dry-run', action='store_true', help='show the plan only')
    p.set_defaults(func=build)
    p = commands.add_parser('status')
    p.add_argument('dataset_id', nargs='?')
    p.set_defaults(func=status)
    p = commands.add_parser('remove')
    p.add_argument('dataset_id')
    p.set_defaults(func=remove)
    args = parser.parse_args(argv)
    try:
        result = args.func(args)
    except manifests.ManifestError as error:
        sys.exit('Invalid manifest: %s' % error)
    sys.exit(result if isinstance(result, int) else 0)


if __name__ == '__main__':
    main()
