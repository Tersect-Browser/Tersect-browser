#!/usr/bin/env python
import argparse
import hashids
import os
import random
import shutil
import json
import subprocess

from hashids import Hashids
from pymongo import errors, ASCENDING, MongoClient

def abspath(path):
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))

def randomHash(cfg):
    hashids = Hashids(salt=cfg['salt'])
    MAX_VIEW_ID = 2000000000
    return hashids.encode(random.randint(0, MAX_VIEW_ID))

def add_default_view(cfg, client, dataset_id):
    view_id = randomHash(cfg)
    views = client[cfg['db_name']][cfg['view_collection']]
    try:
        views.insert({
            '_id': view_id,
            'settings': {
                'dataset_id': dataset_id
            }
        })
        return view_id
    except errors.DuplicateKeyError:
        return add_default_view(cfg, client, dataset_id)

def get_accession_names(tsi_file):
    proc = subprocess.Popen(['tersect', 'samples', '-n', tsi_file],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output, error = proc.communicate()
    if (error):
        print(error)
        return None
    accessions = [accession for accession in output.strip().split('\n')]
    return accessions

def rename_accession(tsi_file, old_name, new_name):
    command = ['tersect', 'rename', tsi_file, old_name, new_name]
    subprocess.call(command)

# Fixes accession names by removing forbidden characters (spaces) and returns
# a dictionary which maps the new names (as keys) to the old names (as values)
def process_accession_names(tsi_file):
    accessions = get_accession_names(tsi_file)
    accession_dictionary = dict()
    for acc in accessions:
        fixed = acc.replace(' ', '_')
        if fixed != acc:
            # Appending a number in case fixed version of name already exists
            base_fixed = fixed
            count_fixed = 0
            while fixed in accessions or fixed in accession_dictionary.keys():
                fixed = base_fixed + '_' + str(count_fixed)
                count_fixed += 1
            rename_accession(tsi_file, acc, fixed)
        accession_dictionary[fixed] = acc
    return accession_dictionary

def add_dataset(cfg, dataset_id, tersect_db_file, reference_id, force=False,
                verbose=False):
    if verbose:
        print("Adding dataset '%s'..." % dataset_id)

    tb_path = os.path.dirname(os.path.realpath(__file__))
    tsi_path = os.path.join(tb_path, 'db')
    if not os.path.exists(tsi_path):
        os.mkdir(tsi_path)
    local_tsi_path = os.path.join(tsi_path, os.path.basename(tersect_db_file))
    shutil.copyfile(tersect_db_file, local_tsi_path)

    process_accession_names(local_tsi_path)

    client = MongoClient(cfg['hostname'], cfg['port'])
    datasets = client[cfg['db_name']][cfg['dataset_collection']]

    if (datasets.find_one({'_id': dataset_id}) is not None):
        if force:
            if verbose:
                print("Overwriting dataset '%s'..." % dataset_id)
            datasets.delete_many({'_id': dataset_id})
        else:
            if verbose:
                print("Dataset '%s' already exists.\n"
                      "Re-run with the -f option if you wish to overwrite it.\n"
                      "Aborting..." % dataset_id)
            client.close()
            return

    view_id = add_default_view(cfg, client, dataset_id)

    ds = {
        '_id': dataset_id,
        'view_id': view_id,
        'tsi_location': local_tsi_path,
        'reference': reference_id
    }

    datasets.insert(ds)
    client.close()
    return ds

parser = argparse.ArgumentParser(description='Add dataset to Tersect Browser database.')
parser.add_argument('dataset_id', type=str, help='dataset id')
parser.add_argument('tersect_db_file', type=str,
                    help='tersect index (tsi) file')
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

tsi_file = abspath(args.tersect_db_file)

if not os.path.isfile(tsi_file):
    print('ERROR: Not a valid Tersect file: %s' % tsi_file)
    exit()

if args.reference_file is not None:
    ref_file = abspath(args.reference_file)
    if not os.path.isfile(ref_file):
        print('ERROR: Not a valid reference file: %s' % ref_file)
        exit()
    command = ['./add_reference_genome.py', ref_file, args.reference_id]
    if (args.f):
        command.append('-f')
    subprocess.call(command, cwd=cwd)

dataset = add_dataset(cfg, args.dataset_id, tsi_file, args.reference_id,
                      force=args.f, verbose=True)

command = ['./build_tersect_index.py', dataset['_id'], dataset['tsi_location']]
if (args.f):
    command.append('-f')
subprocess.call(command, cwd=cwd)
