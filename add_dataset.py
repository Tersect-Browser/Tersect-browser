#!/usr/bin/env python
import argparse
import os
import json
import subprocess

from pymongo import ASCENDING, MongoClient

def abspath(path):
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))

def add_dataset(cfg, dataset_id, tersect_db_file, reference_id, force=False,
                verbose=False):
    if verbose:
        print("Adding dataset '%s'..." % dataset_id)

    client = MongoClient(cfg['hostname'], cfg['port'])
    datasets = client[cfg['db_name']][cfg['dataset_collection']]

    if (datasets.find_one({'dataset_id': dataset_id}) is not None):
        if force:
            if verbose:
                print("Overwriting dataset '%s'..." % dataset_id)
            datasets.delete_many({'dataset_id': dataset_id})
        else:
            if verbose:
                print("Dataset '%s' already exists.\n"
                      "Re-run with the -f option if you wish to overwrite it.\n"
                      "Aborting..." % dataset_id)
            client.close()
            return

    datasets.create_index('dataset_id', unique=True)

    datasets.insert({
        'dataset_id': dataset_id,
        'tsi_location': tersect_db_file,
        'reference': reference_id
    })

    client.close()

parser = argparse.ArgumentParser(description='Add dataset to Tersect Browser database.')
parser.add_argument('dataset_id', type=str, help='dataset id')
parser.add_argument('tersect_db_file', type=str,
                    help='tersect database (tdi) file')
parser.add_argument('reference_id', type=str,
                    help='reference genome identifier')
parser.add_argument('-r', dest='reference_file', default=None, type=str,
                    help='optional reference genome FASTA file')
parser.add_argument('-f', required=False, action='store_true',
                    help='force overwrite')

args = parser.parse_args()

cwd = os.path.dirname((os.path.realpath(__file__)))

tb_path = os.path.dirname(os.path.realpath(__file__))
cfg_path = os.path.join(tb_path, 'src', 'backend', 'config.json')
with open(cfg_path, 'r') as cfg_file:
    cfg = json.load(cfg_file)

tdi_file = abspath(args.tersect_db_file)

if not os.path.isfile(tdi_file):
    print('ERROR: Not a valid Tersect file: %s' % tdi_file)
    exit()

if args.reference_file is not None:
    ref_file = abspath(args.reference_file)
    if not os.path.isfile(ref_file):
        print('ERROR: Not a valid reference file: %s' % tdi_file)
        exit()
    command = ['./add_reference_genome.py', ref_file, args.reference_id]
    if (args.f):
        command.append('-f')
    subprocess.call(command, cwd=cwd)

add_dataset(cfg, args.dataset_id, tdi_file, args.reference_id,
            force=args.f, verbose=True)

command = ['./build_tersect_index.py', args.dataset_id, tdi_file]
if (args.f):
    command.append('-f')
subprocess.call(command, cwd=cwd)
