"""Genome browser (JBrowse) files: reference, gene models, accession tracks.

Written under gp_data_copy, which the backend serves at /datafiles:

    genomes/<dataset>/reference.fa.gz (+ .fai, .gzi)
    genomes/<dataset>/genes.gff3.gz (+ .tbi)
    genomes/<dataset>/variants/<accession>.vcf.gz (+ .tbi)
    jbrowse/<dataset>.json          JBrowse configuration, read by the web app

The inputs are the pipeline's own bgzipped and indexed files, so they are
copied as they are.
"""
import json
import os
import re
import shutil
import subprocess

from . import settings
from .genomics import accessions, run_chain
from .manifest import slug


def _copy(source, target, indexes):
    shutil.copyfile(source, target)
    for suffix in indexes:
        shutil.copyfile(source + suffix, target + suffix)
    return target


def _tracks_from_index(tsi, variants_dir, log):
    """One sites-only VCF per accession, exported from the Tersect index."""
    tracks = []
    for accession in accessions(tsi):
        target = os.path.join(variants_dir, slug(accession) + '.vcf.gz')
        # tersect view takes a query; quoting makes the name a single sample.
        run_chain([['tersect', 'view', tsi, "'%s'" % accession], ['bgzip', '-@', '4']],
                  stdout=target, log=log)
        subprocess.run(['tabix', '-f', '-p', 'vcf', target], check=True)
        tracks.append((accession, target))
    return tracks


def jbrowse_config(reference_id, data_root, reference, genes, variants,
                   annotation=None):
    """Paths in the configuration are relative to the served data root."""
    def location(path):
        return {'uri': os.path.relpath(path, data_root), 'locationType': 'UriLocation'}

    config = {
        'assembly': {
            'name': reference_id,
            'sequence': {
                'type': 'ReferenceSequenceTrack',
                'trackId': '%s-ReferenceSequenceTrack' % reference_id,
                'adapter': {
                    'type': 'BgzipFastaAdapter',
                    'fastaLocation': location(reference),
                    'faiLocation': location(reference + '.fai'),
                    'gziLocation': location(reference + '.gzi'),
                },
            },
        },
        'tracks': [],
        'geneTrackId': None,
        # Shown beside the gene track, e.g. ITAG2.4_gene_models
        'annotation': annotation,
    }
    if genes:
        config['geneTrackId'] = 'genes'
        config['tracks'].append({
            'type': 'FeatureTrack',
            'trackId': 'genes',
            'name': 'Gene models',
            'assemblyNames': [reference_id],
            'adapter': {
                'type': 'Gff3TabixAdapter',
                'gffGzLocation': location(genes),
                'index': {'location': location(genes + '.tbi'), 'indexType': 'TBI'},
            },
        })
    for accession, vcf in variants:
        config['tracks'].append({
            'type': 'VariantTrack',
            # The web app opens an accession's track by its id.
            'trackId': accession,
            'name': accession,
            'assemblyNames': [reference_id],
            'adapter': {
                'type': 'VcfTabixAdapter',
                'vcfGzLocation': location(vcf),
                'index': {'location': location(vcf + '.tbi'), 'indexType': 'TBI'},
            },
        })
    return config


def prepare(manifest, reference, gff, tracks, tsi=None, log=None):
    """`reference`: bgzipped and faidx-indexed; `gff`: bgzipped and tabix-
    indexed (or None); `tracks`: (accession, indexed VCF) pairs. With `tsi`,
    tracks are exported from the Tersect index instead."""
    root = settings.served_dir()
    out_dir = os.path.join(root, 'genomes', manifest.slug)
    variants_dir = os.path.join(out_dir, 'variants')
    os.makedirs(variants_dir, exist_ok=True)

    reference_out = _copy(reference, os.path.join(out_dir, 'reference.fa.gz'),
                          ('.fai', '.gzi'))
    genes_out = _copy(gff, os.path.join(out_dir, 'genes.gff3.gz'), ('.tbi',)) if gff else None
    variants = [(accession, _copy(vcf, os.path.join(variants_dir, slug(accession) + '.vcf.gz'),
                                  ('.tbi',)))
                for accession, vcf in tracks]
    if tsi:
        variants += _tracks_from_index(tsi, variants_dir, log)

    config_dir = os.path.join(root, 'jbrowse')
    os.makedirs(config_dir, exist_ok=True)
    config_path = os.path.join(config_dir, manifest.slug + '.json')
    with open(config_path, 'w') as handle:
        annotation = None
        if manifest.gff:
            name = os.path.basename(manifest.gff.split('?')[0])
            annotation = re.sub(r'(\.(gff3?|gtf|gz))+$', '', name)
        json.dump(jbrowse_config(manifest.reference_id, root, reference_out,
                                 genes_out, variants, annotation), handle, indent=2)
    return {'config': config_path, 'tracks': len(variants)}
