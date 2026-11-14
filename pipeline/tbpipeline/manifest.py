"""Dataset manifests: what a dataset is built from.

A manifest is a YAML file naming the reference genome and either the VCF file
of each accession or an existing Tersect index. Paths are relative to the
manifest; URLs (http, https, ftp) are downloaded. See datasets/*.yaml.

Everything in a manifest is validated here, before any work starts: values end
up as file names and as arguments to bcftools, tersect and snpEff.
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
URL_SCHEMES = ('http', 'https', 'ftp')
TERSECT_TYPES = ('snps', 'indels', 'both')


class ManifestError(ValueError):
    pass


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


def _require(mapping, key, where, kind=str):
    value = mapping.get(key)
    if value is None or (kind is str and not str(value).strip()):
        raise ManifestError('%s: "%s" is required' % (where, key))
    if not isinstance(value, kind):
        raise ManifestError('%s: "%s" must be a %s' % (where, key, kind.__name__))
    return value


def _name(value, where):
    if not isinstance(value, str) or not NAME_PATTERN.match(value):
        raise ManifestError(
            '%s: "%s" must start with a letter or digit and contain only '
            "letters, digits, '.', '_' and '-' (at most 100)" % (where, value))
    return value


def _location(value, base_dir, where, allowed_roots):
    """A URL, or a path (relative to the manifest) that must exist."""
    if not isinstance(value, str) or not value.strip():
        raise ManifestError('%s: a path or URL is required' % where)
    if is_url(value):
        return value
    if urlparse(value).scheme not in ('', 'file'):
        raise ManifestError('%s: unsupported location %s' % (where, value))
    path = os.path.realpath(os.path.join(base_dir, os.path.expanduser(
        value[len('file://'):] if value.startswith('file://') else value)))
    if allowed_roots and not any(
            path == root or path.startswith(root + os.sep)
            for root in allowed_roots):
        raise ManifestError('%s: %s is outside the allowed data directories (%s)'
                            % (where, path, ', '.join(allowed_roots)))
    if not os.path.isfile(path):
        raise ManifestError('%s: file not found: %s' % (where, path))
    return path


def load(path: str) -> Manifest:
    path = os.path.realpath(path)
    with open(path, 'rb') as handle:
        raw = handle.read()
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as error:
        raise ManifestError('%s is not valid YAML: %s' % (path, error))
    if not isinstance(data, dict):
        raise ManifestError('%s: expected a mapping at the top level' % path)

    base_dir = os.path.dirname(path)
    # Optional confinement of local paths, e.g. to the upload directory.
    allowed_roots = [os.path.realpath(root) for root in
                     os.environ.get('TB_PIPELINE_ALLOWED_ROOTS', '').split(':')
                     if root]

    dataset_id = _require(data, 'id', 'manifest')
    if len(dataset_id) > 100 or any(ord(c) < 32 for c in dataset_id):
        raise ManifestError('manifest: "id" must be at most 100 printable characters')

    reference = data.get('reference') or {}
    if not isinstance(reference, dict):
        raise ManifestError('manifest: "reference" must be a mapping')
    reference_id = _name(_require(reference, 'id', 'reference'), 'reference.id')
    fasta = reference.get('fasta')
    fasta = _location(fasta, base_dir, 'reference.fasta', allowed_roots) if fasta else None
    gff = reference.get('gff')
    gff = _location(gff, base_dir, 'reference.gff', allowed_roots) if gff else None
    chromosomes = reference.get('chromosomes')
    if chromosomes is not None:
        if not isinstance(chromosomes, list) or not chromosomes:
            raise ManifestError('reference.chromosomes must be a non-empty list')
        chromosomes = [_name(c, 'reference.chromosomes') for c in chromosomes]
        if len(set(chromosomes)) != len(chromosomes):
            raise ManifestError('reference.chromosomes has duplicates')

    index = data.get('index')
    samples_data = data.get('samples')
    if (index is None) == (samples_data is None):
        raise ManifestError('manifest: give either "samples" (VCF files) or '
                            '"index" (an existing Tersect index), not both')

    samples = []
    if samples_data is not None:
        if fasta is None:
            raise ManifestError('reference.fasta is required to build from VCF files')
        if not isinstance(samples_data, list) or len(samples_data) < 2:
            raise ManifestError('samples: at least two samples are required')
        for i, entry in enumerate(samples_data):
            where = 'samples[%d]' % i
            if not isinstance(entry, dict):
                raise ManifestError('%s must be a mapping' % where)
            name = _name(_require(entry, 'name', where), where + '.name')
            vcf_sample = entry.get('vcf_sample')
            if vcf_sample is not None and (not isinstance(vcf_sample, str)
                                           or not vcf_sample or '\n' in vcf_sample):
                raise ManifestError('%s.vcf_sample must be a sample name' % where)
            info = entry.get('info') or {}
            if not isinstance(info, dict) or not all(
                    isinstance(v, (str, int, float)) for v in info.values()):
                raise ManifestError('%s.info must map names to plain values' % where)
            samples.append(Sample(
                name=name,
                vcf=_location(entry.get('vcf'), base_dir, where + '.vcf', allowed_roots),
                label=str(entry.get('label') or name),
                group=str(entry['group']) if entry.get('group') else None,
                vcf_sample=vcf_sample,
                info={str(k): str(v) for k, v in info.items()},
            ))
        names = [s.name for s in samples]
        duplicates = sorted({n for n in names if names.count(n) > 1})
        if duplicates:
            raise ManifestError('samples: duplicate names: %s' % ', '.join(duplicates))
    else:
        index = _location(index, base_dir, 'index', allowed_roots)

    annotation = data.get('annotation') or {}
    snpeff = str(annotation.get('snpeff', 'build' if gff else 'none'))
    if snpeff == 'build' and gff is None:
        raise ManifestError('annotation.snpeff "build" needs reference.gff')
    if snpeff not in ('build', 'none'):
        _name(snpeff, 'annotation.snpeff')

    tersect = data.get('tersect') or {}
    types = tersect.get('types', 'both')
    if types not in TERSECT_TYPES:
        raise ManifestError('tersect.types must be one of %s' % ', '.join(TERSECT_TYPES))

    return Manifest(
        path=path,
        id=dataset_id,
        slug=slug(dataset_id),
        description=str(data.get('description') or '').strip(),
        reference_id=reference_id,
        fasta=fasta,
        gff=gff,
        chromosomes=chromosomes,
        snpeff=snpeff,
        tersect_homozygous=bool(tersect.get('homozygous', False)),
        tersect_types=types,
        samples=samples,
        index=index,
        sha256=hashlib.sha256(raw).hexdigest(),
    )
