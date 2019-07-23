import csv
import numpy
import os
import random

from contextlib import ExitStack
from hashids import Hashids

def abspath(path):
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path)))

def randomHash(salt='', max_id=1000000000000):
    hashids = Hashids(salt=salt)
    return hashids.encode(random.randint(0, max_id))

def open_phylip_file(mode='x'):
    tb_path = os.path.dirname(os.path.realpath(__file__))
    dm_path = os.path.join(tb_path, 'local_db', 'distmats')
    if not os.path.exists(dm_path):
        os.makedirs(dm_path)
    filename = randomHash() + '.phylip'
    filepath = os.path.join(dm_path, filename)
    try:
        return open(filepath, mode)
    except FileExistsError:
        return open_phylip_file()

def merge_phylip_files(filenames):
    output_file = open_phylip_file()
    with ExitStack() as stack:
        readers = [
            csv.reader(stack.enter_context(open(filename, 'r')), delimiter=' ')
            for filename in filenames
        ]
        writer = csv.writer(output_file, delimiter=' ', lineterminator='\n')

        # First line is the number of genomes
        genome_num = [int(next(reader)[0]) for reader in readers][0]
        writer.writerow([genome_num])

        for lines in zip(*readers):
            arrays = [
                numpy.asarray(list(map(int, line[1:])))
                for line in lines
            ]
            output_file.write(lines[0][0] + ' ')
            writer.writerow(sum(arrays))

    output_file.close()
    return output_file.name
