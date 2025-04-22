import sys
import os
import subprocess
import platform
import getopt
import shutil
from Bio import SeqIO

fasta = None
gff_file = None
vcf_files = []
multi_sample_vcf = None
vcf_dir = None

def usage():
    print("\nUsage:")
    print("python setup_new_tbrowser_dataset.py -f <input.fasta> -g <input.gff> -v <input1.vcf.gz,input2.vcf.gz,...> -V <vcf_directory> -m <multi_sample_vcf>")
    print("-f <input.fasta>: the input FASTA file, resulting from a Multiple Sequence Alignment.")
    print("-g <input.gff>: the input GFF file.")
    print("-v <input1.vcf.gz,input2.vcf.gz,...>: comma-separated list of input VCF files (compressed with gzip).")
    print("-V <vcf_directory>: directory containing VCF files.")
    print("-m <multi_sample_vcf>: VCF file containing multiple samples for further splitting.")
    print("-h: print this help message and exit.")

def run_with_retry(command, module_name=None):
    """Run a command with a module load retry if it fails."""
    try:
        subprocess.run(command, check=True)
    except subprocess.CalledProcessError as e:
        if module_name:
            print(f"Command failed: {e}. Trying to load module {module_name} and retry...")
            if try_load_module(module_name):
                try:
                    subprocess.run(command, check=True)
                except subprocess.CalledProcessError:
                    print(f"Command failed again after loading module {module_name}. Exiting...")
                    sys.exit(1)
        else:
            print(f"Command failed: {e}. Exiting...")
            sys.exit(1)

def try_load_module(module_name):
    """Try to load a software module using 'module load'."""
    try:
        subprocess.run(["module", "load", module_name], check=True, shell=True, executable='/bin/bash')
        print(f"Module {module_name} loaded.")
        return True
    except subprocess.CalledProcessError:
        print(f"Module {module_name} could not be loaded.")
        return False

def check_install(program_name, module_name):
    """Check if the program is installed, try installing or loading module as a fallback."""
    try:
        subprocess.run([program_name, "--version"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"{program_name} is installed.")
    except FileNotFoundError:
        print(f"{program_name} not found. Attempting to install or load...")
        if platform.system() == "Darwin":  # macOS
            try:
                print(f"Installing {program_name} using Homebrew...")
                subprocess.run(["brew", "install", program_name], check=True)
            except subprocess.CalledProcessError:
                print(f"Failed to install {program_name} using Homebrew. Please install manually.")
                sys.exit(1)
        elif platform.system() == "Linux":
            installed = False
            if os.path.exists(os.path.expanduser('~/.conda')):
                try:
                    print(f"Installing {program_name} using conda...")
                    subprocess.run(["conda", "install", "-y", program_name], check=True)
                    installed = True
                except subprocess.CalledProcessError:
                    print(f"Failed to install {program_name} using conda.")
            else:
                distro = platform.linux_distribution()[0].lower()
                if 'ubuntu' in distro or 'debian' in distro:
                    try:
                        subprocess.run(["sudo", "apt-get", "install", "-y", program_name], check=True)
                        installed = True
                    except subprocess.CalledProcessError:
                        print(f"Failed to install {program_name} using apt-get.")
                elif 'centos' in distro or 'redhat' in distro:
                    try:
                        subprocess.run(["sudo", "yum", "install", "-y", program_name], check=True)
                        installed = True
                    except subprocess.CalledProcessError:
                        print(f"Failed to install {program_name} using yum.")
            if not installed:
                print("Failed to install via package manager. Trying to load as module...")
                if not try_load_module(module_name):
                    print(f"Please install or load {program_name} manually.")
                    sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}. Please install {program_name} manually.")
        sys.exit(1)

def is_bgzipped(file_path):
    """Check if a file is compressed with bgzip."""
    try:
        result = subprocess.run(["file", file_path], capture_output=True, text=True)
        return 'BGZF' in result.stdout
    except subprocess.CalledProcessError:
        return False

def ensure_bgzip_compression(file_path):
    """Ensure the file is bgzipped. Decompress and recompress with bgzip if necessary."""
    # Determine the base name without extension for any .gz suffix
    base_name = file_path[:-3] if file_path.endswith('.gz') else file_path
    if not is_bgzipped(file_path):
        print(f"{file_path} is not bgzipped. Recompressing...")
        if file_path.endswith('.gz'):
            # It's gzip compressed, so decompress it first
            subprocess.run(["gzip", "-d", file_path], check=True)
            # Now bgzip the decompressed file
            subprocess.run(["bgzip", base_name], check=True)
        else:
            # Directly bgzip the file if not compressed
            subprocess.run(["bgzip", "-f", file_path], check=True)
        print(f"BGZIP of {base_name} worked.")
        return base_name + ".gz"
    return file_path                           

def ensure_fasta_index(fasta_path):
    fasta_path = ensure_bgzip_compression(fasta_path)  # Ensure fasta is bgzipped
    fasta_index = fasta_path + ".fai"
    if not os.path.exists(fasta_index):
        print(f"Index for {fasta_path} not found. Creating...")
        run_with_retry(["samtools", "faidx", fasta_path], module_name="SAMtools")

def ensure_gff_index(gff_path):
    gff_path = ensure_bgzip_compression(gff_path)  # Ensure gff is bgzipped
    gff_index = gff_path + ".tbi"
    if not os.path.exists(gff_index):
        print(f"Index for {gff_path} not found. Creating...")
        run_with_retry(["tabix", "-p", "gff", gff_path], module_name="htslib")

def ensure_vcf_index(vcf_path):
    vcf_path = ensure_bgzip_compression(vcf_path)  # Ensure vcf is bgzipped
    vcf_index = vcf_path + ".tbi"
    if not os.path.exists(vcf_index):
        print(f"Index for {vcf_path} not found. Creating...")
        run_with_retry(["tabix", "-p", "vcf", vcf_path], module_name="htslib")

def write_to_shell_script(dataset_name, reference_name):
    """
    Writes the required command to the add_example_dataset.sh script.
    """
    script_content = f"""#!/bin/bash
# This script will add a dataset with the

SCRIPT="./backend/src/scripts/add_dataset.py"
CONFIG_FILE="./tbconfig.json"
DATASET_NAME="{dataset_name}"
TSI_FILE="./~/mongo-data/gp_data_copy/{dataset_name}.tsi"
REFERENCE_NAME="{reference_name}"
REFERENCE="./~/mongo-data/gp_data_copy/{reference_name}"

$SCRIPT $CONFIG_FILE -f \\
"$DATASET_NAME" "$TSI_FILE" \\
"$REFERENCE_NAME" \\
-r $REFERENCE
"""  
    # Writing to add_example_dataset.sh file
    shell_script_path = "./add_example_dataset.sh"
    with open(shell_script_path, 'w') as file:
        file.write(script_content)

def copy_files(fasta, gff_file, vcf_files, workdir):
    """
    Copy specified files to the target directory.
    """
    destination_dir = os.path.expanduser("./~/mongo-data/gp_data_copy/")

    # Ensure the destination directory exists
    os.makedirs(destination_dir, exist_ok=True)

    # Files to copy: FASTA and index
    fasta_index = fasta + ".fai"
    shutil.copy2(fasta, destination_dir)
    if os.path.exists(fasta_index):
        shutil.copy2(fasta_index, destination_dir)

    # Files to copy: GFF and index
    gff_index = gff_file + ".tbi"
    shutil.copy2(gff_file, destination_dir)
    if os.path.exists(gff_index):
        shutil.copy2(gff_index, destination_dir)

    # Files to copy: Dataset.tsi
    tsi_file = os.path.join(workdir, "{dataset_name}.tsi")
    if os.path.exists(tsi_file):
        shutil.copy2(tsi_file, destination_dir)

    # Files to copy: Only the first two VCF files and their indexes
    vcf_subset = vcf_files[:2]  # Select first two VCF files
    for vcf in vcf_subset:
        vcf_index = vcf + ".tbi"
        shutil.copy2(vcf, destination_dir)
        if os.path.exists(vcf_index):
            shutil.copy2(vcf_index, destination_dir)


# Check installations and modules
check_install("samtools", "SAMtools")
check_install("bcftools", "BCFtools")
check_install("tabix", "htslib")

try:
    opts, args = getopt.getopt(sys.argv[1:], "hf:g:v:V:m:", ["help", "fasta=", "gff=", "vcfs=", "dir=", "multi-sample-vcf="])
except getopt.GetoptError as err:
    print(str(err))
    usage()
    sys.exit(2)

dataset_name = None
reference_name = None
reference = None

for o, a in opts:
    if o in ("-f", "--fasta"):
        fasta = a
        reference_name = os.path.splitext(os.path.basename(fasta))[0]  # Extract reference name from fasta filename
    elif o in ("-g", "--gff"):
        gff_file = a
    elif o in ("-v", "--vcfs"):
        vcf_files = a.split(',')
    elif o in ("-V", "--dir"):
        vcf_dir = a
        dataset_name = os.path.basename(vcf_dir)  # Use vcf directory name as dataset name
    elif o in ("-m", "--multi-sample-vcf"):
        multi_sample_vcf = a
    elif o in ("-h", "--help"):
        usage()
        sys.exit()
    else:
        assert False, "Unhandled option"

if fasta is None:
    print("Please provide a FASTA file as input (option -f).")
    usage()
    sys.exit()

if gff_file is None:
    print("Please provide a GFF file as input (option -g).")
    usage()
    sys.exit()

if vcf_dir:
    if not os.path.isdir(vcf_dir):
        print(f"{vcf_dir} is not a valid directory!")
        sys.exit()
    vcf_files.extend([os.path.join(vcf_dir, f) for f in os.listdir(vcf_dir) if f.endswith(".vcf.gz")])

if multi_sample_vcf:
    if not os.path.exists(multi_sample_vcf):
        print(f"{multi_sample_vcf} does not exist!\n")
        sys.exit()
    
    # Splitting the multi-sample VCF file
    workdir = os.path.dirname(multi_sample_vcf)
    accessions_list_file = os.path.join(workdir, "accessions.txt")
    if os.path.exists(accessions_list_file):
        with open(accessions_list_file) as accessions:
            for sample in accessions:
                sample = sample.strip()
                print(f"Extracting {sample}...")
                output_vcf = f"{sample}.vcf.gz"
                run_with_retry(["bcftools", "view", "-c1", "-Oz", "--threads", "10", "-s", sample, "-o", output_vcf, multi_sample_vcf], module_name="BCFtools")
                vcf_files.append(output_vcf)
    else:
        print(f"{accessions_list_file} does not exist. Cannot split VCF file.")
        sys.exit()

if not vcf_files:
    print("Please provide at least one VCF file as input (option -v), a directory of VCF files (option -V), or a multi-sample VCF file (option -m).")
    usage()
    sys.exit()

if not os.path.exists(fasta):
    print(f"{fasta} does not exist!\n")
    sys.exit()

if not os.path.exists(gff_file):
    print(f"{gff_file} does not exist!\n")
    sys.exit()

for vcf in vcf_files:
    if not os.path.exists(vcf):
        print(f"{vcf} does not exist!\n")
        sys.exit()

# Ensure the FASTA, GFF, and VCF files are properly indexed
ensure_fasta_index(fasta)
ensure_gff_index(gff_file)
for vcf in vcf_files:
    ensure_vcf_index(vcf)

# Run Tersect to build the index from VCF files
print("Building Tersect index...")
run_with_retry(["tersect", "build -f", "{dataset_name}.tsi"] + vcf_files)

print("Tersect index created successfully.")

if not (dataset_name and reference_name):
    print("Required parameters missing for shell script creation.")
    sys.exit()

# Call the function to write the data to the shell script
write_to_shell_script(dataset_name, reference_name)

# Copy the necessary files at the end
copy_files(fasta, gff_file, vcf_files, os.path.dirname(fasta))