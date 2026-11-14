# Datasets built from VCF files (manifest `samples`).

checkpoint reference:
    output:
        fa='inputs/reference.fa.gz',
        chroms='chromosomes.json'
    log: 'logs/reference.log'
    run:
        sizes = genomics.prepare_reference(fetch.cached(M.fasta), output.fa,
                                           M.chromosomes, log[0])
        with open(output.chroms, 'w') as handle:
            json.dump(sizes, handle, indent=2)


rule gene_models:
    input: rules.reference.output.chroms
    output: 'inputs/genes.gff3.gz'
    log: 'logs/gene_models.log'
    run:
        genomics.prepare_gff(fetch.cached(M.gff), output[0], chromosomes(), log[0])


rule genes_table:
    input: rules.gene_models.output
    output: 'parquet/genes.parquet'
    run:
        tables.genes_to_parquet(M.id, input[0], output[0])


rule normalise:
    input:
        fa=rules.reference.output.fa,
        chroms=rules.reference.output.chroms
    output:
        vcf='samples/{sample}.vcf.gz',
        tbi='samples/{sample}.vcf.gz.tbi',
        qc='qc/{sample}.json'
    log: 'logs/normalise/{sample}.log'
    resources: mem_mb=1500
    run:
        sample = SAMPLES[wildcards.sample]
        raw = os.path.abspath('inputs/samples/%s.vcf' % sample.name)
        fetch.link(sample.vcf, raw)
        with open(input.chroms) as handle:
            chroms = json.load(handle)
        genomics.normalise_sample(raw, sample, input.fa, chroms,
                                  os.path.abspath(output.vcf), output.qc, log[0])


rule tersect_index:
    input: normalised
    output: 'tersect/next.tsi'
    log: 'logs/tersect.log'
    resources: mem_mb=2000
    run:
        genomics.tersect_build(input, output[0], M.tersect_homozygous,
                               M.tersect_types, log[0])


rule snpeff_database:
    input:
        fa=rules.reference.output.fa,
        gff=rules.gene_models.output
    output: 'snpeff.json'
    log: 'logs/snpeff_database.log'
    resources: mem_mb=6000
    run:
        config_file, database = genomics.snpeff_database(M, input.fa, input.gff[0], log[0])
        with open(output[0], 'w') as handle:
            json.dump({'config': config_file, 'database': database}, handle)


rule annotate:
    input:
        vcfs=normalised,
        snpeff='snpeff.json' if M.annotate else []
    output: 'annotated/{chrom}.vcf.gz'
    log: 'logs/annotate/{chrom}.log'
    threads: 2
    resources: mem_mb=3500
    run:
        snpeff = None
        if M.annotate:
            with open(input.snpeff) as handle:
                db = json.load(handle)
            snpeff = (db['config'], db['database'])
        genomics.merge_and_annotate(input.vcfs, wildcards.chrom, snpeff, output[0], log[0])


rule variants_table:
    input: 'annotated/{chrom}.vcf.gz'
    output:
        parquet='parquet/variants/{chrom}.parquet',
        qc='qc/variants-{chrom}.json'
    run:
        tables.variants_to_parquet(M.id, input[0], output.parquet, output.qc)


def variant_tables(wildcards=None):
    return expand('parquet/variants/{chrom}.parquet', chrom=chromosomes())


rule stage:
    input:
        variants=variant_tables,
        genes=rules.genes_table.output if M.gff else []
    output: 'staged.json'
    run:
        counts = store.stage(M, list(input.variants), input.genes[0] if M.gff else None)
        with open(output[0], 'w') as handle:
            json.dump(counts, handle)


rule genome_browser:
    input:
        fa=rules.reference.output.fa,
        gff=rules.gene_models.output if M.gff else [],
        vcfs=normalised
    output: 'browser.json'
    log: 'logs/genome_browser.log'
    run:
        tracks = [(name, 'samples/%s.vcf.gz' % name) for name in SAMPLES]
        result = browser.prepare(M, input.fa, input.gff[0] if M.gff else None, tracks,
                                 log=log[0])
        with open(output[0], 'w') as handle:
            json.dump(result, handle)


rule publish:
    input:
        tsi='tersect/next.tsi',
        staged='staged.json',
        browser='browser.json',
        fa='inputs/reference.fa.gz'
    output: 'published.json'
    log: 'logs/publish.log'
    run:
        os.makedirs(OUT, exist_ok=True)
        # The Parquet tables are the durable copy of the variant data.
        parquet_out = os.path.join(OUT, 'parquet')
        if os.path.exists(parquet_out):
            shutil.rmtree(parquet_out)
        shutil.copytree('parquet', parquet_out)
        qc = {}
        for path in sorted(os.listdir('qc')):
            with open(os.path.join('qc', path)) as handle:
                qc[path[:-5]] = json.load(handle)
        with open(os.path.join(OUT, 'qc.json'), 'w') as handle:
            json.dump(qc, handle, indent=2)
        with open(input.staged) as handle:
            staged = json.load(handle)
        # publish() moves the index into place, so build from a copy.
        next_tsi = os.path.join(OUT, M.slug + '.next.tsi')
        shutil.copyfile(input.tsi, next_tsi)
        record = store.publish(M, next_tsi, os.path.abspath(input.fa),
                               list(SAMPLES), True, {
                                   'manifest': M.path,
                                   'manifest_sha256': M.sha256,
                                   'samples': len(SAMPLES),
                                   'variants': staged.get('variants', 0),
                                   'genes': staged.get('genes', 0),
                                   'annotation': M.snpeff,
                                   'finished_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                               },
                               parquet=(variant_tables(),
                                        'parquet/genes.parquet' if M.gff else None))
        with open(output[0], 'w') as handle:
            json.dump(record, handle, indent=2, default=str)
