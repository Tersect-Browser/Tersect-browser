#!/usr/bin/env python3
import argparse
import itertools
import json
import os
import re

from pymongo import ASCENDING, MongoClient
from timeit import default_timer as timer
from Bio import SeqIO # requires Biopython

from tbutils import abspath

def extract_gaps(chromosome, min_gap_size, verbose=False):
    sequence = str(chromosome.seq.upper())
    gap_pattern = 'N{%d,}' % min_gap_size
    gaps = [{ 'start': gap.start() + 1,
              'end': gap.end(),
              'size': gap.end() - gap.start() }
            for gap in re.finditer(gap_pattern, sequence)]
    if verbose:
        print("Found %d gaps, inserting..." % len(gaps))
    return(gaps)

def add_reference_genome(cfg, reference_file, reference_id, force=False,
                         verbose=False, min_gap_size=1000):
    start = timer()
    if verbose:
        print("Loading %s as %s" % (reference_file, reference_id))

    client = MongoClient(cfg['mongo_hostname'], cfg['mongo_port'])
    chrom_index = client[cfg['db_name']]['chromosomes']

    if (chrom_index.find_one({'reference': reference_id}) is not None):
        if force:
            if verbose:
                print("Overwriting genome '%s'..." % reference_id)
            chrom_index.delete_many({'reference': reference_id})
        else:
            if verbose:
                print("Reference genome '%s' already exists.\n"
                      "Re-run with the -f option if you wish to overwrite it.\n"
                      "Aborting..." % reference_id)
            client.close()
            return

    chrom_index.create_index([('reference', ASCENDING),
                              ('name', ASCENDING)],
                             unique=True)

    chromosomes = SeqIO.index(reference_file, 'fasta').values()
    for chromosome in chromosomes:
        if verbose:
            print("Processing %s" % chromosome.name)
        chrom_index.insert({
            'reference': reference_id,
            'name': chromosome.name,
            'size': len(chromosome),
            'gaps': extract_gaps(chromosome, min_gap_size, verbose)
        })

    client.close()

    if verbose:
        print("Index generation completed in: " + str(timer() - start))

parser = argparse.ArgumentParser(description='Add reference genome to Tersect Browser database.')
parser.add_argument('config_file', type=str, help="config JSON file")
parser.add_argument('reference_file', type=str, help='reference genome FASTA file')
parser.add_argument('reference_id', type=str, nargs='?',
                    help='reference genome identifier which will be used internally by Tersect Browser')
parser.add_argument('-f', required=False, action='store_true', help='force reference genome overwrite')

args = parser.parse_args()

if (args.reference_id is None):
    args.reference_id = os.path.basename(args.reference_file)

config_file = abspath(args.config_file)
with open(config_file, 'r') as cfg_file:
    cfg = json.load(cfg_file)

add_reference_genome(cfg, args.reference_file, args.reference_id,
                     force=args.f, verbose=True)
