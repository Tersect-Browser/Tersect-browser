"""Manifest validation (collect every problem), rename_contigs and YAML."""
import gzip
import os
import shutil
import subprocess

import pytest
import yaml

from tbpipeline import genomics, manifest as manifests


@pytest.fixture(autouse=True)
def no_confinement(monkeypatch):
    monkeypatch.delenv('TB_PIPELINE_ALLOWED_ROOTS', raising=False)


@pytest.fixture
def files(tmp_path):
    for name in ('ref.fa', 'a.vcf.gz', 'b.vcf.gz'):
        (tmp_path / name).write_text('x')
    return tmp_path


def good(**changes):
    data = {'id': 'Test set',
            'reference': {'id': 'ref1', 'fasta': 'ref.fa', 'chromosomes': ['ch01', 'ch02']},
            'annotation': {'snpeff': 'none'},
            'samples': [{'name': 'A', 'vcf': 'a.vcf.gz'},
                        {'name': 'B', 'vcf': 'b.vcf.gz',
                         'rename_contigs': {'chr1': 'ch01', 'chr2': 'ch02'}}]}
    data.update(changes)
    return data


def test_valid(files):
    m, issues = manifests.check(good(), str(files), allowed_roots=[])
    assert issues == []
    assert m.samples[1].rename_contigs == {'chr1': 'ch01', 'chr2': 'ch02'}
    assert m.samples[0].rename_contigs == {}


def test_collects_every_problem(files):
    data = good(samples=[
        {'name': 'A', 'vcf': 'a.vcf.gz'},
        {'name': 'bad name', 'vcf': 'missing.vcf.gz'},
        {'name': 'A', 'vcf': 'b.vcf.gz', 'rename_contigs': {'chr 1': 'ch01'}},
    ], tersect={'types': 'everything'})
    data['reference']['id'] = 'ref 1'
    m, issues = manifests.check(data, str(files), allowed_roots=[])
    assert m is None
    found = {(i.field, i.row) for i in issues}
    assert ('reference.id', None) in found
    assert ('samples[1].name', 1) in found
    assert ('samples[1].vcf', 1) in found
    assert ('samples[2].rename_contigs', 2) in found
    assert ('samples', None) in found          # duplicate names
    assert ('samples[2].name', 2) in found     # ... and the repeated row
    assert ('tersect.types', None) in found
    # The UI message drops the field the UI shows beside it.
    missing = next(i for i in issues if i.field == 'samples[1].vcf')
    assert missing.message.startswith('file not found: ')
    assert missing.as_dict()['row'] == 1


def test_rename_map_rules(files):
    def problems(rename):
        data = good()
        data['samples'][1]['rename_contigs'] = rename
        return [i.text for i in manifests.check(data, str(files), allowed_roots=[])[1]]
    assert problems({'chr1': 'ch01'}) == []
    assert any('several contigs are renamed to ch01' in t
               for t in problems({'chr1': 'ch01', '1': 'ch01'}))
    assert any('must start with a letter or digit' in t for t in problems({'chr1': 'ch 01'}))
    assert any('must map VCF contig names' in t for t in problems(['chr1']))


def test_load_keeps_command_line_messages(files):
    path = files / 'm.yaml'
    data = good()
    data['samples'][0]['name'] = 'bad name'
    data['samples'][1]['vcf'] = 'missing.vcf.gz'
    path.write_text(yaml.safe_dump(data))
    with pytest.raises(manifests.ManifestError) as error:
        manifests.load(str(path))
    # The first problem, worded as before the refactor.
    assert str(error.value) == (
        'samples[0].name: "bad name" must start with a letter or digit and contain '
        "only letters, digits, '.', '_' and '-' (at most 100)")
    path.write_text(yaml.safe_dump(good(samples=[{'name': 'A', 'vcf': 'a.vcf.gz'}])))
    with pytest.raises(manifests.ManifestError, match='^samples: at least two samples'):
        manifests.load(str(path))


TOOLS = all(shutil.which(t) for t in ('bcftools', 'bgzip', 'samtools', 'tabix'))


@pytest.mark.skipif(not TOOLS, reason='needs bcftools, bgzip, samtools and tabix')
@pytest.mark.parametrize('declare', [True, False])
def test_normalise_renames_contigs(tmp_path, declare):
    """chr1/chr2 in the VCF become the reference's ch01/ch02, whether or not
    the VCF header declares them."""
    sequence = {'ch01': 'ACGT' * 250, 'ch02': 'TTGCA' * 200}
    fasta = tmp_path / 'ref.fa'
    fasta.write_text(''.join('>%s\n%s\n' % kv for kv in sequence.items()))
    reference = str(tmp_path / 'ref.fa.gz')
    chromosomes = genomics.prepare_reference(str(fasta), reference, None)
    lines = ['##fileformat=VCFv4.2',
             '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">']
    if declare:
        lines += ['##contig=<ID=chr1,length=1000>', '##contig=<ID=chr2,length=1000>']
    lines.append('\t'.join(['#CHROM', 'POS', 'ID', 'REF', 'ALT', 'QUAL', 'FILTER',
                            'INFO', 'FORMAT', 'S1']))
    for contig, name in (('chr1', 'ch01'), ('chr2', 'ch02')):
        for pos in (10, 20, 30):
            ref = sequence[name][pos - 1]
            alt = 'A' if ref != 'A' else 'C'
            lines.append('\t'.join([contig, str(pos), '.', ref, alt, '50', 'PASS', '.',
                                    'GT', '1/1']))
    vcf = str(tmp_path / 'in.vcf')
    with open(vcf, 'w') as handle:
        handle.write('\n'.join(lines) + '\n')
    sample = manifests.Sample(name='S1', vcf=vcf, label='S1',
                              rename_contigs={'chr1': 'ch01', 'chr2': 'ch02'})
    target, qc = str(tmp_path / 'out.vcf.gz'), str(tmp_path / 'qc.json')
    genomics.normalise_sample(vcf, sample, reference, chromosomes, target, qc,
                              str(tmp_path / 'log'))
    with gzip.open(target, 'rt') as handle:
        records = [l.split('\t')[0] for l in handle if not l.startswith('#')]
    assert records == ['ch01'] * 3 + ['ch02'] * 3
    header = subprocess.run(['bcftools', 'view', '-h', target], capture_output=True,
                            text=True).stdout
    assert '##contig=<ID=ch01,length=1000>' in header

    # Without the map: the readable message, not bcftools' error.
    sample.rename_contigs = {}
    with pytest.raises(genomics.StepError, match=r'^No variants left for S1 on the chosen '
                                                 r'chromosomes\. Do the VCF contig names \(chr1'):
        genomics.normalise_sample(vcf, sample, reference, chromosomes,
                                  str(tmp_path / 'out2.vcf.gz'), qc, str(tmp_path / 'log2'))
