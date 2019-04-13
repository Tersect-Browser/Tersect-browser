#!/usr/bin/env python
import json
import subprocess
from pymongo import MongoClient
from math import ceil
from timeit import default_timer as timer

def add_tersect_index(collection, chromosome_name, start_pos, end_pos,
                      tersect_db_location, verbose=False):
    region = '%s:%d-%d' % (chromosome_name, start_pos, end_pos)
    if (verbose):
        print('    Adding index for %s' % region)
    proc = subprocess.Popen(['tersect', 'dist', '-j',
                             tersect_db_location, region],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output, error = proc.communicate()
    if (error):
        print(error)
        return False
    output = json.loads(output)
    output['samples'] = output.pop('rows')
    del output['columns']
    collection.insert({
        'command': region,
        'tersect_output': output
    })
    return True

def get_chromosome_sizes(tersect_db_location):
    proc = subprocess.Popen(['tersect', 'chroms', '-n', tersect_db_location],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output, error = proc.communicate()
    if (error):
        print(error)
        return None
    lines = [line.split('\t') for line in output.strip().split('\n')]
    chroms = [ { 'name': line[0], 'size': int(line[1]) } for line in lines]
    return chroms

def generate_partition_indices(cfg, tindex, chrom, part_size, verbose=False):
    if verbose:
        print('  Generating %d-sized partition indices' % part_size)
    part_ceil = int(part_size * ceil(float(chrom['size']) / part_size)) + 1
    for pos in range(part_size, part_ceil, part_size):
        add_tersect_index(tindex, chrom['name'], pos - part_size + 1, pos,
                          cfg['tsi_location'], verbose)

def generate_indices(cfg, verbose=False):
    start = timer()
    chromosomes = get_chromosome_sizes(cfg['tsi_location'])
    if (chromosomes == None):
        return None
    client = MongoClient(cfg['hostname'], cfg['port'])
    tindex = client[cfg['db_name']][cfg['collection']]
    tindex.drop()

    for chrom in chromosomes:
        if verbose:
            print('Generating indices for %s' % chrom['name'])
        add_tersect_index(tindex, chrom['name'], 1, chrom['size'],
                          cfg['tsi_location'], verbose)
        for part_size in cfg['index_partitions']:
            if part_size < chrom['size']:
                generate_partition_indices(cfg, tindex, chrom, part_size,
                                           verbose)
    client.close()

    if verbose:
        print("Index generation completed in: " + str(timer() - start))

cfg = {
    'tsi_location': '/home/tom/genome_version_control/tersect2/test/dbs/tomato_fd_hom_snps.tsi',
    'hostname': 'mongodb://localhost',
    'port': 27017,
    'db_name': 'tersect',
    'collection': 'matrices',
    'index_partitions': [
        50000000,
        25000000,
        10000000,
        5000000,
        1000000
    ]
}

generate_indices(cfg, verbose=True)
