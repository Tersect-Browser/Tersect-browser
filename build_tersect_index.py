#!/usr/bin/env python
import json
import os
import subprocess
from pymongo import MongoClient
from math import ceil
from timeit import default_timer as timer

# Assumes matrices have the same dimensions (or m1 is None), saves result in m1
def matrix_sum(m1, m2):
    if m1 is None:
        # Initialize empty result matrix
        m1 = [x[:] for x in [[0] * len(m2[0])] * len(m2)]
    for i in range(len(m2)):
        for j in range(len(m2[0])):
            m1[i][j] += m2[i][j]
    return m1

def add_region_index_db(collection, chromosome_name, start_pos, end_pos,
                        subpart_size, verbose=False):
    region = '%s:%d-%d' % (chromosome_name, start_pos, end_pos)
    if (verbose):
        print('    Building index for %s based on existing indices' % region)

    region_matrix = None
    samples = None
    for substart_pos in range(start_pos, end_pos + 1, subpart_size):
        subend_pos = substart_pos + subpart_size - 1
        subregion = '%s:%d-%d' % (chromosome_name, substart_pos, subend_pos)
        res = collection.find_one({'region': subregion})
        if res is not None:
            region_matrix = matrix_sum(region_matrix, res['matrix'])
            if samples is None:
                samples = res['samples']
        else:
            # Reached the end of region covered by subpartitions
            break
    collection.insert({
        'region': region,
        'samples': samples,
        'matrix': region_matrix
    })
    return True

def add_region_index_tersect(collection, chromosome_name, start_pos, end_pos,
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
    collection.insert({
        'region': region,
        'samples': output['rows'],
        'matrix': output['matrix']
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

def generate_partition_indices(cfg, tindex, chrom, part_size,
                               existing_partitions=[], verbose=False):
    if verbose:
        print('  Generating %d-sized partition indices' % part_size)

    partition_divisors = [f for f in existing_partitions if not (part_size % f)]

    part_ceil = int(part_size * ceil(float(chrom['size']) / part_size)) + 1
    for pos in range(part_size, part_ceil, part_size):
        start_pos = pos - part_size + 1
        if len(partition_divisors):
            # Build index based on smaller partitions already in the database
            add_region_index_db(tindex, chrom['name'], start_pos, pos,
                                max(partition_divisors), verbose)
        else:
            # Create index from scratch by calling tersect
            add_region_index_tersect(tindex, chrom['name'], start_pos, pos,
                                     cfg['tsi_location'], verbose)

def generate_indices(cfg, verbose=False):
    start = timer()
    chromosomes = get_chromosome_sizes(cfg['tsi_location'])
    if (chromosomes == None):
        return None
    client = MongoClient(cfg['hostname'], cfg['port'])
    tindex = client[cfg['db_name']][cfg['collection']]
    tindex.drop()
    tindex.create_index('region')

    cfg['index_partitions'].sort()
    for chrom in chromosomes:
        if verbose:
            print('Generating indices for %s' % chrom['name'])
        #
        existing_partitions = []
        for part_size in cfg['index_partitions']:
            if part_size < chrom['size']:
                generate_partition_indices(cfg, tindex, chrom, part_size,
                                           existing_partitions, verbose)
                existing_partitions.append(part_size)

        if verbose:
            print('Generating whole genome index for %s' % chrom['name'])
        # Add index for whole chromosome based on largest existing partition
        if len(existing_partitions):
            add_region_index_db(tindex, chrom['name'], 1, chrom['size'],
                                max(existing_partitions), verbose)
        else:
            add_region_index_tersect(tindex, chrom['name'], 1, chrom['size'],
                                     cfg['tsi_location'], verbose)
    client.close()

    if verbose:
        print("Index generation completed in: " + str(timer() - start))

tb_path = os.path.dirname(os.path.realpath(__file__))
cfg_path = os.path.join(tb_path, 'src', 'backend', 'config.json')

with open(cfg_path, 'r') as cfg_file:
    cfg = json.load(cfg_file)

generate_indices(cfg, verbose=True)
