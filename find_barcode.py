import argparse
from Bio import SeqIO

### DOUBLE CHECK BARCODE DOES NOT MATCH TO OTHER ACCESSIONS - OTHER ACCESSIONS' VARIANTS SHOULD ALSO BE CONSIDERED!!

# parse tersect output to get dict of variants (original base, alternate base) based on seq position
def load_variant_file(filepath):
    variants = {}
    with open(filepath) as f:
        for line in f:
            if line.startswith("#"):
                continue
            parts = line.strip().split("\t")
            if len(parts) < 5:
                continue
            chrom, pos, _, ref, alt = parts[:5]
            pos = int(pos)
            variants[pos] = (ref, alt)
    return variants # output: { position (int): (reference base, alternate base) }

# for the specified accession, replace bases in reference seq with alternate bases to generate accession-specific variant seq 
def apply_variants_to_sequence(ref_seq, start_pos, variants):
    seq = list(ref_seq)
    for pos, (ref, alt) in variants.items():
        rel_pos = pos - start_pos
        if 0 <= rel_pos < len(seq):
            seq[rel_pos] = alt
    return ''.join(seq)

# function to remove overlapping variants from unique_vars
def remove_overlapping_variants(unique_vars, union_vars):
    # create new dictionary --> new_unique_vars
    new_unique_vars = {}
    # for every key in unique vars, do the following:
    for position, variant in unique_vars.items():
        # check if the position is also in union_vars
        if (position in union_vars):
            # check if variants match
            if variant != union_vars[position]:
                new_unique_vars[position] = variant
        else:
            new_unique_vars[position] = variant
    
    return new_unique_vars


# using a sliding window, if the accession sequence does not match the ref seq, create a barcode for that window
def find_barcode_windows(personal_seq, ref_seq, ref_start, window_size=50, step=1):
    barcodes = []
    for i in range(0, len(personal_seq) - window_size + 1, step):
        win_start = ref_start + i
        win_end = win_start + window_size
        win_seq = personal_seq[i:i+window_size]
        ref_win_seq = ref_seq[i:i+window_size]

        if win_seq != ref_win_seq:  # Ensure it's not same as reference
            # if any(win_start <= p < win_end for p in private_positions):
                barcodes.append((win_start, win_end, win_seq))
    return barcodes

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--accession", required=True)
    parser.add_argument("--fasta", required=True)
    parser.add_argument("--chrom", required=True)
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--end", type=int, required=True)
    parser.add_argument("--unique_variants", required=True)
    parser.add_argument("--union_variants", required=True)
    args = parser.parse_args()

    # Load reference genome and window
    ref = SeqIO.to_dict(SeqIO.parse(args.fasta, "fasta"))[args.chrom].seq
    ref_window = ref[args.start - 1:args.end]  # 1-based inclusive

    # Load variant sets
    unique_vars = load_variant_file(args.unique_variants)
    union_vars = load_variant_file(args.union_variants)

    ## Reduce dictionary
    new_unique_vars = remove_overlapping_variants(unique_vars, union_vars)

    # Generate accession-specific sequence
    unique_seq = apply_variants_to_sequence(ref_window, args.start, new_unique_vars)

    # Find truly unique barcode windows
    barcodes = find_barcode_windows(unique_seq, ref_window, args.start)

    # Output results
    if not barcodes:
        print(f"❌ No unique barcodes found for {args.accession} in {args.chrom}:{args.start}-{args.end}")
    else:
        print(f"✅ Unique barcodes for {args.accession}:\n")
        print(unique_vars)
        for s, e, seq in barcodes:
            print(f"{args.chrom}:{s}-{e} -> {seq}")


# ATAT ------
# ATATAT ------

# 1. are there repeat regions?
# 2. How long are the repeat regions?