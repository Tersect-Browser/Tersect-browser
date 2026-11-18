"""Snakemake output -> stage progress, log flags and BuildError mapping.

The logs in data/ are real Snakemake 9.27 output of builds of the tiny test
dataset (test-data/datasets/tiny):

  snakemake-failed-step.log    fresh build; the reference checkpoint adds the
                               per-chromosome jobs later; tersect_index fails
  snakemake-success.log        resumed build: 2 of 5 accessions left to do
  snakemake-normalise-error.log  a build's log tail: normalise of E fails
"""
import os

from tbpipeline.server import progress

DATA = os.path.join(os.path.dirname(__file__), 'data')


def feed(name, parser, until=None):
    with open(os.path.join(DATA, name)) as handle:
        for line in handle:
            parser.feed(line)
            if until and line.strip() == until:
                break
    return parser


def by_key(stages):
    return {s['key']: s for s in stages}


def test_job_table_and_checkpoint_jobs():
    p = feed('snakemake-failed-step.log',
             progress.SnakemakeProgress(samples=3, chromosomes=2),
             until='Finished jobid: 4 (Rule: reference)')
    assert p.table['normalise'] == 3 and p.table['reference'] == 1
    # Jobs after the checkpoint are not in the table but are expected.
    assert 'annotate' not in p.table
    assert p._expected('annotate') == 2 and p._expected('snpeff_database') == 1
    stages = by_key(p.stages(now=0))
    assert stages['reference']['status'] == 'active'   # gene_models still to run
    assert stages['accessions'] == dict(stages['accessions'], status='todo', done=0,
                                        total=3, unit='accessions')
    assert stages['annotate']['total'] == 2 and stages['annotate']['unit'] == 'chromosomes'


def test_failed_step():
    p = feed('snakemake-failed-step.log', progress.SnakemakeProgress(samples=3, chromosomes=2))
    assert [f['rule'] for f in p.failed] == ['tersect_index']
    running = by_key(p.stages(now=0))
    assert running['index']['status'] == 'failed'
    assert running['accessions']['status'] == 'done'
    assert running['accessions']['done'] == 3
    # --keep-going: annotate finished both chromosomes, stage ran.
    assert running['annotate']['status'] == 'done' and running['annotate']['done'] == 2
    assert running['load']['status'] == 'done'
    assert running['publish']['status'] == 'todo'
    # Elapsed from the job timestamps: normalise 17:01:21 -> 17:01:26.
    assert running['accessions']['elapsed'] == 5


def test_resumed_build_counts_finished_accessions():
    p = progress.SnakemakeProgress(samples=5, chromosomes=2)
    feed('snakemake-success.log', p, until='Execute 2 jobs...')
    stages = by_key(p.stages(now=0))
    # 3 accessions were done by an earlier run; 2 are left.
    assert (stages['accessions']['done'], stages['accessions']['total']) == (3, 5)
    assert stages['reference']['status'] == 'done'
    assert stages['reference']['detail'] == 'already done'
    feed('snakemake-success.log', p)
    stages = by_key(p.stages(now=0))
    assert all(s['status'] == 'done' for s in stages.values()), stages
    assert stages['accessions']['done'] == 5


def test_rebuild_wording():
    p = feed('snakemake-success.log', progress.SnakemakeProgress(samples=5, chromosomes=2,
                                                                 rebuild=True))
    assert by_key(p.stages(now=0))['reference']['detail'] == 'kept from current version'


def test_cancel_and_fail_final_states():
    p = progress.SnakemakeProgress(samples=5, chromosomes=2)
    with open(os.path.join(DATA, 'snakemake-success.log')) as handle:
        lines = handle.read().splitlines()
    # Up to the first normalise job's fields (started, not finished).
    for line in lines[:lines.index('    wildcards: sample=E') + 1]:
        p.feed(line)
    assert by_key(p.stages(now=0))['accessions']['status'] == 'active'
    assert by_key(p.stages(now=0, status='cancelled'))['accessions']['status'] == 'cancelled'
    assert by_key(p.stages(now=0, status='failed'))['accessions']['status'] == 'todo'
    assert all(s['status'] == 'done' for s in p.stages(now=0, status='succeeded'))


def test_index_manifest_stages():
    p = progress.SnakemakeProgress(from_vcfs=False)
    p.feed('Job stats:')
    for line in ['job count', '----- -----', 'index_copy 1', 'reference 1',
                 'publish 1', 'all 1', 'total 4', '']:
        p.feed(line)
    stages = by_key(p.stages(now=0))
    assert stages['accessions'] == dict(stages['accessions'], status='done', detail='not needed')
    assert stages['reference']['status'] == 'todo'
    assert progress.stage_of('genome_browser', from_vcfs=False) == 'publish'
    assert progress.stage_of('genome_browser') == 'load'


def test_log_flags():
    with open(os.path.join(DATA, 'snakemake-normalise-error.log')) as handle:
        lines = handle.read().splitlines()
    flagged = [l['t'] for l in progress.flag_errors(lines) if l.get('error')]
    assert 'RuleException:' in flagged
    assert 'Error in rule normalise:' in flagged
    # The message line after "StepError in file ..., line n:" is flagged too.
    assert any(t.startswith('bcftools exited with 255') for t in flagged)
    assert not any(t.startswith('Finished jobid') for t in flagged)


FILES = {'fasta': '/data/ref/genome.fa.gz', 'gff': 'https://example.org/genes.gff3.gz',
         'index': None,
         'samples': [{'name': 'A', 'vcf': '/data/a.vcf.gz'},
                     {'name': 'B', 'vcf': 'https://example.org/vcfs/b.vcf.gz?x=1'}]}


def test_error_no_variants():
    e = progress.build_error({'rule': 'normalise', 'wildcards': {'sample': 'A'},
                              'message': 'No variants left for A on the chosen chromosomes. '
                                         'Do the VCF contig names (chr1) match the reference '
                                         '(SL2.50ch01)?'}, FILES)
    assert e['stage'] == 'accessions' and e['accession'] == 'A' and e['file'] == 'a.vcf.gz'
    assert e['fix'] == {'step': 'accessions', 'kind': 'rename-map', 'target': 'A'}


def test_error_sample_missing():
    e = progress.build_error({'rule': 'normalise', 'wildcards': {'sample': 'B'},
                              'message': 'Sample "LA1589" is not in /cache/x-b.vcf.gz '
                                         '(it has: A, B, C)'}, FILES)
    assert e['file'] == 'x-b.vcf.gz'
    assert e['fix'] == {'step': 'accessions', 'kind': 'sample', 'target': 'B'}


def test_error_reference_and_gff():
    e = progress.build_error({'rule': 'reference', 'message':
                              'Chromosomes not in the reference FASTA: chr9, chr10 '
                              '(it has: ch01, ch02)'}, FILES)
    assert e['stage'] == 'reference' and e['chromosome'] == 'chr9'
    assert e['fix'] == {'step': 'reference', 'kind': 'fasta', 'target': 'genome.fa.gz'}
    e = progress.build_error({'rule': 'gene_models', 'message':
                              'The GFF has no features on the chosen chromosomes; '
                              'check that it matches the reference.'}, FILES)
    assert e['fix'] == {'step': 'reference', 'kind': 'gff', 'target': 'genes.gff3.gz'}


def test_error_download():
    url = 'https://example.org/vcfs/b.vcf.gz?x=1'
    e = progress.build_error({'type': 'DownloadError', 'url': url, 'message':
                              'Download failed after 3 attempts: %s (timed out)' % url}, FILES)
    assert e['stage'] == 'fetch' and e['file'] == 'b.vcf.gz' and e['accession'] == 'B'
    assert e['fix'] == {'step': 'accessions', 'kind': 'vcf', 'target': 'B'}
    # Inside a rule (fetch.cached in gene_models), found from the message.
    e = progress.build_error({'rule': 'gene_models', 'type': 'DownloadError', 'message':
                              'Download failed after 3 attempts: '
                              'https://example.org/genes.gff3.gz (404)'}, FILES)
    assert e['stage'] == 'fetch'
    assert e['fix'] == {'step': 'reference', 'kind': 'gff', 'target': 'genes.gff3.gz'}


def test_error_other():
    e = progress.build_error({'rule': 'annotate', 'wildcards': {'chrom': 'ch03'},
                              'message': 'bcftools exited with 1'}, FILES)
    assert e['stage'] == 'annotate' and e['chromosome'] == 'ch03' and e['fix'] is None


def test_percent():
    stages = [{'key': k, 'status': 'done'} for k in ('fetch', 'reference')] + [
        {'key': 'accessions', 'status': 'active', 'done': 2, 'total': 4}]
    # fetch 10 + reference 10 + half of accessions' 25, of 45.
    assert progress.percent(stages) == round(100 * (10 + 10 + 12.5) / 45)
    assert progress.percent([]) == 0
