"""Where the pipeline reads and writes, from tbconfig.json and the environment.

    <localDbPath>/datasets/<slug>/        published dataset: index, Parquet
    <localDbPath>/gp_data_copy/           genome browser files (served)
    <localDbPath>/pipeline/<slug>/        working files of the last build
    <localDbPath>/pipeline/cache/         downloads, shared between builds
    <localDbPath>/pipeline/snpeff/        snpEff databases, per reference
"""
import os
import sys

REPO = os.path.realpath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCRIPTS = os.path.join(REPO, 'backend', 'src', 'scripts')
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

from tbutils import load_config  # noqa: E402

CONFIG_FILE = os.environ.get('TB_CONFIG', os.path.join(REPO, 'tbconfig.json'))


def config():
    return load_config(CONFIG_FILE)


def data_root():
    return os.path.realpath(config()['localDbPath'])


def dataset_dir(slug):
    return os.path.join(data_root(), 'datasets', slug)


def work_dir(slug):
    return os.path.join(data_root(), 'pipeline', slug)


def cache_dir():
    return os.path.join(data_root(), 'pipeline', 'cache')


def snpeff_dir():
    return os.path.join(data_root(), 'pipeline', 'snpeff')


def served_dir():
    return os.path.join(data_root(), 'gp_data_copy')


def clickhouse_client():
    import clickhouse_connect
    return clickhouse_connect.get_client(
        host=os.environ.get('TB_CLICKHOUSE_HOST', 'localhost'),
        port=int(os.environ.get('TB_CLICKHOUSE_PORT', '8123')),
        username=os.environ.get('TB_CLICKHOUSE_USER', 'default'),
        password=os.environ.get('TB_CLICKHOUSE_PASSWORD', ''),
        # Large dataset loads take a while.
        send_receive_timeout=3600,
    )


def mongo():
    from pymongo import MongoClient
    cfg = config()
    client = MongoClient(cfg['mongoHost'])
    return client, client[cfg['dbName']]
