import modules_for_setup
from modules_for_setup import *
import os
import subprocess
import sys
import platform
import getopt
import shutil
from Bio import SeqIO

def main():
    fasta = None
    gff_file = None
    vcf_files = []
    multi_sample_vcf = None
    vcf_dir = None

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

    for o, a in opts:
        if o in ("-f", "--fasta"):
            fasta = a
            # No need to set reference_name here since it'll depend on the actual file we write
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


    # Prepare VCF files for Tersect build
    tmp_vcf_files = []
    for vcf_file in vcf_files:
        decompressed_file, needs_recompress = decompress_file(vcf_file)
        tmp_vcf_files.append(decompressed_file)

    # Build Tersect index
    print("Building Tersect index...")
    build_tersect_index(dataset_name, tmp_vcf_files)
    print("Tersect index created successfully.")

    # Recompress and index VCF files if needed
    print("Indexing files...")
    for vcf_file in tmp_vcf_files:
        ensure_vcf_index(vcf_file)
    # Ensure the FASTA file is indexed
    ensure_fasta_index(fasta)
    print("Indexing completed successfully.")

    print("Copying files for browser access...")
    # Copy necessary files for access in browser
    copy_files(fasta, gff_file, vcf_files, os.path.dirname(fasta))  
    # Copying reference fasta to root
    destination_dir = os.path.expanduser("./")
    shutil.copy2(fasta, destination_dir)

    print("Editing scripts...")
    if not (dataset_name and fasta):
        print("Required parameters missing for shell script creation.")
        sys.exit()
    write_to_shell_script(dataset_name, fasta)
    print("Loading final tersect dataset...")
    # Add dataset tsi file to tersect browser
    add_example_dataset()
    
    # Add tracks to genome browser
    # adding the assembly first creates the config
    print("Creating Genome Browser config file...")
    add_assembly(fasta)
    print("Sorting GFF file...")
    ensure_gff_index(gff_file)
    print("Adding GFF file as track...")
    add_track(gff_file)
    print("Adding accessions as tracks...")
    for vcf_file in vcf_files:
        add_track(vcf_file)
    # Adding to browser popup
    print("Editing scripts...")
    copy_json_tracks()
    
    print("Deploying on localhost...")
   # deploy_browser()

if __name__ == "__main__":
    main()