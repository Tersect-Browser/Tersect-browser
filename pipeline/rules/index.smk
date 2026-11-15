# Datasets from an existing Tersect index (manifest `index`), without VCF
# files: distance plot and genome browser, but no variant search.
#
# tersect opens an index read-write, so the steps use a copy in the working
# directory: the original may be on a read-only mount (or be a URL).

INDEX = 'inputs/index.tsi'


rule index_copy:
    output: INDEX
    run:
        with failures.recorded('index_copy', wildcards):
            with genomics.atomic_output(output[0]) as path:
                shutil.copyfile(fetch.cached(M.index), path)


checkpoint reference:
    input: INDEX
    output:
        chroms='chromosomes.json',
        fa='inputs/reference.fa.gz' if M.fasta else []
    log: 'logs/reference.log'
    run:
        with failures.recorded('reference', wildcards):
            sizes = genomics.tersect_chromosomes(input[0])
            if M.chromosomes:
                sizes = [c for c in sizes if c['name'] in M.chromosomes]
            if M.fasta:
                genomics.prepare_reference(fetch.cached(M.fasta), output.fa,
                                           [c['name'] for c in sizes], log[0])
            with open(output.chroms, 'w') as handle:
                json.dump(sizes, handle, indent=2)


rule gene_models:
    input: rules.reference.output.chroms
    output: 'inputs/genes.gff3.gz'
    log: 'logs/gene_models.log'
    run:
        with failures.recorded('gene_models', wildcards):
            genomics.prepare_gff(fetch.cached(M.gff), output[0], chromosomes(), log[0])


rule genome_browser:
    input:
        fa=rules.reference.output.fa,
        gff=rules.gene_models.output if M.gff else [],
        tsi=INDEX
    output: 'browser.json'
    log: 'logs/genome_browser.log'
    run:
        with failures.recorded('genome_browser', wildcards):
            result = browser.prepare(M, input.fa, input.gff[0] if M.gff else None,
                                     [], tsi=input.tsi, log=log[0])
            with open(output[0], 'w') as handle:
                json.dump(result, handle)


rule publish:
    input:
        chroms=rules.reference.output.chroms,
        tsi=INDEX,
        browser=rules.genome_browser.output if M.fasta else []
    output: 'published.json'
    log: 'logs/publish.log'
    run:
        with failures.recorded('publish', wildcards):
            os.makedirs(OUT, exist_ok=True)
            next_tsi = os.path.join(OUT, M.slug + '.next.tsi')
            shutil.copyfile(input.tsi, next_tsi)
            fasta = os.path.abspath(rules.reference.output.fa) if M.fasta else None
            record = store.publish(M, next_tsi, fasta, genomics.accessions(input.tsi), False, {
                'manifest': M.path,
                'manifest_sha256': M.sha256,
                'finished_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            })
            with open(output[0], 'w') as handle:
                json.dump(record, handle, indent=2, default=str)
