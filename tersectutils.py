import subprocess

def get_accession_names(tsi_file):
    proc = subprocess.Popen(['tersect', 'samples', '-n', tsi_file],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            universal_newlines=True)
    output, error = proc.communicate()
    if (error):
        print(error)
        return None
    accessions = output.strip().split('\n')
    return accessions

def rename_accession(tsi_file, old_name, new_name):
    command = ['tersect', 'rename', tsi_file, old_name, new_name]
    subprocess.call(command)

def get_chromosome_sizes(tsi_file):
    proc = subprocess.Popen(['tersect', 'chroms', '-n', tsi_file],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            universal_newlines=True)
    output, error = proc.communicate()
    if (error):
        print(error)
        return None
    lines = [line.split('\t') for line in output.strip().split('\n')]
    chroms = [ { 'name': line[0], 'size': int(line[1]) } for line in lines]
    return chroms
