#!/usr/bin/env python
import itertools
import json
import os
import re

from pymongo import MongoClient
from timeit import default_timer as timer
from Bio import SeqIO # requires Biopython

def generate_gap_index(cfg, verbose=False, min_gap_size=1000,
                       temporary_collection_name='tmp_gap_index'):
    start = timer()
    if verbose:
        print("Loading %s" % cfg['reference_location'])

    client = MongoClient(cfg['hostname'], cfg['port'])
    tindex = client[cfg['db_name']][temporary_collection_name]
    tindex.drop()
    tindex.create_index('chromosome')

    chromosomes = SeqIO.index(cfg['reference_location'], 'fasta').values()
    for chromosome in chromosomes:
        if verbose:
            print("Processing %s" % chromosome.name)
        sequence = str(chromosome.seq.upper())
        gap_pattern = 'N{%d,}' % min_gap_size
        gaps = [{ 'start': gap.start() + 1, 
                  'end': gap.end(),
                  'size': gap.end() - gap.start() }
                for gap in re.finditer(gap_pattern, sequence)]
        if verbose:
            print("Found %d gaps, inserting..." % len(gaps))

        tindex.insert({
            'chromosome': chromosome.name,
            'gaps': gaps
        })
    # Overwriting old collection if it exists
    client[cfg['db_name']][temporary_collection_name].rename(cfg['gap_collection'],
                                                             dropTarget=True)
    client.close()

    if verbose:
        print("Index generation completed in: " + str(timer() - start))


tb_path = os.path.dirname(os.path.realpath(__file__))
cfg_path = os.path.join(tb_path, 'src', 'backend', 'config.json')

with open(cfg_path, 'r') as cfg_file:
    cfg = json.load(cfg_file)

generate_gap_index(cfg, verbose=True)
