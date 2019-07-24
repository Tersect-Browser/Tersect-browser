#!/usr/bin/env python3
import argparse
from tersectutils import get_accession_names
from tbutils import merge_phylip_files

def merge_inputs(phylip_files, neg_phylip_files=None,
                 tsi_file=None, accessions=None):
    if accessions is None:
        return merge_phylip_files(phylip_files, neg_phylip_files)
    else:
        all_accessions = get_accession_names(tsi_file)
        indices = [ all_accessions.index(acc) for acc in accessions ]
        indices.sort()
        return merge_phylip_files(phylip_files, neg_phylip_files,
                                  indices=indices)

parser = argparse.ArgumentParser(description='Merge specified Phylip files, limited to selected accessions')
parser.add_argument('tsi_file', type=str, help='tsi file path')
parser.add_argument('phylip_files', nargs='+', help='Phylip files (positive')
parser.add_argument('neg_phylip_files', nargs='+', help='Phylip files (negative)')
parser.add_argument('-a', required=False, nargs='+', help='accessions')

args = parser.parse_args()

tmp_merged_file = merge_inputs(args.phylip_files, args.neg_phylip_files,
                               args.tsi_file, args.a)

print(tmp_merged_file)
