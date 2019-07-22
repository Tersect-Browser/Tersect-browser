#!/usr/bin/env python3
import os
import random
import subprocess

from tbutils import randomHash

def openPhylipFile():
    tb_path = os.path.dirname(os.path.realpath(__file__))
    dm_path = os.path.join(tb_path, 'local_db', 'distmats')
    if not os.path.exists(dm_path):
        os.makedirs(dm_path)
    filename = randomHash() + '.phylip'
    filepath = os.path.join(dm_path, filename)
    try:
        return open(filepath, 'x')
    except FileExistsError:
        return openPhylipFile()

# print(createPhylipFile())
# fh = openPhylipFile()
# subprocess.call(['ls'], stdout=fh)
# fh.close()

files = [
    '/home/tom/genome_version_control/tersect-browser/local_db/distmats/test1.phylip',
    '/home/tom/genome_version_control/tersect-browser/local_db/distmats/test2.phylip',
    '/home/tom/genome_version_control/tersect-browser/local_db/distmats/test3.phylip',
]

print(files)