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

def open_phylip_file(location='/tmp', mode='x'):
    filename = randomHash() + '.phylip'
    filepath = os.path.join(location, filename)
    try:
        return open(filepath, mode)
    except FileExistsError:
        return open_phylip_file(location=location, mode=mode)

def merge_phylip_files(filenames, negative_filenames=None,
                       output_location='/tmp', indices=None):
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
                writer.writerow(sum(arrays))
        else:
            # Merging only accessions at specified indices
            writer.writerow([len(indices)])
            for index, lines in enumerate(zip(*readers)):
                if index not in indices:
                    continue
                arrays = [
                    numpy.asarray(list(map(int,
                        [ line[1:][i] for i in indices ])
                    )) for line in lines
                ]
                for i in negative_indices:
                    numpy.negative(arrays[i], out=arrays[i])
                output_file.write(lines[0][0] + ' ')
                writer.writerow(sum(arrays))

    output_file.close()
    return output_file.name
