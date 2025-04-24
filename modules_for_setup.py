import os
import subprocess
import sys
import platform
import getopt
import shutil
import json
from Bio import SeqIO

def usage():
    print("\nTersectBrowser+: Script to add a new dataset to browser deployment")
    print("This script will take in your input dataset files, create index files if needed, build a Tersect index to summarise SNP differences across the dataset, and add your files to the database ready for deployment.")
    print("The script assumes that:")
    print("- You have Tersect CLI and dependencies installed in a virtual environment named .tersect")
    print("- You have cloned the TersectBrowser+ repository and are working in the root Tersect-browser/ directory")
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

def is_gzipped(file_path):
    """Check if a file is gzip compressed."""
    return file_path.endswith('.gz') and not is_bgzipped(file_path)

def decompress_file(file):
    """Handle VCF files based on their compression type."""
    if file.endswith((".vcf", ".gff",".gff3",".fa",".fasta",".fna")):
        # Plain VCF - no need to decompress for building, compress afterwards
        return file, False
    elif file.endswith(".gz"):
        # zipped VCF
        decompressed_file = file[:-3]  # Assuming it ends with '.gz'
        print(f"Decompressing {file} using gzcat...")
        with open(decompressed_file, 'w') as output_file:
            subprocess.run(["gzcat", file], stdout=output_file)
        return decompressed_file, True

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

def build_tersect_index(dataset_name, vcf_files):
    """Create Tersect index from VCF files."""
    # Assume all files are decompressed now
    command = ["tersect", "build", "-f", f"{dataset_name}.tsi"] + vcf_files
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        print("Error building Tersect Index:", result.stderr.decode())
        sys.exit(1)

def ensure_fasta_index(fasta_path):
    fasta_path= decompress_file(fasta_path)[0]
    #fasta_path = ensure_bgzip_compression(fasta_path)  # Ensure fasta is bgzipped if necessary
    fasta_index = fasta_path + ".fai"
    
    if not os.path.exists(fasta_path):
        raise FileNotFoundError(f"Decompressed fasta file {fasta_path} does not exist")
    
    if not os.path.exists(fasta_index):
        print(f"Index for {fasta_path} not found. Creating...")
        run_with_retry(["samtools", "faidx", fasta_path], module_name="SAMtools")
    return fasta_path

def ensure_vcf_index(vcf_path):
    """Ensure VCF file is BGZF-compressed and indexed."""
    # Compress with BGZF if needed
    bgzipped_vcf= ensure_bgzip_compression(vcf_path)
    vcf_index = bgzipped_vcf + ".tbi"
    print(f"Indexing {bgzipped_vcf} with tabix...")
    run_with_retry(["tabix", "-p", "vcf", bgzipped_vcf], module_name="htslib")
    return bgzipped_vcf

def write_to_shell_script(dataset_name, reference_path):
    """
    Writes the required command to the add_example_dataset.sh script.
    NB: the data.tsi file points to the root dir location
    NB: the reference file should also now be in the root dir location
    
    """
    if not (dataset_name and reference_path):
        print("Required parameters missing for shell script creation.")
        sys.exit()
    script_content = f"""#!/bin/bash
# This script will add a dataset with the

SCRIPT="./backend/src/scripts/add_dataset.py"
CONFIG_FILE="./tbconfig.json"
DATASET_NAME="{dataset_name}"
TSI_FILE="./{dataset_name}.tsi"  
REFERENCE_NAME="{os.path.relpath(reference_path)}"
REFERENCE="./{os.path.relpath(reference_path)}"

$SCRIPT $CONFIG_FILE -f \\
"$DATASET_NAME" "$TSI_FILE" \\
"$REFERENCE_NAME" \\
-r $REFERENCE
"""  
    # Writing to add_example_dataset.sh file
    shell_script_path = "./add_example_dataset.sh"
    with open(shell_script_path, 'w') as file:
        file.write(script_content)

def copy_files(fasta, gff_file, vcf_files, destination):
    """
    Copy specified files to the target directory.
    """
    destination_dir = os.path.expanduser(destination)

    # Ensure the destination directory exists
    os.makedirs(destination_dir, exist_ok=True)

    # Files to copy: FASTA and index
    fasta_index = os.path.basename(fasta) + ".fai"
    shutil.copy2(os.path.basename(fasta), destination_dir)
    if os.path.exists(fasta_index):
        shutil.copy2(fasta_index, destination_dir)

    # Files to copy: GFF and index
    gff_index = os.path.basename(gff_file) + ".tbi"
    shutil.copy2(os.path.basename(gff_file), destination_dir)
    if os.path.exists(gff_index):
        shutil.copy2(gff_index, destination_dir)

    # Files to copy: Dataset.tsi
    tsi_file = "./{dataset_name}.tsi" # created in current dir
    if os.path.exists(tsi_file):
        shutil.copy2(tsi_file, destination_dir)

    # Files to copy: Only the first two VCF files and their indexes
    vcf_subset = vcf_files[:2]  # Select first two VCF files
    for vcf in vcf_subset:
        vcf_index = os.path.basename(vcf) + ".tbi"
        shutil.copy2(os.path.basename(vcf), destination_dir)
        if os.path.exists(vcf_index):
            shutil.copy2(vcf_index, destination_dir)

def convert_line_endings():
    """
    Converts line endings of shell and Python scripts to Unix format using dos2unix.
    """
    try:
        result = subprocess.run(["find", "./", "-type", "f", "-name", "*.sh", "-o", "-name", "*.py", "-exec", "dos2unix", "{}", "+"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            print(f"Error during conversion: {result.stderr}")
            return False
        print("All scripts converted to Unix line endings.")
        return True
    except Exception as e:
        print(f"Exception during line ending conversion: {e}")

def add_example_dataset():
    """
    Activates the virtual environment and runs the add_example_dataset.sh script.
    """
    # Path to the external script
    external_script = "./venv_run.sh"

    # Ensure the script exists
    if not os.path.exists(external_script):
        print(f"Script {external_script} not found.")
        sys.exit(1)

    # Ensure the shell script is executable
    print("Ensure the shell script is executable")
    os.chmod(external_script, 0o755)

    try:
        # Attempt to run the external shell script
        subprocess.run(["bash", external_script], check=True)
        print("Dataset generation completed successfully.")
  
    except subprocess.CalledProcessError as e:
        print(f"Error detected: {e}")
        if "python3" in str(e) or "No such file or directory" in str(e) or "env" in str(e):
            # Handle potential Unix line encoding errors
            print("Unix line encoding error detected. Converting line endings...")
            if not convert_line_endings():
                print("Failed to convert line endings.")
                sys.exit(1)

            # Retry running the shell script after conversion
            try:
                subprocess.run(["bash", external_script], check=True)
                print("Dataset generation started successfully after fixing line encodings.")
            except subprocess.CalledProcessError as retry_error:
                print(f"Error during script execution after encoding fix: {retry_error}")
                sys.exit(1)
        else:
            print(f"Unhandled error during script execution: {e}")
            sys.exit(1)

def run_command_with_node(version, command):
    script_path = "./nvm_change.sh"

    if not os.path.exists(script_path):
        raise FileNotFoundError(f"Script {script_path} not found.")

    # Run the shell script with the specified Node.js version and command
    try:
        subprocess.run(["bash", script_path, version, command], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {e}")
    except Exception as e:
        print(f"Exception during execution: {e}")

def rename_chromosomes_in_gff(gff_path, fasta_index):
    # Create a mapping of GFF chromosomes to FASTA chromosomes based on contained names
    chrom_map = {}
    with open(fasta_index, 'r') as fai_file:
        # get fasta index chromosome names
        fai_chromosomes = [line.split('\t')[0] for line in fai_file]
    # Temporary file path for writing the renamed GFF
    temp_gff_path = gff_path + ".temp"
    # open original decompressed gff file to get current chromosome names
    # write the changes to a temporaru file
    with open(gff_path, 'r') as gff_in, open(temp_gff_path, 'w') as gff_out:
        for line in gff_in:
            if line.startswith('#'): 
                gff_out.write(line)  # Write comment lines unchanged
            else:
                fields = line.split('\t')
                gff_chromosome = fields[0]
                # Look for any FAI chromosome name that contains the GFF chromosome name
                matching_fai_chromosome = next((fai_chrom for fai_chrom in fai_chromosomes if gff_chromosome in fai_chrom), None)
                # If a matching FAI chromosome is found, replace the GFF chromosome name
                if matching_fai_chromosome:
                    fields[0] = matching_fai_chromosome
                gff_out.write('\t'.join(fields))
    # Replace the original GFF file with the modified file
    import os
    os.replace(temp_gff_path, gff_path)
    return gff_path

def ensure_gff_index(gff_path, fasta_index):
    try:
        # initial decompress to allow jbrowse sort-gff
        gff_path = decompress_file(gff_path)[0]
        # Rename chromosomes using the fasta index chromosome names
        gff_path = rename_chromosomes_in_gff(gff_path, fasta_index)
        # Construct the shell command with piping and redirection to re compress
        command = f"jbrowse sort-gff {gff_path} | bgzip > {gff_path}.sorted.gff.gz"
        # Run the jbrowse command in shell
        run_command_with_node("18", command)
        # get new sorted name file
        gff_path= f"{gff_path}.sorted.gff.gz"
        print(gff_path)
        gff_index = gff_path + ".tbi"
        print(gff_index)
        if not os.path.exists(gff_index):
            print(f"Index for {gff_path} not found. Creating...")
            run_with_retry(["tabix", "-p", "gff", gff_path], module_name="htslib")
        return(gff_path)
    except subprocess.CalledProcessError as e:
        print(f"Exception during jbrowse sort-gff: {e}")

def create_jbrowse_config(arg,file):
    try:
        #run_with_temp_node("22")
        command=f"{arg} {file} --load copy --out config.json --force"
        run_command_with_node("18", command)
        #subprocess.run(command, shell=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Exception during genome browser track setup: {e}")

def add_track(file):
    create_jbrowse_config("jbrowse add-track",file)
def add_assembly(file):
    create_jbrowse_config("jbrowse add-assembly",file)

import json
import os

def copy_json_tracks():
    # Load JSON config
    with open("./config.json", 'r') as json_file:
        config_data = json.load(json_file)
  
    # Extract assemblies and tracks
    assemblies = config_data.get("assemblies", [])
    tracks = config_data.get("tracks", [])

    if assemblies:
        # Assume you want to modify the first assembly in the list
        assembly = assemblies[0]
        
        # Modify the assembly information
        new_assembly = {
            "name": assembly.get("name", ""),
            "sequence": {
                "type": assembly.get("sequence", {}).get("type", ""),
                "trackId": assembly.get("sequence", {}).get("trackId", "").replace(".fna", ""),
                "adapter": {
                    "type": "IndexedFastaAdapter",
                    "fastaLocation": {
                        "uri": (
                            "http://127.0.0.1:4200/TersectBrowserGP/tbapi/"
                            "datafiles//" + assembly.get("name", "")
                        ),
                        "locationType": "UriLocation"
                    },
                    "faiLocation": {
                        "uri": (
                            "http://127.0.0.1:4200/TersectBrowserGP/tbapi/"
                            "datafiles//" + assembly.get("name", "").replace(".fna", ".fna.fai")
                        ),
                        "locationType": "UriLocation"
                    }
                }
            }
        }

        # Prepare data for TypeScript files with updated URIs
        ts_assembly_content = "export default " + json.dumps(new_assembly, indent=2) + ";"

        # Write to assembly.ts
        with open("extension/genome-browser/src/app/react-components/assembly.ts", 'w') as assembly_file:
            assembly_file.write(ts_assembly_content)
            print("Assembly data written to assembly.ts")
    else:
        print("Assembly not found in JSON config!")

    if tracks:
        # Modify the Track entries
        new_tracks = []
        for track in tracks:
            # Update track name (remove file extension)
            track["name"] = os.path.splitext(track["name"])[0]
  
            # Update URI locations for gffGzLocation and index location
            if track["type"] == "VariantTrack":
                adapter = track["adapter"]
                if "vcfGzLocation" in adapter:
                    adapter["vcfGzLocation"]["uri"] = (
                        "http://localhost:4200/TersectBrowserGP/tbapi/datafiles//" +
                        track["trackId"] + ".gz"
                    )
                if "index" in adapter and "location" in adapter["index"]:
                    adapter["index"]["location"]["uri"] = (
                        "http://localhost:4200/TersectBrowserGP/tbapi/datafiles//" +
                        track["trackId"] + ".gz" + ".tbi"
                    )
            elif track["type"] == "FeatureTrack":
                adapter = track["adapter"]
                if "gffGzLocation" in adapter:
                    adapter["gffGzLocation"]["uri"] = (
                        "http://localhost:4200/TersectBrowserGP/tbapi/datafiles//" +
                        track["trackId"] + ".gz"
                    )
                if "index" in adapter and "location" in adapter["index"]:
                    adapter["index"]["location"]["uri"] = (
                        "http://localhost:4200/TersectBrowserGP/tbapi/datafiles//" +
                        track["trackId"] + ".gz"+ ".tbi"
                    )
            else:
                print("Unable to change uris")
            # Add to new tracks list
            new_tracks.append(track)
        # Prepare data for TypeScript files with updated URIs
        ts_tracks_content = "export default " + json.dumps(new_tracks, indent=2) + ";"

        # Write to tracks.ts
        with open("extension/genome-browser/src/app/react-components/tracks.ts", 'w') as tracks_file:
            tracks_file.write(ts_tracks_content)
            print("Tracks data written to tracks.ts")
    else:
        print("Tracks not found in JSON config!")

def deploy_browser():
    run_command_with_node("16","npm start")
    os.chdir("~/")  # Change to root directory
    subprocess.run(["mongod", "--dbpath", "mongo-data"], check=True)
    os.chdir("extension/genome-browser/")
    run_command_with_node("22", "npm start")