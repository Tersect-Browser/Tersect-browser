"""Columnar tables for variant search, written as Parquet.

variants/<chromosome>.parquet   one row per variant: effects (parallel
                                arrays) and the accessions carrying it
genes.parquet                   gene models: id, name, location, description

Columns match the ClickHouse tables in clickhouse/schema.sql. The Parquet
files are the durable output of a build: ClickHouse can be reloaded from them
without running the pipeline again, and they can be read directly with
DuckDB, pandas or Spark.
"""
import gzip
import json
import os
import subprocess
from urllib.parse import unquote

import pyarrow as pa
import pyarrow.parquet as pq

IMPACT_RANK = {'MODIFIER': 1, 'LOW': 2, 'MODERATE': 3, 'HIGH': 4}
BATCH_ROWS = 100_000

_strings = pa.list_(pa.string())
VARIANT_SCHEMA = pa.schema([
    ('dataset', pa.string()),
    ('chrom', pa.string()),
    ('pos', pa.uint32()),
    ('ref', pa.string()),
    ('alt', pa.string()),
    ('impact_rank', pa.uint8()),
    ('genes', _strings),
    ('effect', _strings),
    ('effect_impact', _strings),
    ('effect_gene', _strings),
    ('effect_feature', _strings),
    ('effect_hgvs_c', _strings),
    ('effect_hgvs_p', _strings),
    ('carriers', _strings),
    ('dosage', pa.list_(pa.uint8())),
])

GENE_SCHEMA = pa.schema([
    ('dataset', pa.string()),
    ('gene_id', pa.string()),
    ('name', pa.string()),
    ('chrom', pa.string()),
    ('start', pa.uint32()),
    ('end', pa.uint32()),
    ('strand', pa.int8()),
    ('description', pa.string()),
])


def _gene_id(value):
    # GFF3 ids are often typed, e.g. "gene:Solyc01g005000.2".
    return value.split(':', 1)[1] if value.startswith('gene:') else value


def _parse_ann(ann, alt):
    """snpEff ANN entries for one allele, as parallel lists."""
    columns = ([], [], [], [], [], [])
    genes = []
    rank = 0
    if ann in ('', '.'):
        return columns, genes, rank
    for entry in ann.split(','):
        fields = entry.split('|')
        if len(fields) < 11 or (fields[0] and fields[0] != alt):
            continue
        effect, impact, gene_name, gene_id = fields[1], fields[2], fields[3], fields[4]
        gene = _gene_id(gene_id or gene_name)
        columns[0].append(effect)
        columns[1].append(impact)
        columns[2].append(gene)
        columns[3].append(fields[6])
        columns[4].append(fields[9])
        columns[5].append(fields[10])
        rank = max(rank, IMPACT_RANK.get(impact, 0))
        for name in (gene, _gene_id(gene_name)):
            # Intergenic effects name both flanking genes as "A-B".
            if name and name not in genes and '-' not in name:
                genes.append(name)
    return columns, genes, rank


def _dosage(genotype):
    alleles = genotype.replace('|', '/').split('/')
    return sum(1 for allele in alleles if allele not in ('0', '.', ''))


def variants_to_parquet(dataset, vcf, target, qc_path):
    samples = [s for s in subprocess.run(
        ['bcftools', 'query', '-l', vcf], check=True, capture_output=True,
        text=True).stdout.splitlines() if s]
    has_ann = '##INFO=<ID=ANN' in subprocess.run(
        ['bcftools', 'view', '-h', vcf], check=True, capture_output=True,
        text=True).stdout
    query = '%CHROM\t%POS\t%REF\t%ALT\t' + ('%INFO/ANN' if has_ann else '.') + '[\t%GT]\n'
    process = subprocess.Popen(['bcftools', 'query', '-f', query, vcf],
                               stdout=subprocess.PIPE, text=True, bufsize=1 << 20)

    partial = target + '.partial'
    writer = pq.ParquetWriter(partial, VARIANT_SCHEMA, compression='zstd')
    names = VARIANT_SCHEMA.names
    batch = {name: [] for name in names}
    counts = {'variants': 0, 'by_impact': {}, 'carrier_rows': 0}

    def flush():
        if batch['pos']:
            writer.write_table(pa.table(batch, schema=VARIANT_SCHEMA))
            for name in names:
                batch[name] = []

    for line in process.stdout:
        fields = line.rstrip('\n').split('\t')
        chrom, pos, ref, alt, ann = fields[:5]
        carriers, dosage = [], []
        for sample, genotype in zip(samples, fields[5:]):
            count = _dosage(genotype)
            if count:
                carriers.append(sample)
                dosage.append(min(count, 255))
        if not carriers:
            continue
        (effect, impact, gene, feature, hgvs_c, hgvs_p), genes, rank = _parse_ann(ann, alt)
        for name, value in (('dataset', dataset), ('chrom', chrom), ('pos', int(pos)),
                            ('ref', ref), ('alt', alt), ('impact_rank', rank),
                            ('genes', genes), ('effect', effect),
                            ('effect_impact', impact), ('effect_gene', gene),
                            ('effect_feature', feature), ('effect_hgvs_c', hgvs_c),
                            ('effect_hgvs_p', hgvs_p), ('carriers', carriers),
                            ('dosage', dosage)):
            batch[name].append(value)
        counts['variants'] += 1
        counts['carrier_rows'] += len(carriers)
        level = next((k for k, v in IMPACT_RANK.items() if v == rank), 'NONE')
        counts['by_impact'][level] = counts['by_impact'].get(level, 0) + 1
        if len(batch['pos']) >= BATCH_ROWS:
            flush()
    flush()
    writer.close()
    if process.wait() != 0:
        os.remove(partial)
        raise RuntimeError('bcftools query failed for %s' % vcf)
    os.replace(partial, target)
    with open(qc_path, 'w') as handle:
        json.dump(counts, handle, indent=2)


def _attributes(column):
    attributes = {}
    for item in column.strip().split(';'):
        if '=' in item:
            key, value = item.split('=', 1)
            attributes[key] = unquote(value)
    return attributes


def genes_to_parquet(dataset, gff, target):
    genes, descriptions = {}, {}
    opener = gzip.open if gff.endswith('.gz') else open
    with opener(gff, 'rt') as handle:
        for line in handle:
            if line.startswith('#') or not line.strip():
                continue
            fields = line.rstrip('\n').split('\t')
            if len(fields) < 9:
                continue
            attributes = _attributes(fields[8])
            if fields[2] == 'gene' and 'ID' in attributes:
                gene_id = _gene_id(attributes['ID'])
                genes[gene_id] = {
                    'dataset': dataset, 'gene_id': gene_id,
                    'name': attributes.get('Name', gene_id),
                    'chrom': fields[0], 'start': int(fields[3]), 'end': int(fields[4]),
                    'strand': 1 if fields[6] == '+' else -1 if fields[6] == '-' else 0,
                    'description': attributes.get('Note') or attributes.get('description', ''),
                }
            elif fields[2] in ('mRNA', 'transcript') and 'Parent' in attributes:
                note = attributes.get('Note') or attributes.get('description')
                parent = _gene_id(attributes['Parent'].split(',')[0])
                if note and parent not in descriptions:
                    descriptions[parent] = note
    rows = list(genes.values())
    for row in rows:
        if not row['description']:
            row['description'] = descriptions.get(row['gene_id'], '')
    table = pa.Table.from_pylist(rows, schema=GENE_SCHEMA)
    pq.write_table(table, target + '.partial', compression='zstd')
    os.replace(target + '.partial', target)
    return len(rows)
