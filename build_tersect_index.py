#!/usr/bin/env python3
import argparse
import json
import os
import subprocess

from pymongo import ASCENDING, MongoClient
from math import ceil
from timeit import default_timer as timer
from tbutils import randomHash, merge_phylip_files, open_phylip_file
from tersectutils import get_chromosome_sizes

def add_region_index_db(matrices, dataset_id,
                        chromosome_name, start_pos, end_pos,
                        subpart_size, verbose=False):
    region = '%s:%d-%d' % (chromosome_name, start_pos, end_pos)
    if (verbose):
        print('    Building index for %s based on existing indices' % region)

    subregion_files = []
    for substart_pos in range(start_pos, end_pos + 1, subpart_size):
        subend_pos = substart_pos + subpart_size - 1
        subregion = '%s:%d-%d' % (chromosome_name, substart_pos, subend_pos)
        res = matrices.find_one({'region': subregion})
        if res is not None:
            subregion_files.append(res['matrix_file'])
        else:
            # Reached the end of region covered by subpartitions
            break
    matrices.insert({
        'dataset_id': dataset_id,
        'region': region,
        'matrix_file': merge_phylip_files(subregion_files)
    })
    return True

def add_region_index_tersect(matrices, dataset_id,
                             chromosome_name, start_pos, end_pos,
                             tersect_db_location, verbose=False):
    region = '%s:%d-%d' % (chromosome_name, start_pos, end_pos)
    if (verbose):
        print('    Adding index for %s' % region)
    fh = open_phylip_file()
    subprocess.call(['tersect', 'dist', tersect_db_location, region], stdout=fh)
    fh.close()
    matrices.insert({
        'dataset_id': dataset_id,
        'region': region,
        'matrix_file': fh.name
    })

def generate_partition_indices(cfg, dataset_id, tsi_file,
                               matrices, chrom, part_size,
                               existing_partitions=[], verbose=False):
    if verbose:
        print('  Generating %d-sized partition indices' % part_size)

    partition_divisors = [f for f in existing_partitions if not (part_size % f)]

    part_ceil = int(part_size * ceil(float(chrom['size']) / part_size)) + 1
    for pos in range(part_size, part_ceil, part_size):
        start_pos = pos - part_size + 1
        if len(partition_divisors):
            pass
            # Build index based on smaller partitions already in the database
            add_region_index_db(matrices, dataset_id,
                                chrom['name'], start_pos, pos,
                                max(partition_divisors), verbose)
        else:
            # Create index from scratch by calling tersect
            add_region_index_tersect(matrices, dataset_id,
                                     chrom['name'], start_pos, pos,
                                     tsi_file, verbose)

def generate_indices(cfg, dataset_id, tsi_file, force=False, verbose=False):
    start = timer()
    chromosomes = get_chromosome_sizes(tsi_file)
    if (chromosomes == None):
        return None
    client = MongoClient(cfg['hostname'], cfg['port'])
    matrices = client[cfg['db_name']][cfg['matrix_collection']]
    matrices.create_index([('dataset_id', ASCENDING), ('region', ASCENDING)],
                          unique=True)

    if (matrices.find_one({'dataset_id': dataset_id}) is not None):
        if force:
            if verbose:
                print("Overwriting distance matrices for '%s'..." % dataset_id)
            matrices.delete_many({'dataset_id': dataset_id})
        else:
            if verbose:
                print("Distance matrices for dataset '%s' already exist.\n"
                    "Re-run with the -f option if you wish to overwrite them.\n"
                    "Aborting..." % dataset_id)
            client.close()
            return

    cfg['index_partitions'].sort()
    for chrom in chromosomes:
        if verbose:
            print('Generating indices for %s' % chrom['name'])
        existing_partitions = []
        for part_size in cfg['index_partitions']:
            if part_size < chrom['size']:
                generate_partition_indices(cfg, dataset_id, tsi_file,
                                           matrices, chrom, part_size,
                                           existing_partitions, verbose)
                existing_partitions.append(part_size)

        if verbose:
            print('Generating whole chromosome index for %s' % chrom['name'])
        # Add index for whole chromosome based on largest existing partition
        if len(existing_partitions):
            add_region_index_db(matrices, dataset_id,
                                chrom['name'], 1, chrom['size'],
                                max(existing_partitions), verbose)
        else:
            add_region_index_tersect(matrices, dataset_id,
                                     chrom['name'], 1, chrom['size'],
                                     tsi_file, verbose)
    client.close()

    if verbose:
        print("Index generation completed in: " + str(timer() - start))

parser = argparse.ArgumentParser(description='Build tersect distance matrix index for dataset.')
parser.add_argument('dataset_id', type=str, help='dataset id')
parser.add_argument('tsi_file', type=str,
                    help='path to tsi file to build index from')
parser.add_argument('-f', required=False, action='store_true', help='force distance matrix overwrite')

args = parser.parse_args()

tb_path = os.path.dirname(os.path.realpath(__file__))
cfg_path = os.path.join(tb_path, 'src', 'backend', 'config.json')

with open(cfg_path, 'r') as cfg_file:
    cfg = json.load(cfg_file)

generate_indices(cfg, args.dataset_id, args.tsi_file, args.f, verbose=True)
