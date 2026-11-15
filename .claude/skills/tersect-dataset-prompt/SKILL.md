---
name: tersect-dataset-prompt
description: Write the prompt a user pastes into the Tersect Browser dataset assistant to load a genomics dataset (reference FASTA, gene models, per-accession VCFs). Use this whenever someone wants to add, load, import, replicate or extend a dataset in Tersect Browser, mentions a paper, DOI, species panel, VCF folder or resequencing project they want to browse, asks "what should I tell the assistant", or says the built-in assistant gave a vague or wrong answer. The assistant runs on a small local model that follows explicit instructions well and guesses badly, so a well-formed prompt is the difference between a correct dataset and a failed build.
---

# Prompts for the Tersect Browser dataset assistant

Tersect Browser has a dataset assistant: a chat panel beside the "New dataset"
wizard that proposes the form's values. It runs on a small local model
(qwen3:8b or qwen3:14b). Given exact locations and explicit rules it does the
job in under a minute. Given a vague request ("load the rice genomes") it
invents file names, proposes the wrong species, or says it cannot help.

Your job is to do the thinking the small model cannot: find and verify where
the data are, anticipate what will go wrong, and hand the user a prompt that
leaves the assistant nothing to guess.

## What the assistant can and cannot do

It can:

- read a paper from a DOI or URL (full text only when it is open access;
  many publishers refuse automated access, leaving it the abstract);
- list a folder, if the folder is an ordinary web index page or an FTP folder;
- read a CSV, TSV or XLSX table from a URL (for example a supplementary table);
- check whether URLs exist, which the server also does for every link it
  proposes;
- propose: the reference (FASTA, GFF3, id, dataset name), accessions, build
  options, a contig rename map, and labels/groups for accessions.

It cannot:

- search the web. It only opens links it is given or finds in a paper;
- list an S3 bucket or any location without an index page. Give explicit file
  URLs for those;
- build, save or delete anything. The user applies each proposal card, accepts
  it in the form, and starts the build;
- start from raw reads. The pipeline needs VCFs.

## What a dataset needs

| Input | Required | Notes |
|---|---|---|
| Reference FASTA (`.fa`, `.fa.gz`) | yes | Defines the chromosomes. |
| Gene models (GFF3) | no | Needed to build variant effects. |
| VCFs | at least 2 accessions | One file per accession, or samples of a multi-sample VCF. Must be called against that same reference assembly. |
| Options | defaults exist | Variant types: SNPs, indels or both. Homozygous only: yes or no. Variant effects: build from the GFF3, a prebuilt snpEff database, or none. |

Accession names must match `[A-Za-z0-9][A-Za-z0-9._-]*`. Labels are free text.

## Workflow

### 1. Establish what the user wants

A new dataset, or more accessions for an existing one? Which species or paper?
How many accessions? If they named a paper, the paper is context, not a data
source: what matters is where VCFs can be downloaded.

### 2. Find the data and verify every link

Never put a URL in the prompt that you have not checked. The whole point of
this skill is to replace guessing with verified locations; an invented link
costs the user a failed build.

- If you can search the web and fetch pages, find the reference assembly, the
  gene models and the VCF location, then confirm each one exists.
- If you cannot, ask the user for the locations, or leave a clearly marked
  placeholder such as `<URL of the folder with the VCFs>` and say what to put
  there. Do not fill gaps from memory.

Useful places to look: Ensembl Plants (`ftp.ensemblgenomes.ebi.ac.uk/pub/plants/current/`,
with `fasta/<species>/dna/` and `gff3/<species>/`), species databases (Sol
Genomics Network, LegumeInfo, RAP-DB), project sites (1001 Genomes), and AWS
Open Data.

If you have a shell on a machine running Tersect Browser, the builder service
verifies things exactly as the assistant will (default port 4310):

```bash
# Do these links exist, and how big are they?
curl -s -X POST localhost:4310/api/datasets/check-urls \
  -H 'Content-Type: application/json' -d '{"urls":["<url>","<url>"]}'

# Samples and contig names of a VCF (reads only the header, also for URLs)
curl -s -X POST localhost:4310/api/datasets/inspect \
  -H 'Content-Type: application/json' \
  -d '{"file":{"source":"url","location":"<vcf url>","name":"x"},"kind":"vcf"}'

# Sequence names and lengths of a FASTA (kind "fasta"); a remote FASTA is
# downloaded first, so repeat the call after a few seconds
```

### 3. Check the four things that break builds

1. **Reads-only papers.** Most papers deposit raw reads (FASTQ, SRA, ENA), not
   VCFs. Look for a later release of variant calls by the same project. If
   there are none, tell the user the dataset cannot be built until the reads
   are aligned and variants called; do not write a prompt that pretends
   otherwise.
2. **Chromosome names.** Compare the VCF's contig names with the FASTA's
   sequence names (`chr01` against `1` is the classic mismatch). A mismatch is
   not fatal: the wizard offers a rename map in step 2. Tell the user to expect
   it and apply it.
3. **File size.** Note the size of each VCF. All-sites VCFs (a record for
   every position, often 1 GB or more per accession) work but are slow to
   download; suggest starting with a handful. Variants-only files of a few MB
   are ideal.
4. **Same assembly.** The VCFs must have been called against the reference you
   name. A different assembly version gives wrong positions with no error.

Also check free disk space is plausible for the downloads, and for a first
test keep to 5 to 20 accessions.

### 4. Write the prompt

Follow the template and the rules below. Then give the user the prompt in a
code block they can copy, followed by short notes: what you verified, what to
expect in the wizard, and anything you could not check.

## Rules for the prompt, and why

**Give exact URLs for the reference.** Full links to the FASTA and the GFF3,
plus the reference id. The assistant cannot search, and a named assembly
without a link gets a made-up link.

**For a folder of VCFs, give the folder URL and a file pattern.** The
assistant passes these to the server, which lists the real folder and builds
one row per matching file. This is the most reliable way to add accessions:
the model writes a few words instead of one row per file, and cannot invent a
name. The pattern is a shell-style glob matched against file names: `*` any
characters, `?` one character, `[23]` one of a set. Check your pattern against
the actual listing and state how many files it should match.

**Say how to name the accessions.** Give a `name_regex` whose first group is
the name, with an example: "name each accession by its RF number, for example
RF_020 (name_regex `^(RF_\d+)`)". Without it the names are long file prefixes.

**List explicit URLs when there is no listable folder** (S3 buckets, scattered
files). One line per accession: the name, then the URL.

**Be exact, not approximate.** "Use only the files matching `RF_0[23]*`", not
"about 20 files". An approximate request leaves the choice to the model.

**When adding to an existing dataset, exclude what is already there.** In add
mode the assistant does not know the existing accessions' names, so a broad
pattern would add the same VCF again under a new name. Choose a pattern that
cannot match the existing files, and say "do not include any other files".

**State the options in the wizard's own words.** "SNPs only", "SNPs and
indels", "homozygous only", "variant effects built from the GFF3". Give the
reason for homozygous only when it applies (inbred or selfing species).

**Tell it to use the calls, not the reads,** when the paper is reads-only but
variant calls exist elsewhere. Otherwise it reads the paper, sees FASTQ, and
correctly refuses.

**Keep labels and groups for a second prompt.** First prompt: reference,
accessions, options. After the user accepts the accessions, a second prompt
with a small table (name, label, group) fills in labels. Tables longer than a
few dozen rows are better pasted into the wizard's "Accession sheet" dialog.

**Do not ask it to find, search or decide.** Phrase everything as what to use,
not what to look for.

## Template

```
Set up a new dataset called "<name>".

Reference: <assembly name> from <source>
  FASTA: <full URL>
  GFF3:  <full URL>
  Reference id <short id, e.g. TAIR10>.

Accessions: per-accession VCFs in this folder:
<folder URL, ending in />
Use only the files matching <glob pattern> and name each accession by
<rule> (name_regex <regex with one group>).

Options: <SNPs only | SNPs and indels>, <homozygous only (reason) | all
genotypes>, variant effects <built from the GFF3 | none>.
```

For explicit files, replace the Accessions block with:

```
Accessions (one VCF each, aligned to <assembly>):
  <name> <full URL>
  <name> <full URL>
```

For adding to an existing dataset, the user opens the dataset's menu on Home,
chooses "Add accessions", and the prompt is only the Accessions block,
starting "Add <n> accessions from this folder of per-accession VCFs:" and
ending "Do not include any other files."

## Worked examples

**New dataset from a listable folder** (Arabidopsis, 1001 Genomes; VCFs of
2 to 4 MB, chromosome names match, 7 files match the pattern):

```
Set up a new dataset called "Arabidopsis 1001 Genomes test".

Reference: Arabidopsis thaliana TAIR10 from Ensembl Plants
  FASTA: https://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/current/fasta/arabidopsis_thaliana/dna/Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.gz
  GFF3:  https://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/current/gff3/arabidopsis_thaliana/Arabidopsis_thaliana.TAIR10.63.gff3.gz
  Reference id TAIR10.

Accessions: per-accession VCFs from the 1001 Genomes Project, in this folder:
https://1001genomes.org/data/GMI-MPI/releases/v3.1/intersection_snp_short_indel_vcf/
Use only the files matching intersection_1000* and name each accession
by the number in its file name (name_regex intersection_(\d+)).

Options: SNPs and indels, homozygous only (Arabidopsis is selfing),
variant effects built from the GFF3.
```

**Adding accessions to an existing dataset** (tomato; the dataset already
holds RF_001, 002, 004, 006, 008, 011, 044 and 045, so the pattern selects
RF_020 to RF_039, exactly 20 files):

```
Add 20 accessions from this folder of per-accession VCFs:
https://solgenomics.net/ftp/genomes/tomato_150/150_VCFs_2.50/

Use only the files matching the pattern RF_0[23]* (RF_020 to RF_039).
Name each accession by its RF number, for example RF_020
(name_regex ^(RF_\d+)). Do not include any other files.
```

**Explicit URLs, reads-only paper with calls elsewhere** (3,000 Rice Genomes;
the VCFs are in an S3 bucket that cannot be listed, are about 2 GB each, and
name chromosomes `chr01` where the reference uses `1`):

```
Build a small test dataset from the 3,000 Rice Genomes Project
(doi:10.1186/2047-217X-3-7) using its published per-accession SNP calls
on AWS, not the reads.

Reference: Nipponbare IRGSP-1.0 from Ensembl Plants
  FASTA: https://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/current/fasta/oryza_sativa/dna/Oryza_sativa.IRGSP-1.0.dna.toplevel.fa.gz
  GFF3:  https://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/current/gff3/oryza_sativa/Oryza_sativa.IRGSP-1.0.63.chr.gff3.gz
  Reference id IRGSP-1.0.

Accessions (one VCF each, aligned to Nipponbare):
  B001 https://3kricegenome.s3.amazonaws.com/Nipponbare/B001.snp.vcf.gz
  B002 https://3kricegenome.s3.amazonaws.com/Nipponbare/B002.snp.vcf.gz
  B003 https://3kricegenome.s3.amazonaws.com/Nipponbare/B003.snp.vcf.gz
  B004 https://3kricegenome.s3.amazonaws.com/Nipponbare/B004.snp.vcf.gz

Options: SNPs only, homozygous only (inbred lines), variant effects
built from the GFF3.
```

The Ensembl `current` folder moves with each release and the GFF3 file name
contains the release number, so re-check those links rather than copying them
from here.

**Labels, as a second prompt** after the accessions are accepted:

```
Fill labels and groups for these accessions from this table.
The first column is the accession name, the second is the label.
Group: S.lyc = S. lycopersicum.

RF_020	S.lyc LYC3153
RF_021	S.lyc LYC3155
```

## What to tell the user alongside the prompt

- Where to paste it: Home, "New dataset" (or the dataset's menu, "Add
  accessions"), then the Assistant button.
- Each proposal appears as a card. Apply it, then accept the suggestion in the
  form; nothing is used until accepted.
- In step 1, click "Select main chromosomes" to leave out scaffolds and
  organelles.
- If you found a chromosome-name mismatch: step 2 will show a rename map;
  apply it to all files.
- Review lists any remaining problems before the build starts.
- What you verified (links, sizes, counts) and what you could not.

If the assistant's reply is vague or proposes nothing, the usual cause is a
missing location. Send a follow-up that restates the folder or file URLs
rather than rephrasing the request.
