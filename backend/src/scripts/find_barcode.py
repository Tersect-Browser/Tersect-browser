import argparse
from Bio import SeqIO
import datetime
import os


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
def find_barcode_windows(personal_seq, ref_seq, ref_start, window_size, step=1):
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

# count how many unique variants fall within the barcode length, and their relative position within the barcode
def count_variant_number(barcode_start, barcode_end, variants):
    # results = ""
    variant_positions = []
    count = 0
    for position, variant in variants.items():
        if barcode_start <= position <= barcode_end:
            count += 1
            pos = position - barcode_start
            variant_positions.append(pos)
    # results.append((count, variant_positions))
    return count, variant_positions
    

# Calculate repeat content in a barcode using a sliding window of 2 bp
def find_dinucleotide_repeats_custom(sequence):
    """
    Scans the sequence for 2-character repeats using your custom logic:
    - If position i==i+2 and i+1==i+3 (i.e., two 2-character chunks match)
    - Count how many times the same 2-bp pattern repeats in tandem
    - Returns a list of (unit, count, start, end) for each repeat found
    """
    i = 0
    results_repeat = ""
    results_multi = ""
    results_start_end = ""

 
    while i < len(sequence) - 3:
        first = sequence[i:i+2] # pos i and i+1 (b1 and b2)
        second = sequence[i+2:i+4] # pos i+2 and i+3 (b3 and b4)
 
        if first == second:
            count = 2
            j = i + 4 # pos i+4 (b5)
            while j + 1 < len(sequence) and sequence[j:j+2] == first:
                count += 1
                j += 2
            if count > 2:
                results_repeat = results_repeat + "(" + first + ")"
                results_multi = results_multi + "(" + str(count) + ")"
                results_start_end = results_start_end + "(" + str(i) + ',' + str(j) + ")"
            i = j  # Skip past the whole repeat
        else:
            i += 1  # No repeat, move one position right
 
    return results_repeat, results_multi, results_start_end

# highlight variant position in barcode with square brackets
def highlight_positions(seq, positions):
    highlighted = ''
    for i, base in enumerate(seq):
        if i in positions:
            highlighted += "[" + base + "]"
        else:
            highlighted += base
    return highlighted

# highlight variant position in barcode with square brackets and ref/alt
def highlight_ref_alt_positions(seq, positions, barcode_start, variants):
    highlighted = ''
    for i, base in enumerate(seq):
        abs_pos = barcode_start + i
        if i in positions and abs_pos in variants:
            ref_base, alt_base = variants[abs_pos]
            highlighted += "[{}/{}]".format(ref_base, alt_base)
        else:
            highlighted += base
    return highlighted


# calculate gc content per barcode
def calculate_gc_content(barcode):
    length = len(barcode)
    c_count = barcode.count("C")
    g_count = barcode.count("G")
    gc_count = ((c_count + g_count)/length)*100
    return round(gc_count,6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--accession", required=True)
    parser.add_argument("--fasta", required=True)
    parser.add_argument("--chrom", required=True)
    parser.add_argument("--start", type=int, required=True)
    parser.add_argument("--end", type=int, required=True)
    parser.add_argument("--size", type=int, required=True) ### ADD CHECK
    parser.add_argument("--unique_variants", required=True)
    parser.add_argument("--union_variants", required=True)
    parser.add_argument("--max_variants", type=int, required=False)
    args = parser.parse_args()

    print('Python script running')

    # Check if user-inputted barcode size is less than the interval
    interval = args.end - args.start
    if args.size >= interval:
        print('Barcode size too large!')
    
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
    barcodes = find_barcode_windows(unique_seq, ref_window, args.start, args.size)

    print('barcodes generated - now printing to file')

    # # find system date and time
    ct = datetime.datetime.now().strftime('%Y-%m-%d_%H:%M:%S')

    # # create file to hold output results
    try:
        filename = '_'.join([str(ct), "TB_Barcode_Gen", str(args.accession)]) + '.txt'
        print('created file name', filename)
        outputFolder = '../~/mongo-data/gp_data_copy/barcodes/'
        print('created output foler', outputFolder)
        fullPath = os.path.join(outputFolder, filename)
        print('created fullPath', fullPath)

        os.makedirs(outputFolder, exist_ok=True)

    except IOError as e:
        print(f"Error with file I/O: {e}")

    
    try:
        with open(fullPath, "w", encoding="utf-8") as f:
        # f = open("barcode_output.tsv", "w")

            # # write system date and time  to the file
            f.write('##' +ct + ' TersectBrowser+, Cranfield University (c)' + '\n')

            # # Output the parameters to the file
            f.write('##\n')
            f.write('##Accession\tChromosome\tInterval_Start\tInterval_End\tBarcodeSize\n')
            f.write('\t'.join(['##' + str(args.accession), str(args.chrom), str(args.start), str(args.end), str(args.size)])+'\n')
            f.write('##\n')
            f.write('##Sequence="Full-length barcode sequence. SNVs are highlighted in the format: [original base/alternate base]."\n')
            f.write('##Chromosome="Chromosomal position of the barcode."\n')
            f.write('##Barcode_Start="Relative start position of the barcode within the chromosome."\n')
            f.write('##Barcode_End="Relative end position of the barcode within the chromosome."\n')
            f.write('##Length="Barcode length."') ######
            f.write('##Variant_Count="Total number of accession-specific SNVs within the barcode sequence."\n')
            f.write('##Variant_Position="Absolute positions of accession-specific SNVs within the barcode sequence."\n')
            f.write('##Repeat_Sequence="Regions where a dinucleotide (2-base pair) sequence repeats consecutively three or more times."\n')
            f.write('##Repeat_Multiplier="Number of consecutive repeats of a dinucleotide sequence."\n')
            f.write('##Repeat_Start-End="Absolute start and end positions of the repeat region within the barcode."\n')
            f.write('##GC_Content="Percentage GC in the barcode, rounded to six decimal places."\n')
            f.write('##\n')
            
            # calculate variant number, repeat content,  and gc content in barcodes and save to output file
            f.write("#Sequence\tChromosome\tBarcode_Start\tBarcode_End\tLength\tVariant_Count\tVariant_Position\tRepeat_Sequence\tRepeat_Multiplier\tRepeat_Start-End\tGC_Content\n")
            for s,e,seq in barcodes:
                # calculate variant number stats
                var = count_variant_number(s, e, new_unique_vars)

                if args.max_variants is None or var[0] <= args.max_variants:
                    # highlight variant within barcode
                    highlighted_barcode = highlight_ref_alt_positions(seq, var[1], s, new_unique_vars)
                    # calculate repetitive regions
                    count = find_dinucleotide_repeats_custom(seq)
                    # calculate gc content
                    gc = calculate_gc_content(seq)
                    # print stats to file
                    f.write('\t'.join([
                        str(highlighted_barcode), 
                        str(args.chrom), 
                        str(s), 
                        str(e),
                        str(args.size),
                        str(var[0]),
                        str(var[1]),
                        str(count[0]), 
                        str(count[1]), 
                        str(count[2]),
                        str(gc)
                    ]))

                    # # highlight variant within barcode
                    # highlighted_barcode = highlight_ref_alt_positions(seq, var[1], s, new_unique_vars)

                    # # print barcode stats
                    # f.write('\t'.join([str(highlighted_barcode), str(args.chrom), str(s), str(e)]) + '\t')

                    # # print variant number stats
                    # f.write(str(var[0]) + '\t')
                    # f.write(str(var[1]) + '\t')

                    # # print repeat region stats
                    # count = find_dinucleotide_repeats_custom(seq)
                    # f.write('\t'.join([str(count[0]), str(count[1]), str(count[2])])+ '\t')

                    # # print gc content
                    # gc = calculate_gc_content(seq)
                    # f.write(str(gc) + '\n')

                # f.write('\t'.join([
                #     str(highlighted_barcode), 
                #     str(args.chrom), 
                #     str(s), 
                #     str(e),
                #     var[0],
                #     var[1],
                #     str(count[0]), 
                #     str(count[1]), 
                #     str(count[2]),
                #     str(gc)
                # ]))

    except Exception as e:
        print(f"Error with file I/O when writing to file: {e}")
    


