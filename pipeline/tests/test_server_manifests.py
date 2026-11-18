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


# ---------------------------------------------------- importing a manifest --

RICE = """
# Built by Tersect Browser
id: Rice 3K test (IRGSP-1.0)
description: Four accessions
reference:
  id: IRGSP-1.0
  fasta: https://example.org/rice.fa.gz
  gff: https://example.org/rice.gff3.gz
  chromosomes: ['1', '2', '3']
annotation:
  snpeff: build
tersect:
  homozygous: true
  types: snps
samples:
  - name: B001
    label: Nipponbare line
    group: japonica
    vcf: https://example.org/B001.snp.vcf.gz
    rename_contigs: {chr01: '1', chr02: '2'}
    info: {Origin: PH}
  - name: B002
    label: B002
    vcf: https://example.org/B002.snp.vcf.gz
  - name: P1
    label: Panel one
    vcf: https://example.org/panel.vcf.gz
    vcf_sample: S1
  - name: P2
    label: Panel two
    vcf: https://example.org/panel.vcf.gz
    vcf_sample: S2
"""


def test_a_manifest_fills_the_whole_form():
    form, notes = manifests.form_from_manifest(manifests.parse_yaml(RICE))
    assert notes == []
    assert form['name'] == 'Rice 3K test (IRGSP-1.0)' and form['description'] == 'Four accessions'
    reference = form['reference']
    assert reference['id'] == 'IRGSP-1.0' and reference['chromosomes'] == ['1', '2', '3']
    assert reference['fasta'] == {'source': 'url', 'location': 'https://example.org/rice.fa.gz',
                                  'name': 'rice.fa.gz', 'size': None}
    assert reference['gff']['name'] == 'rice.gff3.gz'
    # Read from the files when the draft opens.
    assert reference['sequences'] is None and reference['gffSeqids'] is None
    assert form['options'] == {'effects': 'build', 'snpeffDb': '', 'types': 'snps',
                               'homozygous': True, 'useIndex': False, 'index': None,
                               'indexSamples': None}

    # One file entry per VCF; the two accessions of the panel share theirs.
    assert [v['file']['name'] for v in form['vcfs']] == [
        'B001.snp.vcf.gz', 'B002.snp.vcf.gz', 'panel.vcf.gz']
    first, second, panel = form['vcfs']
    assert first['renameContigs'] == {'chr01': '1', 'chr02': '2'}
    assert second['renameContigs'] is None and second['selected'] == []
    assert panel['selected'] == ['S1', 'S2'] and panel['samples'] is None

    rows = form['accessions']
    assert [(r['name'], r['label'], r['group'], r['sample']) for r in rows] == [
        ('B001', 'Nipponbare line', 'japonica', ''), ('B002', 'B002', '', ''),
        ('P1', 'Panel one', '', 'S1'), ('P2', 'Panel two', '', 'S2')]
    assert rows[0]['info'] == {'Origin': 'PH'} and rows[0]['fileId'] == first['id']
    assert rows[2]['fileId'] == rows[3]['fileId'] == panel['id']
    assert len({r['id'] for r in rows}) == 4


def test_an_imported_form_gives_the_manifest_back():
    """What the wizard would send for the imported form is the manifest."""
    data = manifests.parse_yaml(RICE)
    form, _ = manifests.form_from_manifest(data)
    files_by_id = {v['id']: v for v in form['vcfs']}
    samples = []
    for row in form['accessions']:       # as toManifest (manifest.ts) does
        vcf = files_by_id[row['fileId']]
        samples.append({'name': row['name'], 'label': row['label'], 'group': row['group'],
                        'vcf': vcf['file'], 'vcf_sample': row['sample'] or None,
                        'info': row['info'] or None,
                        'rename_contigs': vcf['renameContigs']})
    again, issues = manifests.to_data({
        'id': form['name'], 'description': form['description'],
        'reference': {k: form['reference'][k] for k in ('id', 'fasta', 'gff', 'chromosomes')},
        'annotation': {'snpeff': form['options']['effects']},
        'tersect': {k: form['options'][k] for k in ('homozygous', 'types')},
        'samples': samples}, resolve=lambda r: r['location'])
    assert issues == []
    assert yaml.safe_load(manifests.to_yaml(again)) == data


def test_files_of_another_machine_are_left_out_and_named(monkeypatch, tmp_path):
    here = tmp_path / 'shared' / 'here.vcf.gz'
    here.parent.mkdir()
    here.write_bytes(b'x')
    monkeypatch.setenv('TB_SERVER_FOLDERS', str(here.parent))
    monkeypatch.setattr(manifests.uploads, 'uploads_dir', lambda: str(tmp_path / 'uploads'))
    text = RICE.replace('https://example.org/rice.fa.gz', '/app/elsewhere/rice.fa.gz') \
               .replace('https://example.org/B001.snp.vcf.gz', '/app/elsewhere/B001.vcf.gz') \
               .replace('https://example.org/B002.snp.vcf.gz', str(here))
    form, notes = manifests.form_from_manifest(manifests.parse_yaml(text))
    assert form['reference']['fasta'] is None and form['reference']['gff'] is not None
    assert [r['name'] for r in form['accessions']] == ['B002', 'P1', 'P2']
    assert form['vcfs'][0]['file']['source'] == 'server'
    assert notes == [
        'The reference FASTA rice.fa.gz is not on this server: choose it again in step 1.',
        '1 accession was left out because its VCF is not on this server: B001. '
        'Add it again in step 2.']


def test_a_manifest_built_on_an_index():
    form, notes = manifests.form_from_manifest(manifests.parse_yaml(
        'id: Soy\nreference: {id: Wm82, fasta: "https://example.org/soy.fa.gz"}\n'
        'index: https://example.org/soy.tsi\n'))
    assert notes == [] and form['accessions'] == [] and form['vcfs'] == []
    assert form['options']['useIndex'] is True
    assert form['options']['index']['location'] == 'https://example.org/soy.tsi'


def test_files_that_are_not_manifests_are_refused():
    import pytest
    for text, message in [
            ('a: [1, 2', 'not valid YAML'),
            ('just some words', 'not a dataset manifest'),
            ('reference: {id: x}', 'neither accessions'),
            ('reference: {id: x}\nsamples: {a: 1}', 'must be a list'),
            ('x' * (manifests.MAX_YAML + 1), 'too large')]:
        with pytest.raises(manifests.ManifestError, match=message):
            manifests.parse_yaml(text)
