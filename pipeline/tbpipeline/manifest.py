"""Dataset manifests: what a dataset is built from.

A manifest is a YAML file naming the reference genome and either the VCF file
of each accession or an existing Tersect index. Paths are relative to the
manifest; URLs (http, https, ftp) are downloaded. See datasets/*.yaml.

Everything in a manifest is validated here, before any work starts: values end
up as file names and as arguments to bcftools, tersect and snpEff.

`check()` collects every problem as an Issue (field, row, message), for the
upload UI's Review step; `load()` reads a file and raises ManifestError with
the first problem, for the command line.
"""
from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

import yaml

NAME_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$')
# VCF contig names to rename: anything bcftools accepts in a rename map
# (two whitespace-separated columns), so no whitespace or control characters.
CONTIG_PATTERN = re.compile(r'^[!-~]{1,200}$')
URL_SCHEMES = ('http', 'https', 'ftp')
TERSECT_TYPES = ('snps', 'indels', 'both')


class ManifestError(ValueError):
    pass


@dataclass
class Issue:
    """One problem in a manifest.

    `field` is a manifest path ("samples[4].name", "reference.fasta"), `row`
    the sample index when the problem is about one sample. `text` is the
    message as the command line prints it, which names the field; `message`
    is the same without a leading "<field>: ", for a UI that shows the field
    beside it.
    """
    field: str
    text: str
    row: Optional[int] = None

    @property
    def message(self) -> str:
        prefix = self.field + ': '
        return self.text[len(prefix):] if self.text.startswith(prefix) else self.text

    def as_dict(self) -> dict:
        return {'field': self.field, 'row': self.row, 'message': self.message}


def slug(text: str) -> str:
    """File-name-safe version of a dataset id. Matches the frontend."""
    return re.sub(r'[^A-Za-z0-9._-]+', '_', text)


def is_url(location: str) -> bool:
    return urlparse(location).scheme in URL_SCHEMES


@dataclass
class Sample:
    name: str
    vcf: str
    label: str
    group: Optional[str] = None
    vcf_sample: Optional[str] = None
    info: dict = field(default_factory=dict)
    # VCF contig -> reference sequence, applied before anything else reads
    # the contig names (bcftools annotate --rename-chrs).
    rename_contigs: dict = field(default_factory=dict)


@dataclass
class Manifest:
    path: str
    id: str
    slug: str
    description: str
    reference_id: str
    fasta: Optional[str]
    gff: Optional[str]
    chromosomes: Optional[list]
    snpeff: str                 # "build", "none" or a snpEff database name
    tersect_homozygous: bool
    tersect_types: str
    samples: list = field(default_factory=list)
    index: Optional[str] = None  # an existing .tsi instead of samples
    sha256: str = ''

    @property
    def from_vcfs(self) -> bool:
        return self.index is None

    @property
    def annotate(self) -> bool:
        return self.from_vcfs and self.snpeff != 'none'


class _Checker:
    """Validation that records problems and carries on.

    Each check returns the clean value, or None after recording an Issue, so
    one pass finds every problem. `row` is set while checking a sample.
    """

    def __init__(self, base_dir, allowed_roots, check_files=True):
        self.base_dir = base_dir
        self.allowed_roots = allowed_roots
        self.check_files = check_files
        self.issues: list[Issue] = []
        self.row: Optional[int] = None

    def problem(self, field_, text):
        self.issues.append(Issue(field_, text, self.row))
        return None

    def require(self, mapping, key, where, kind=str):
        value = mapping.get(key)
        field_ = key if where == 'manifest' else '%s.%s' % (where, key)
        if value is None or (kind is str and not str(value).strip()):
            return self.problem(field_, '%s: "%s" is required' % (where, key))
        if not isinstance(value, kind):
            return self.problem(field_, '%s: "%s" must be a %s' % (where, key, kind.__name__))
        return value

    def name(self, value, where):
        if not isinstance(value, str) or not NAME_PATTERN.match(value):
            return self.problem(where, (
                '%s: "%s" must start with a letter or digit and contain only '
                "letters, digits, '.', '_' and '-' (at most 100)") % (where, value))
        return value

    def location(self, value, where):
        """A URL, or a path (relative to the manifest) that must exist."""
        if not isinstance(value, str) or not value.strip():
            return self.problem(where, '%s: a path or URL is required' % where)
        if is_url(value):
            return value
        if urlparse(value).scheme not in ('', 'file'):
            return self.problem(where, '%s: unsupported location %s' % (where, value))
        path = os.path.realpath(os.path.join(self.base_dir, os.path.expanduser(
            value[len('file://'):] if value.startswith('file://') else value)))
        if self.allowed_roots and not any(
                path == root or path.startswith(root + os.sep)
                for root in self.allowed_roots):
            return self.problem(where, '%s: %s is outside the allowed data directories (%s)'
                                % (where, path, ', '.join(self.allowed_roots)))
        if self.check_files and not os.path.isfile(path):
            return self.problem(where, '%s: file not found: %s' % (where, path))
        return path

    def rename_map(self, value, where):
        """{vcf contig: reference sequence}, one target per contig."""
        if value is None:
            return {}
        if not isinstance(value, dict):
            return self.problem(where, '%s must map VCF contig names to reference '
                                       'sequence names' % where) or {}
        clean, ok = {}, True
        for contig, target in value.items():
            if not isinstance(contig, str) or not CONTIG_PATTERN.match(contig):
                self.problem(where, '%s: "%s" is not a usable contig name (no spaces '
                                    'or control characters)' % (where, contig))
                ok = False
            elif self.name(target, '%s.%s' % (where, contig)) is None:
                ok = False
            else:
                clean[contig] = target
        targets = list(clean.values())
        repeated = sorted({t for t in targets if targets.count(t) > 1})
        if repeated:
            self.problem(where, '%s: several contigs are renamed to %s'
                                % (where, ', '.join(repeated)))
            ok = False
        return clean if ok else {}


def allowed_roots_from_env():
    """Optional confinement of local paths, e.g. to the upload directory."""
    return [os.path.realpath(root) for root in
            os.environ.get('TB_PIPELINE_ALLOWED_ROOTS', '').split(':') if root]


def check(data, base_dir, path='', raw=b'', allowed_roots=None, check_files=True):
    """Validate parsed manifest `data`. Returns (Manifest or None, issues).

    The Manifest is only returned when there are no issues. `base_dir`
    resolves relative paths; `check_files=False` skips the existence check
    of local files (e.g. uploads still in progress).
    """
    if allowed_roots is None:
        allowed_roots = allowed_roots_from_env()
    c = _Checker(base_dir, allowed_roots, check_files)
    if not isinstance(data, dict):
        c.problem('manifest', '%s: expected a mapping at the top level' % (path or 'manifest'))
        return None, c.issues

    dataset_id = c.require(data, 'id', 'manifest')
    if dataset_id is not None and (len(dataset_id) > 100 or any(ord(ch) < 32 for ch in dataset_id)):
        c.problem('id', 'manifest: "id" must be at most 100 printable characters')

    reference = data.get('reference') or {}
    if not isinstance(reference, dict):
        c.problem('reference', 'manifest: "reference" must be a mapping')
        reference = {}
    reference_id = c.require(reference, 'id', 'reference')
    if reference_id is not None:
        c.name(reference_id, 'reference.id')
    fasta = reference.get('fasta')
    fasta = c.location(fasta, 'reference.fasta') if fasta else None
    gff = reference.get('gff')
    gff = c.location(gff, 'reference.gff') if gff else None
    chromosomes = reference.get('chromosomes')
    if chromosomes is not None:
        if not isinstance(chromosomes, list) or not chromosomes:
            c.problem('reference.chromosomes', 'reference.chromosomes must be a non-empty list')
            chromosomes = None
        else:
            # One message for all bad names, not one per chromosome.
            bad = [x for x in chromosomes if not isinstance(x, str) or not NAME_PATTERN.match(x)]
            if bad:
                c.name(bad[0], 'reference.chromosomes')
            if len(set(map(str, chromosomes))) != len(chromosomes):
                c.problem('reference.chromosomes', 'reference.chromosomes has duplicates')

    index = data.get('index')
    samples_data = data.get('samples')
    if (index is None) == (samples_data is None):
        c.problem('samples', 'manifest: give either "samples" (VCF files) or '
                             '"index" (an existing Tersect index), not both')

    samples = []
    if samples_data is not None:
        if reference.get('fasta') is None:
            c.problem('reference.fasta', 'reference.fasta is required to build from VCF files')
        if not isinstance(samples_data, list) or len(samples_data) < 2:
            c.problem('samples', 'samples: at least two samples are required')
        for i, entry in enumerate(samples_data if isinstance(samples_data, list) else []):
            where = 'samples[%d]' % i
            c.row = i
            if not isinstance(entry, dict):
                c.problem(where, '%s must be a mapping' % where)
                continue
            name = c.require(entry, 'name', where)
            if name is not None:
                name = c.name(name, where + '.name')
            vcf_sample = entry.get('vcf_sample')
            if vcf_sample is not None and (not isinstance(vcf_sample, str)
                                           or not vcf_sample or '\n' in vcf_sample):
                c.problem(where + '.vcf_sample', '%s.vcf_sample must be a sample name' % where)
            info = entry.get('info') or {}
            if not isinstance(info, dict) or not all(
                    isinstance(v, (str, int, float)) for v in info.values()):
                c.problem(where + '.info', '%s.info must map names to plain values' % where)
                info = {}
            vcf = c.location(entry.get('vcf'), where + '.vcf')
            rename = c.rename_map(entry.get('rename_contigs'), where + '.rename_contigs')
            samples.append(Sample(
                name=name,
                vcf=vcf,
                label=str(entry.get('label') or name),
                group=str(entry['group']) if entry.get('group') else None,
                vcf_sample=vcf_sample,
                info={str(k): str(v) for k, v in info.items()},
                rename_contigs=rename,
            ))
        c.row = None
        names = [s.name for s in samples if s.name]
        duplicates = sorted({n for n in names if names.count(n) > 1})
        if duplicates:
            c.problem('samples', 'samples: duplicate names: %s' % ', '.join(duplicates))
            # Also flag each repeated row, so the UI can mark it.
            for i, s in enumerate(samples):
                if s.name in duplicates and names.index(s.name) != i:
                    c.issues.append(Issue('samples[%d].name' % i,
                                          'Another accession is also named "%s".' % s.name, i))
    elif index is not None:
        index = c.location(index, 'index')

    annotation = data.get('annotation') or {}
    if not isinstance(annotation, dict):
        c.problem('annotation', 'manifest: "annotation" must be a mapping')
        annotation = {}
    snpeff = str(annotation.get('snpeff', 'build' if reference.get('gff') else 'none'))
    if snpeff == 'build' and not reference.get('gff'):
        c.problem('annotation.snpeff', 'annotation.snpeff "build" needs reference.gff')
    if snpeff not in ('build', 'none'):
        c.name(snpeff, 'annotation.snpeff')

    tersect = data.get('tersect') or {}
    if not isinstance(tersect, dict):
        c.problem('tersect', 'manifest: "tersect" must be a mapping')
        tersect = {}
    types = tersect.get('types', 'both')
    if types not in TERSECT_TYPES:
        c.problem('tersect.types', 'tersect.types must be one of %s' % ', '.join(TERSECT_TYPES))

    if c.issues:
        return None, c.issues
    return Manifest(
        path=path,
        id=dataset_id,
        slug=slug(dataset_id),
        description=str(data.get('description') or '').strip(),
        reference_id=reference_id,
        fasta=fasta,
        gff=gff,
        chromosomes=[str(x) for x in chromosomes] if chromosomes else None,
        snpeff=snpeff,
        tersect_homozygous=bool(tersect.get('homozygous', False)),
        tersect_types=types,
        samples=samples,
        index=index,
        sha256=hashlib.sha256(raw).hexdigest(),
    ), []


def load(path: str) -> Manifest:
    """Read and validate a manifest file; ManifestError on the first problem."""
    path = os.path.realpath(path)
    with open(path, 'rb') as handle:
        raw = handle.read()
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as error:
        raise ManifestError('%s is not valid YAML: %s' % (path, error))
    manifest, issues = check(data, os.path.dirname(path), path=path, raw=raw)
    if issues:
        raise ManifestError(issues[0].text)
    return manifest
