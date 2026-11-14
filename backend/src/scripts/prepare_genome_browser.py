#!/usr/bin/env python3
"""Prepare the genome browser (JBrowse) files for a Tersect Browser dataset.

Everything is written under <localDbPath>/gp_data_copy, which the backend
serves at /TersectBrowserGP/datafiles:

    genomes/<dataset>/reference.fa.gz (+ .fai, .gzi)   bgzipped reference
    genomes/<dataset>/genes.gff3.gz (+ .tbi)           sorted gene models
    genomes/<dataset>/variants/<accession>.vcf.gz      one track per accession
    jbrowse/<dataset>.json                             JBrowse configuration

Variant tracks come either from VCF files (--vcf, repeatable) or, with
--variants-from-tsi, from the dataset's Tersect index, one per accession.

With --reference-id, the reference is also registered in the database
(add_reference_genome.py), which records sequence gaps for the plot.

Requires: bgzip and tabix (htslib), samtools, tersect.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

from pymongo import MongoClient

from tbutils import abspath, load_config

SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))


def slug(text):
    """File-name-safe version of a dataset id. Matches the frontend."""
    return re.sub(r'[^A-Za-z0-9._-]+', '_', text)


def run(command, **kwargs):
    print('  $ ' + (command if isinstance(command, str) else ' '.join(command)))
    subprocess.run(command, check=True, **kwargs)


def is_bgzipped(path):
    with open(path, 'rb') as handle:
        header = handle.read(16)
    # gzip magic plus the BGZF "BC" extra field
    return header[:2] == b'\x1f\x8b' and header[12:14] == b'BC'


def bgzip_into(source, target):
    """Write `source` (plain, gzip or bgzip) to `target` as bgzip."""
    if source.endswith('.gz') and is_bgzipped(source):
        shutil.copyfile(source, target)
        return
    reader = 'gzip -dc' if source.endswith('.gz') else 'cat'
    run(f'{reader} "{source}" | bgzip -@ 4 > "{target}"', shell=True)


def prepare_reference(fasta, out_dir):
    target = os.path.join(out_dir, 'reference.fa.gz')
    print('Reference sequence')
    bgzip_into(fasta, target)
    run(['samtools', 'faidx', target])
    return target


def prepare_genes(gff, out_dir):
    target = os.path.join(out_dir, 'genes.gff3.gz')
    print('Gene models')
    reader = 'gzip -dc' if gff.endswith('.gz') else 'cat'
    # Header lines first, then features sorted by sequence and start, as
    # tabix requires.
    run(f'({reader} "{gff}" | grep "^#"; '
        f'{reader} "{gff}" | grep -v "^#" | sort -t "$(printf \'\\t\')" -k1,1 -k4,4n) '
        f'| bgzip -@ 4 > "{target}"', shell=True)
    run(['tabix', '-f', '-p', 'gff', target])
    return target


def tsi_accessions(tsi):
    output = subprocess.run(['tersect', 'samples', '-n', tsi], check=True,
                            capture_output=True, text=True).stdout
    return [line for line in output.splitlines() if line]


def prepare_variants_from_tsi(tsi, out_dir):
    """One sites-only VCF per accession, exported from the Tersect index."""
    variants_dir = os.path.join(out_dir, 'variants')
    os.makedirs(variants_dir, exist_ok=True)
    print('Variant tracks from %s' % tsi)
    tracks = []
    for accession in tsi_accessions(tsi):
        target = os.path.join(variants_dir, slug(accession) + '.vcf.gz')
        with open(target, 'wb') as out:
            view = subprocess.Popen(['tersect', 'view', tsi, "'%s'" % accession],
                                    stdout=subprocess.PIPE)
            subprocess.run(['bgzip', '-@', '4'], stdin=view.stdout,
                           stdout=out, check=True)
            view.stdout.close()
            if view.wait() != 0:
                sys.exit('tersect view failed for %s' % accession)
        run(['tabix', '-f', '-p', 'vcf', target])
        tracks.append((accession, target))
    return tracks


def prepare_variants_from_vcfs(vcfs, out_dir):
    variants_dir = os.path.join(out_dir, 'variants')
    os.makedirs(variants_dir, exist_ok=True)
    print('Variant tracks from VCF files')
    tracks = []
    for vcf in vcfs:
        name = re.sub(r'(\.vcf)?(\.gz)?$', '', os.path.basename(vcf))
        target = os.path.join(variants_dir, slug(name) + '.vcf.gz')
        bgzip_into(vcf, target)
        run(['tabix', '-f', '-p', 'vcf', target])
        tracks.append((name, target))
    return tracks


def jbrowse_config(reference_id, data_root, reference, genes, variants):
    """Paths in the configuration are relative to the served data root."""
    def location(path):
        return {'uri': os.path.relpath(path, data_root),
                'locationType': 'UriLocation'}

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
                'index': {'location': location(genes + '.tbi'),
                          'indexType': 'TBI'},
            },
        })
    for accession, vcf in variants:
        config['tracks'].append({
            'type': 'VariantTrack',
            # The frontend opens an accession's track by its id.
            'trackId': accession,
            'name': accession,
            'assemblyNames': [reference_id],
            'adapter': {
                'type': 'VcfTabixAdapter',
                'vcfGzLocation': location(vcf),
                'index': {'location': location(vcf + '.tbi'),
                          'indexType': 'TBI'},
            },
        })
    return config


def main():
    parser = argparse.ArgumentParser(
        description='Prepare genome browser files for a dataset.')
    parser.add_argument('config_file', help='tbconfig.json')
    parser.add_argument('dataset_id', help='dataset id, as registered')
    parser.add_argument('--fasta', required=True,
                        help='reference FASTA (plain, gzip or bgzip)')
    parser.add_argument('--gff', help='gene models GFF3 (plain or gzip)')
    parser.add_argument('--vcf', action='append', default=[],
                        help='variant track VCF; repeatable')
    parser.add_argument('--variants-from-tsi', action='store_true',
                        help="one variant track per accession, from the "
                             "dataset's Tersect index")
    parser.add_argument('--reference-id',
                        help='register the reference genome (with gaps) '
                             'under this id')
    args = parser.parse_args()

    cfg = load_config(args.config_file)
    data_root = os.path.join(os.path.realpath(cfg['localDbPath']),
                             'gp_data_copy')
    client = MongoClient(cfg['mongoHost'])
    dataset = client[cfg['dbName']]['datasets'].find_one(
        {'_id': args.dataset_id})
    client.close()
    if dataset is None:
        sys.exit("Dataset '%s' is not registered; run add_dataset.py first."
                 % args.dataset_id)
    reference_id = args.reference_id or dataset['reference']

    out_dir = os.path.join(data_root, 'genomes', slug(args.dataset_id))
    os.makedirs(out_dir, exist_ok=True)

    reference = prepare_reference(abspath(args.fasta), out_dir)
    genes = prepare_genes(abspath(args.gff), out_dir) if args.gff else None
    variants = prepare_variants_from_vcfs([abspath(v) for v in args.vcf],
                                          out_dir)
    tsi = dataset['tsi_location']
    if not os.path.isfile(tsi):
        tsi = os.path.join(os.path.realpath(cfg['localDbPath']),
                           os.path.basename(tsi))
    if args.variants_from_tsi:
        variants += prepare_variants_from_tsi(tsi, out_dir)

    if args.reference_id:
        print('Registering reference %s with sequence gaps' % reference_id)
        run([sys.executable, os.path.join(SCRIPT_DIR, 'add_reference_genome.py'),
             abspath(args.config_file), reference, reference_id, '-f',
             '--tsi', tsi])

    config_dir = os.path.join(data_root, 'jbrowse')
    os.makedirs(config_dir, exist_ok=True)
    config_path = os.path.join(config_dir, slug(args.dataset_id) + '.json')
    with open(config_path, 'w') as handle:
        json.dump(jbrowse_config(reference_id, data_root, reference, genes,
                                 variants), handle, indent=2)
    print('Wrote %s (%d tracks)' % (config_path,
                                    len(variants) + (1 if genes else 0)))


if __name__ == '__main__':
    main()
