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

def snv_count_to_jc(snv_count, interval_size):
    return -0.75 * numpy.log(1 - (4 / 3) * (snv_count / interval_size))

def open_phylip_file(location='/tmp', mode='x'):
    filename = randomHash() + '.phylip'
    filepath = os.path.join(location, filename)
    try:
        return open(filepath, mode)
    except FileExistsError:
        return open_phylip_file(location=location, mode=mode)

def merge_phylip_files(filenames, negative_filenames=None,
                       output_location='/tmp', indices=None,
                       interval_size=None):
    output_file = open_phylip_file(location=output_location)
    all_filenames = filenames.copy()
    negative_indices = None
    if negative_filenames is not None:
        all_filenames += negative_filenames
    negative_indices = list(range(len(filenames), len(all_filenames)))
    with ExitStack() as stack:
        readers = [
            csv.reader(stack.enter_context(open(filename, 'r')), delimiter=' ')
            for filename in all_filenames
        ]
        writer = csv.writer(output_file, delimiter=' ', lineterminator='\n')

        # First line is the number of genomes
        genome_num = [int(next(reader)[0]) for reader in readers][0]

        if indices is None:
            # Merging all accessions
            writer.writerow([genome_num])
            for lines in zip(*readers):
                arrays = [
                    numpy.asarray(list(map(int, line[1:])))
                    for line in lines
                ]
                for i in negative_indices:
                    numpy.negative(arrays[i], out=arrays[i])
                output_file.write(lines[0][0] + ' ')
                output_distance = sum(arrays)
                if interval_size is not None:
                    output_distance = snv_count_to_jc(output_distance,
                                                      interval_size)
                writer.writerow(output_distance)
        else:
            # Merging only accessions at specified indices
            writer.writerow([len(indices)])
            for index, lines in enumerate(zip(*readers)):
                if index not in indices:
                    continue
                arrays = [
                    numpy.asarray(list(map(int, line[1:])))[indices]
                    for line in lines
                ]
                for i in negative_indices:
                    numpy.negative(arrays[i], out=arrays[i])
                output_file.write(lines[0][0] + ' ')
                output_distance = sum(arrays)
                if interval_size is not None:
                    output_distance = snv_count_to_jc(output_distance,
                                                      interval_size)
                writer.writerow(output_distance)

    output_file.close()
    return output_file.name

def invert_dict(d):
    return dict(zip(d.values(), d.keys()))

def get_db_location(cfg):
    return os.path.realpath(cfg['localDbPath'])
