"""ManifestInput -> manifest data and YAML (server/manifests.py)."""
import yaml

from tbpipeline.server import builds, files, manifests


def ref(path, source='server'):
    return {'source': source, 'location': path, 'name': path.rsplit('/', 1)[-1]}


def resolver(ref_):
    if ref_['source'] == 'upload':
        raise ValueError('Upload of %s is not complete (40%%).' % ref_['name'])
    return ref_['location']


INPUT = {
    'id': 'Tiny', 'description': 'Two accessions',
    'reference': {'id': 'tiny1', 'fasta': ref('/data/tiny.fa'), 'gff': None,
                  'chromosomes': ['ch01', 'ch02']},
    'annotation': {'snpeff': 'none'}, 'tersect': {'homozygous': True, 'types': 'snps'},
    'samples': [
        {'name': 'A', 'label': 'Acc A', 'vcf': ref('/data/a.vcf.gz'), 'info': {'Origin': 'PE'}},
        {'name': 'B', 'label': 'B', 'vcf': ref('abc', 'upload'),
         'rename_contigs': {'chr1': 'ch01'}},
    ],
}


def test_unresolved_ref_becomes_issue():
    data, issues = manifests.to_data(INPUT, resolve=resolver)
    assert issues == [{'field': 'samples[1].vcf', 'row': 1,
                       'message': 'Upload of abc is not complete (40%).'}]
    assert data['samples'][0]['vcf'] == '/data/a.vcf.gz'
    assert data['samples'][1]['rename_contigs'] == {'chr1': 'ch01'}


def test_yaml_layout():
    data, _ = manifests.to_data(INPUT, resolve=lambda r: r['location'])
    text = manifests.to_yaml(data, header='Made by a test')
    assert text.startswith('# Made by a test\n')
    assert 'chromosomes: [ch01, ch02]' in text
    assert '\n  - name: A\n' in text           # list items indented, as datasets/*.yaml
    keys = [line.split(':')[0] for line in text.splitlines()
            if line and not line.startswith((' ', '#'))]
    assert keys == ['id', 'description', 'reference', 'annotation', 'tersect', 'samples']
    assert yaml.safe_load(text)['samples'][1]['rename_contigs'] == {'chr1': 'ch01'}


def test_file_checks_sample_and_contigs():
    data = {'reference': {'chromosomes': ['ch01', 'ch02']},
            'samples': [{'name': 'A', 'vcf': __file__, 'vcf_sample': 'Z'},
                        {'name': 'B', 'vcf': __file__,
                         'rename_contigs': {'chr1': 'ch01', 'chr9': 'ch09'}}]}
    issues = manifests.file_checks(data, read_header=lambda path: (['S1', 'S2'], ['chr1', 'chr2']))
    messages = {(i['field'], i['message']) for i in issues}
    assert ('samples[0].vcf_sample',
            'Sample "Z" is not in test_server_manifests.py (it has: S1, S2)') in messages
    assert any(f == 'samples[0].rename_contigs' and 'match none' in m for f, m in messages)
    # B's map turns chr1 into ch01, so its contigs do meet the chromosomes.
    assert not any(f == 'samples[1].rename_contigs' and 'match none' in m
                   for f, m in messages)
    assert ('samples[1].rename_contigs', 'The rename map names sequences that are not among '
                                         'the chosen chromosomes: ch09') in messages


def test_add_mode_rows_are_the_added_samples():
    issues = [{'field': 'samples[9].name', 'row': 9, 'message': 'x'},
              {'field': 'samples', 'row': None, 'message': 'duplicate names: A'}]
    assert builds._shift_rows(issues, 8) == [
        {'field': 'samples[1].name', 'row': 1, 'message': 'x'},
        {'field': 'samples', 'row': None, 'message': 'duplicate names: A'}]


def test_form_from_manifest(monkeypatch, tmp_path):
    monkeypatch.setattr(manifests.uploads, 'uploads_dir', lambda: str(tmp_path / 'uploads'))
    upload = tmp_path / 'uploads' / 'f00d' / 'genome.fa'
    upload.parent.mkdir(parents=True)
    upload.write_text('>ch01\nACGT\n')
    data = {'id': 'Tiny', 'reference': {'id': 'tiny1', 'fasta': str(upload),
                                        'gff': 'https://example.org/g.gff3.gz'},
            'annotation': {'snpeff': 'Solanum_lycopersicum'},
            'tersect': {'types': 'snps', 'homozygous': True}}
    form = manifests.form_from(data, [{'name': 'ch01', 'length': 4}])
    assert form['reference']['fasta'] == {'source': 'upload', 'location': 'f00d',
                                          'name': 'genome.fa', 'size': 11}
    assert form['reference']['gff']['source'] == 'url'
    assert form['reference']['chromosomes'] == ['ch01']
    assert form['options']['effects'] == 'prebuilt'
    assert form['options']['snpeffDb'] == 'Solanum_lycopersicum'
    assert form['vcfs'] == [] and form['accessions'] == []


def test_format_bytes_matches_the_ui():
    assert builds.format_bytes(3_700_000_000) == '3.7 GB'
    assert builds.format_bytes(247_000_000) == '247 MB'
    assert builds.format_bytes(12) == '12 B'


def test_file_checks_read_url_vcfs(monkeypatch):
    """URL VCFs are checked too (the 3K rice VCFs on S3 use chr01…)."""
    monkeypatch.setattr(files, 'public_url', lambda url: url)
    data = {'reference': {'chromosomes': ['1', '2']},
            'samples': [{'name': 'B001', 'vcf': 'https://example.org/B001.snp.vcf.gz'}]}
    read = []
    issues = manifests.file_checks(
        data, read_header=lambda path: read.append(path) or (['B001'], ['chr01', 'chr02']))
    assert read == ['https://example.org/B001.snp.vcf.gz']
    assert any(i['field'] == 'samples[0].rename_contigs' and 'match none' in i['message']
               for i in issues)


def test_file_checks_skip_private_urls(monkeypatch):
    def refuse(url):
        raise ValueError('private address')
    monkeypatch.setattr(files, 'public_url', refuse)
    data = {'reference': {'chromosomes': ['1']},
            'samples': [{'name': 'X', 'vcf': 'http://10.0.0.1/x.vcf.gz'}]}
    assert manifests.file_checks(data, read_header=lambda p: (_ for _ in ()).throw(AssertionError)) == []
