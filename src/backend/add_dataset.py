#!/usr/bin/env python3
import collections
import csv
import sys
import os
import argparse
import random
import shutil
import json
import subprocess

from hashids import Hashids
from pymongo import errors, ASCENDING, MongoClient
from tbutils import abspath, randomHash
from tersectutils import get_accession_names, rename_accession

# Supporting up to two billion views
MAX_VIEW_ID = 2000000000

def add_default_view(cfg, client, dataset_id, accession_infos, groups=None):
    view_id = randomHash(cfg['salt'], MAX_VIEW_ID)
    views = client[cfg['db_name']]['views']
    settings = {
        'dataset_id': dataset_id,
        'accession_infos': accession_infos
    }
    if (groups is not None):
        settings['accession_groups'] = groups
    try:
        views.insert({
            '_id': view_id,
            'settings': settings
        })
        return view_id
    except errors.DuplicateKeyError:
        return add_default_view(cfg, client, dataset_id, accession_infos)

# Fixes accession names by removing forbidden characters (spaces, periods, and
# dollar signs) and returns a dictionary which maps the old names (as keys)
# to the new names (as values).
def process_accession_names(tsi_file):
    accessions = get_accession_names(tsi_file)
    accession_dictionary = dict()
    for acc in accessions:
        fixed = acc.replace(' ', '_').replace('.', '_').replace('$', '_')
        if fixed != acc:
            # Appending a number in case fixed version of name already exists
            base_fixed = fixed
            count_fixed = 0
            while fixed in accessions or fixed in accession_dictionary.keys():
                fixed = base_fixed + '_' + str(count_fixed)
                count_fixed += 1
            rename_accession(tsi_file, acc, fixed)
        accession_dictionary[acc] = fixed
    return accession_dictionary

# Creates an array of accession information for the dataset
def build_accession_infos(acc_name_map, infos_file=None):
    info_dict = collections.OrderedDict()
    for old_name in acc_name_map:
        info_dict[old_name] = collections.OrderedDict({
            'id': acc_name_map[old_name],
            'Label': old_name
        })
    if infos_file is not None:
        with open(infos_file, 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                if row['id'] in info_dict:
                    # Iterating over field names to preserve order
                    for field in reader.fieldnames:
                        # Update all fields except id
                        if field != 'id':
                            info_dict[row['id']][field] = row[field]

            # Adding empty fiels
            for info_id in info_dict:
                for field in reader.fieldnames:
                    if field not in info_dict[info_id]:
                        info_dict[info_id][field] = ''

    return list(info_dict.values())

def load_groups(groups_filepath, acc_name_map=None):
    if groups_filepath is None:
        return None
    with open(groups_filepath, 'r') as groups_file:
        groups = json.load(groups_file)['groups']
    if acc_name_map is not None:
        # Replace old accession names with new names
        for group in groups:
            for i, old_name in enumerate(group['accessions']):
                if old_name in acc_name_map:
                    group['accessions'][i] = acc_name_map[old_name]
    return groups

def remove_dataset_matrices(cfg, dataset_id):
    client = MongoClient(cfg['hostname'], cfg['port'])
    matrices = client[cfg['db_name']]['matrices']
    for matrix in matrices.find({'dataset_id': dataset_id}):
        if os.path.isfile(matrix['matrix_file']):
            os.remove(matrix['matrix_file'])
    matrices.delete_many({'dataset_id': dataset_id})
    client.close()

def add_dataset(cfg, dataset_id, tersect_db_file, reference_id,
                groups_file=None, infos_file=None, force=False, verbose=False):
    if verbose:
        print("Adding dataset '%s'..." % dataset_id)

    local_db_location = os.path.realpath(cfg['local_db_location'])
    if not os.path.exists(local_db_location):
        os.makedirs(local_db_location)

    client = MongoClient(cfg['hostname'], cfg['port'])
    datasets = client[cfg['db_name']]['datasets']
    trees = client[cfg['db_name']]['trees']
    views = client[cfg['db_name']]['views']

    existing_dataset = datasets.find_one({'_id': dataset_id})
    if (existing_dataset is not None):
        if force:
            if verbose:
                print("Overwriting dataset '%s'..." % dataset_id)
            if os.path.isfile(existing_dataset['tsi_location']):
                os.remove(existing_dataset['tsi_location'])
            datasets.delete_many({'_id': dataset_id})
            trees.delete_many({'dataset_id': dataset_id})
            views.delete_many({'settings.dataset_id': dataset_id})
            remove_dataset_matrices(cfg, dataset_id)
        else:
            if verbose:
                print("Dataset '%s' already exists.\n"
                      "Re-run with the -f option if you wish to overwrite it.\n"
                      "Aborting..." % dataset_id)
            client.close()
            return

    local_tsi_path = os.path.join(local_db_location,
                                  os.path.basename(tersect_db_file))
    shutil.copyfile(tersect_db_file, local_tsi_path)

    acc_name_map = process_accession_names(local_tsi_path)
    accession_infos = build_accession_infos(acc_name_map, infos_file)
    groups = load_groups(groups_file, acc_name_map)

    view_id = add_default_view(cfg, client, dataset_id, accession_infos, groups)

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
parser.add_argument('config_file', type=str, help="config JSON file")
parser.add_argument('dataset_id', type=str, help='dataset id')
parser.add_argument('tersect_db_file', type=str,
                    help='tersect index (tsi) file')
parser.add_argument('reference_id', type=str,
                    help='reference genome identifier')
parser.add_argument('-r', dest='reference_file', default=None, type=str,
                    help='optional reference genome FASTA file')
parser.add_argument('-g', dest='groups_file', default=None, type=str,
                    help='optional group JSON file')
parser.add_argument('-i', dest='infos_file', default=None, type=str,
                    help='optional extra sample information CSV file')
parser.add_argument('-f', required=False, action='store_true',
                    help='force overwrite')

args = parser.parse_args()

config_file = abspath(args.config_file)
with open(config_file, 'r') as cfg_file:
    cfg = json.load(cfg_file)

script_path = os.path.dirname(os.path.realpath(__file__))

tsi_file = abspath(args.tersect_db_file)
groups_file = None if args.groups_file is None else abspath(args.groups_file)
infos_file = None if args.infos_file is None else abspath(args.infos_file)

if not os.path.isfile(tsi_file):
    print('ERROR: Not a valid Tersect file: %s' % tsi_file)
    exit()

if args.reference_file is not None:
    ref_file = abspath(args.reference_file)
    if not os.path.isfile(ref_file):
        print('ERROR: Not a valid reference file: %s' % ref_file)
        exit()
    command = [
        os.path.join(script_path, 'add_reference_genome.py'),
        config_file,
        ref_file,
        args.reference_id
    ]
    if (args.f):
        command.append('-f')
    subprocess.call(command, cwd=os.getcwd())

dataset = add_dataset(cfg, args.dataset_id, tsi_file, args.reference_id,
                      groups_file=groups_file, infos_file=infos_file,
                      force=args.f, verbose=True)

command = [
    os.path.join(script_path, 'build_tersect_index.py'),
    config_file,
    dataset['_id'],
    dataset['tsi_location']
]
if (args.f):
    command.append('-f')
subprocess.call(command, cwd=os.getcwd())
