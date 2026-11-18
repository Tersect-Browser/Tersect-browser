"""Manifests from the web UI: ManifestInput JSON <-> pipeline YAML.

The UI sends a manifest in the pipeline's schema (datasets/*.yaml) with each
file as a FileRef (web/src/features/datasets/types.ts). Here the FileRefs
become manifest locations (files.resolve_ref), the result is checked with
the pipeline's own validation (tbpipeline.manifest.check, every problem at
once) plus a few checks that need the files, and written as YAML the way
datasets/tomato-sl250.yaml is laid out.
"""
import os
import secrets
import subprocess

import yaml

from .. import manifest as manifests, settings
from . import files, uploads

TOOL_TIMEOUT = 30   # seconds, per VCF header read


def _issue(field, message, row=None):
    return {'field': field, 'row': row, 'message': message}


# ------------------------------------------------------ FileRef -> data --

def to_data(manifest: dict, resolve=None):
    """ManifestInput -> (manifest data with locations, issues).

    A FileRef that cannot be resolved (an upload not finished, a path
    outside the shared folders) becomes an issue on its field and is left
    out, so the remaining checks still run.
    """
    issues = []
    resolve = resolve or files.resolve_ref

    def location(ref, field, row=None):
        if not ref:
            return None
        try:
            return resolve(ref)
        except ValueError as error:
            issues.append(_issue(field, str(error), row))
            return None

    reference = manifest.get('reference') or {}
    data = {'id': (manifest.get('id') or '').strip()}
    if manifest.get('description'):
        data['description'] = manifest['description'].strip()
    data['reference'] = {'id': (reference.get('id') or '').strip()}
    fasta = location(reference.get('fasta'), 'reference.fasta')
    if fasta:
        data['reference']['fasta'] = fasta
    elif not reference.get('fasta') and manifest.get('samples') is not None:
        issues.append(_issue('reference.fasta', 'Add a reference FASTA.'))
    gff = location(reference.get('gff'), 'reference.gff')
    if gff:
        data['reference']['gff'] = gff
    if reference.get('chromosomes'):
        data['reference']['chromosomes'] = list(reference['chromosomes'])
    data['annotation'] = {'snpeff': (manifest.get('annotation') or {}).get('snpeff', 'none')}
    tersect = manifest.get('tersect') or {}
    data['tersect'] = {'homozygous': bool(tersect.get('homozygous', False)),
                       'types': tersect.get('types', 'both')}

    if manifest.get('index'):
        data['index'] = location(manifest['index'], 'index') or ''
    else:
        samples = []
        for i, sample in enumerate(manifest.get('samples') or []):
            entry = {'name': sample.get('name', ''),
                     'label': sample.get('label') or sample.get('name', '')}
            if sample.get('group'):
                entry['group'] = sample['group']
            entry['vcf'] = location(sample.get('vcf'), 'samples[%d].vcf' % i, i) or ''
            if sample.get('vcf_sample'):
                entry['vcf_sample'] = sample['vcf_sample']
            if sample.get('info'):
                entry['info'] = dict(sample['info'])
            if sample.get('rename_contigs'):
                entry['rename_contigs'] = dict(sample['rename_contigs'])
            samples.append(entry)
        data['samples'] = samples
    return data, issues


def lenient_resolve(ref):
    """resolve_ref for a download of the manifest: an upload still in
    progress is written with the path it will have when complete."""
    try:
        return files.resolve_ref(ref)
    except ValueError:
        if ref.get('source') == 'upload':
            return uploads.path_of(ref['location'])
        return ref.get('location')


# --------------------------------------------------------- validation --

def _vcf_header(path):
    """(samples, declared contigs) of a local VCF, or None if unreadable."""
    try:
        text = subprocess.run(['bcftools', 'view', '-h', path], capture_output=True,
                              text=True, timeout=TOOL_TIMEOUT, check=True).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    samples, contigs = [], []
    for line in text.splitlines():
        if line.startswith('##contig=<ID='):
            contigs.append(line[len('##contig=<ID='):].split(',')[0].rstrip('>'))
        elif line.startswith('#CHROM'):
            samples = line.split('\t')[9:]
    return samples, contigs


def _readable(location: str) -> bool:
    """A local file, or a URL that may be fetched (not a private address)."""
    if not manifests.is_url(location):
        return os.path.isfile(location)
    try:
        files.public_url(location)
        return True
    except ValueError:
        return False


def file_checks(data, read_header=_vcf_header):
    """Checks that need the VCF files: each sample is in its VCF, and the
    VCF's contigs (after the rename map) meet the chosen chromosomes.

    Only headers are read, once each: local files and URLs (bcftools reads
    just the first block of a remote file). A VCF without ##contig lines is not
    judged on contigs (the pipeline will). Missing this for URL VCFs let a
    3K-rice build with chr01 contigs against an Ensembl reference (1, 2, …) run
    for an hour before failing.
    """
    issues = []
    chromosomes = set((data.get('reference') or {}).get('chromosomes') or [])
    headers = {}
    for i, sample in enumerate(data.get('samples') or []):
        vcf = sample.get('vcf')
        if not vcf or not _readable(vcf):
            continue
        if vcf not in headers:
            headers[vcf] = read_header(vcf)
        header = headers[vcf]
        if header is None:
            continue
        names, contigs = header
        name = os.path.basename(vcf)
        wanted = sample.get('vcf_sample')
        if not names:
            issues.append(_issue('samples[%d].vcf' % i,
                                 '%s has no samples (a genotype column is required)' % name, i))
        elif wanted and wanted not in names:
            issues.append(_issue('samples[%d].vcf_sample' % i,
                                 'Sample "%s" is not in %s (it has: %s)'
                                 % (wanted, name, ', '.join(names[:10])), i))
        rename = sample.get('rename_contigs') or {}
        if chromosomes and contigs:
            renamed = {rename.get(c, c) for c in contigs}
            if not renamed & chromosomes:
                issues.append(_issue(
                    'samples[%d].rename_contigs' % i,
                    'The contig names of %s (%s) match none of the chosen chromosomes '
                    '(%s). Add a rename map.' % (name, ', '.join(contigs[:5]),
                                                  ', '.join(sorted(chromosomes)[:5])), i))
        if chromosomes:
            stray = sorted(set(rename.values()) - chromosomes)
            if stray:
                issues.append(_issue('samples[%d].rename_contigs' % i,
                                     'The rename map names sequences that are not among '
                                     'the chosen chromosomes: %s' % ', '.join(stray[:5]), i))
    # The same VCF sample twice is almost always a copy-paste slip.
    seen = {}
    for i, sample in enumerate(data.get('samples') or []):
        key = (sample.get('vcf'), sample.get('vcf_sample') or '')
        if key[0] and key in seen:
            issues.append(_issue('samples[%d].vcf_sample' % i,
                                 'Same file and sample as accession %s.'
                                 % (data['samples'][seen[key]].get('name') or seen[key] + 1), i))
        seen.setdefault(key, i)
    return issues


def check(data, check_files=True):
    """Every problem with manifest data, as ValidationIssue dicts."""
    _, issues = manifests.check(data, settings.data_root(), check_files=check_files)
    result = [issue.as_dict() for issue in issues]
    if check_files:
        known = {(i['field'], i['message']) for i in result}
        result += [i for i in file_checks(data) if (i['field'], i['message']) not in known]
    return result


def validate(manifest: dict):
    """ManifestInput -> (data, issues): resolution problems first, then the
    pipeline's checks (skipping fields that already failed to resolve)."""
    data, issues = to_data(manifest)
    failed = {i['field'] for i in issues}
    for issue in check(data):
        # "file not found: ''" for a FileRef that did not resolve says nothing new.
        if issue['field'] in failed:
            continue
        issues.append(issue)
    return data, issues


# --------------------------------------------------------------- YAML --

class _Flow(list):
    """A list written in flow style: [a, b, c]."""


class _Dumper(yaml.SafeDumper):
    """Indents list items under their key, as datasets/*.yaml do."""

    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


_Dumper.add_representer(_Flow, lambda d, v: d.represent_sequence(
    'tag:yaml.org,2002:seq', v, flow_style=True))

KEY_ORDER = ['id', 'description', 'reference', 'annotation', 'tersect', 'samples', 'index']
REFERENCE_ORDER = ['id', 'fasta', 'gff', 'chromosomes']
SAMPLE_ORDER = ['name', 'label', 'group', 'vcf', 'vcf_sample', 'rename_contigs', 'info']


def _ordered(mapping, order):
    out = {k: mapping[k] for k in order if mapping.get(k) not in (None, '', [], {})}
    out.update({k: v for k, v in mapping.items() if k not in out and v not in (None, '', [], {})})
    return out


def to_yaml(data, header=None):
    """Manifest data as YAML, ordered like datasets/tomato-sl250.yaml."""
    data = _ordered(data, KEY_ORDER)
    if 'reference' in data:
        data['reference'] = _ordered(data['reference'], REFERENCE_ORDER)
        if data['reference'].get('chromosomes'):
            data['reference']['chromosomes'] = _Flow(data['reference']['chromosomes'])
    if 'samples' in data:
        data['samples'] = [_ordered(s, SAMPLE_ORDER) for s in data['samples']]
    sections = []
    for key, value in data.items():
        sections.append(yaml.dump({key: value}, Dumper=_Dumper, sort_keys=False,
                                  allow_unicode=True, width=88))
    text = '\n'.join(sections)
    if header:
        text = ''.join('# %s\n' % line if line else '#\n'
                       for line in header.splitlines()) + '\n' + text
    return text


def read_yaml(path):
    with open(path) as handle:
        return yaml.safe_load(handle)


def absolutize(data, base_dir):
    """Local locations made absolute (relative to `base_dir`), so the data
    can be written to a manifest elsewhere."""
    def fix(value):
        if not isinstance(value, str) or not value or manifests.is_url(value):
            return value
        if value.startswith('file://'):
            value = value[len('file://'):]
        return os.path.realpath(os.path.join(base_dir, os.path.expanduser(value)))
    reference = data.get('reference') or {}
    for key in ('fasta', 'gff'):
        if reference.get(key):
            reference[key] = fix(reference[key])
    if data.get('index'):
        data['index'] = fix(data['index'])
    for sample in data.get('samples') or []:
        sample['vcf'] = fix(sample.get('vcf'))
    return data


def merge_added(base, added):
    """Add-accessions manifest: the base dataset's manifest with `added`'s
    samples appended. Reference and options stay as in the base."""
    merged = dict(base)
    merged['samples'] = list(base.get('samples') or []) + list(added.get('samples') or [])
    return merged


# -------------------------------------------------- manifest -> form --

def file_ref(location):
    """FileRef for a manifest location (the reverse of files.resolve_ref)."""
    if not location:
        return None
    if manifests.is_url(location):
        name = os.path.basename(location.split('?')[0]) or location
        return {'source': 'url', 'location': location, 'name': name, 'size': None}
    path = os.path.realpath(location)
    size = os.path.getsize(path) if os.path.isfile(path) else None
    root = os.path.realpath(uploads.uploads_dir())
    relative = os.path.relpath(path, root)
    if not relative.startswith('..') and os.sep in relative:
        upload_id = relative.split(os.sep)[0]
        return {'source': 'upload', 'location': upload_id,
                'name': os.path.basename(path), 'size': size}
    return {'source': 'server', 'location': path, 'name': os.path.basename(path), 'size': size}


def form_from(data, sequences=None):
    """WizardForm (types.ts) for adding accessions to a dataset built from
    `data`: reference and options filled in, no VCFs or accessions."""
    reference = data.get('reference') or {}
    snpeff = str((data.get('annotation') or {}).get('snpeff', 'none'))
    tersect = data.get('tersect') or {}
    chromosomes = list(reference.get('chromosomes') or
                       [s['name'] for s in sequences or []])
    return {
        'name': data.get('id', ''),
        'description': data.get('description') or '',
        'reference': {
            'id': reference.get('id', ''),
            'fasta': file_ref(reference.get('fasta')),
            'gff': file_ref(reference.get('gff')),
            'sequences': sequences,
            'chromosomes': chromosomes,
            'gffSeqids': None,
        },
        'vcfs': [],
        'accessions': [],
        'options': {
            'effects': snpeff if snpeff in ('build', 'none') else 'prebuilt',
            'snpeffDb': '' if snpeff in ('build', 'none') else snpeff,
            'types': tersect.get('types', 'both'),
            'homozygous': bool(tersect.get('homozygous', False)),
            'useIndex': False,
            'index': None,
            'indexSamples': None,
        },
    }


# ------------------------------------------------- YAML -> whole form --

MAX_YAML = 2_000_000     # characters; a manifest of thousands of accessions is far below


class ManifestError(ValueError):
    """An uploaded manifest that cannot be read as one."""


def parse_yaml(text: str) -> dict:
    """Manifest data from YAML text, with its shape checked just enough to
    build a form from it. The wizard's own validation does the rest."""
    if len(text) > MAX_YAML:
        raise ManifestError('The file is too large to be a dataset manifest.')
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise ManifestError('The file is not valid YAML: %s' % str(error).split('\n')[0])
    if not isinstance(data, dict) or not isinstance(data.get('reference'), dict):
        raise ManifestError('This is not a dataset manifest: it has no "reference" section. '
                            'Use a file from "Download manifest".')
    samples = data.get('samples')
    if samples is not None and not (isinstance(samples, list)
                                    and all(isinstance(s, dict) for s in samples)):
        raise ManifestError('"samples" must be a list of accessions.')
    if not samples and not data.get('index'):
        raise ManifestError('The manifest has neither accessions ("samples") nor an "index".')
    for key in ('annotation', 'tersect'):
        if data.get(key) is not None and not isinstance(data[key], dict):
            raise ManifestError('"%s" must be a section with settings.' % key)
    return data


def _usable(location):
    """(FileRef, None) for a manifest location this server can use, else
    (None, why not). URLs always are; a path only if the file is here, in a
    folder the builder may read. A manifest from another machine names
    uploads and folders of that machine."""
    if not isinstance(location, str) or not location.strip():
        return None, None
    location = location.strip()
    if manifests.is_url(location):
        return file_ref(location), None
    if location.startswith('file://'):
        location = location[len('file://'):]
    if not os.path.isabs(location):
        return None, 'is a relative path'
    ref = file_ref(location)
    try:
        files.resolve_ref(ref)
    except ValueError:
        return None, 'is not on this server'
    return ref, None


def form_from_manifest(data: dict):
    """(WizardForm, notes) with every field of a manifest filled in: the
    reverse of the form's toManifest (web/src/features/datasets/manifest.ts).

    What only reading the files can tell (sequences, the samples and contigs
    of each VCF) is left empty: the wizard reads them when the draft opens,
    keeping the chromosomes, names and sample choices given here. Files the
    manifest names by a path that is not on this server are left out, and
    `notes` says which, so that they can be added again.
    """
    notes = []
    form = form_from(data)
    reference = data.get('reference') or {}
    form['name'] = str(data.get('id') or '')
    form['description'] = str(data.get('description') or '').strip()
    form['reference']['id'] = str(reference.get('id') or '')
    form['reference']['chromosomes'] = [str(c) for c in reference.get('chromosomes') or []]
    for key, what in (('fasta', 'reference FASTA'), ('gff', 'gene models (GFF3)')):
        ref, problem = _usable(reference.get(key))
        form['reference'][key] = ref
        if problem:
            notes.append('The %s %s %s: choose it again in step 1.'
                         % (what, os.path.basename(str(reference[key])), problem))

    if data.get('index') and not data.get('samples'):
        ref, problem = _usable(data['index'])
        form['options']['useIndex'] = True
        form['options']['index'] = ref
        if problem:
            notes.append('The Tersect index %s %s: choose it again in step 3.'
                         % (os.path.basename(str(data['index'])), problem))
        return form, notes

    vcfs, by_location, rows, missing = [], {}, [], []
    for sample in data.get('samples') or []:
        name = str(sample.get('name') or '')
        location = sample.get('vcf')
        key = location if isinstance(location, str) else None
        if key not in by_location:
            ref, problem = _usable(location)
            entry = None
            if ref:
                rename = sample.get('rename_contigs')
                entry = {'id': 'vcf_' + secrets.token_hex(4), 'file': ref,
                         'samples': None, 'contigs': None, 'hasGenotypes': None,
                         'inspectError': None, 'selected': [],
                         'renameContigs': {str(k): str(v) for k, v in rename.items()}
                         if isinstance(rename, dict) and rename else None}
                vcfs.append(entry)
            by_location[key] = entry
        vcf = by_location[key]
        if vcf is None:
            missing.append(name or os.path.basename(str(location or '?')))
            continue
        picked = str(sample.get('vcf_sample') or '')
        if picked and picked not in vcf['selected']:
            vcf['selected'].append(picked)
        info = sample.get('info')
        rows.append({'id': 'acc_' + secrets.token_hex(4), 'name': name,
                     'label': str(sample.get('label') or name),
                     'group': str(sample.get('group') or ''),
                     'fileId': vcf['id'], 'sample': picked,
                     'info': {str(k): str(v) for k, v in info.items()}
                     if isinstance(info, dict) else {}})
    form['vcfs'], form['accessions'] = vcfs, rows
    if missing:
        shown = ', '.join(missing[:8]) + (' and %d more' % (len(missing) - 8)
                                          if len(missing) > 8 else '')
        notes.append('%s left out because %s not on this server: %s. '
                     'Add %s again in step 2.'
                     % ('1 accession was' if len(missing) == 1
                        else '%d accessions were' % len(missing),
                        'its VCF is' if len(missing) == 1 else 'their VCFs are', shown,
                        'it' if len(missing) == 1 else 'them'))
    return form, notes
