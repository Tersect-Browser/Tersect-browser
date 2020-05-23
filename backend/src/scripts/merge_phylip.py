#!/usr/bin/env python3
import argparse
from tersectutils import get_accession_names
from tbutils import merge_phylip_files

def merge_inputs(phylip_files, neg_phylip_files=None,
                 tsi_file=None, accession_file=None,
                 interval_size=None):
    if accession_file is None:
        return merge_phylip_files(phylip_files, neg_phylip_files)
    else:
        all_accessions = get_accession_names(tsi_file)
        accessions = open(accession_file).read().splitlines()
        indices = [ all_accessions.index(acc) for acc in accessions ]
        indices.sort()
        return merge_phylip_files(phylip_files, neg_phylip_files,
                                  indices=indices, interval_size=interval_size)

parser = argparse.ArgumentParser(description='Merge specified Phylip files, limited to selected accessions')
parser.add_argument('tsi_file', type=str, help='tsi file path')
parser.add_argument('phylip_files', nargs='+', help='Phylip files (positive')
parser.add_argument('-n', required=False, nargs='+', help='Phylip files (negative)')
parser.add_argument('-a', required=False, type=str, help='accession file path')
parser.add_argument('--interval-size', required=False, type=int, help='interval size, used for JC distance')

args = parser.parse_args()

tmp_merged_file = merge_inputs(args.phylip_files, args.n,
                               args.tsi_file, args.a,
                               args.interval_size)

print(tmp_merged_file)
