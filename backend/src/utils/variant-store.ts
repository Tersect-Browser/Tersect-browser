/**
 * Variant search, backed by ClickHouse (clickhouse/schema.sql). Tables are
 * filled by the dataset pipeline (pipeline/README.md).
 *
 * Every request value is passed as a typed query parameter ({name:Type}),
 * never spliced into SQL.
 */
import { createClient } from '@clickhouse/client';

const client = createClient({
    url: `http://${process.env.TB_CLICKHOUSE_HOST ?? 'localhost'}:${process.env.TB_CLICKHOUSE_PORT ?? '8123'}`,
    username: process.env.TB_CLICKHOUSE_USER ?? 'tersect_reader',
    password: process.env.TB_CLICKHOUSE_PASSWORD ?? 'tersect_reader',
    database: 'tersect',
    request_timeout: 30_000,
});

export const IMPACT_LEVELS = ['HIGH', 'MODERATE', 'LOW', 'MODIFIER'] as const;
export type ImpactLevel = typeof IMPACT_LEVELS[number];

/** Most results returned by one search; `total` reports the full count. */
export const MAX_VARIANTS = 5000;

export interface VariantEffect {
    effect: string;
    impact: string;
    gene: string;
    feature: string;
    hgvs_c: string;
    hgvs_p: string;
}

export interface VariantRow {
    chr: string;
    pos: { start: number };
    ref: string;
    alt: string;
    /** Effects as "effect(IMPACT|gene)" entries, for display. */
    eff: string;
    effects: VariantEffect[];
    accessions: string[];
    /** Alternative allele count per accession (1 het, 2 hom), in order. */
    dosage: number[];
}

export interface VariantSearch {
    region: string;
    filter: string;
    count: number;
    total: number;
    variants: VariantRow[];
    totalAccessions: string[];
}

interface RawRow {
    chrom: string;
    pos: number;
    ref: string;
    alt: string;
    effect: string[];
    effect_impact: string[];
    effect_gene: string[];
    effect_feature: string[];
    effect_hgvs_c: string[];
    effect_hgvs_p: string[];
    carriers: string[];
    dosage: number[];
}

async function rows<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
    const result = await client.query({ query, query_params: params, format: 'JSONEachRow' });
    return result.json<T>();
}

function toVariant(row: RawRow): VariantRow {
    const effects = row.effect.map((effect, i) => ({
        effect,
        impact: row.effect_impact[i],
        gene: row.effect_gene[i],
        feature: row.effect_feature[i],
        hgvs_c: row.effect_hgvs_c[i],
        hgvs_p: row.effect_hgvs_p[i],
    }));
    return {
        chr: row.chrom,
        pos: { start: Number(row.pos) },
        ref: row.ref,
        alt: row.alt,
        eff: effects.map(e => `${e.effect}(${e.impact}|${e.gene})`).join(','),
        effects,
        accessions: row.carriers,
        dosage: row.dosage.map(Number),
    };
}

const COLUMNS = `chrom, pos, ref, alt, effect, effect_impact, effect_gene,
                 effect_feature, effect_hgvs_c, effect_hgvs_p, carriers, dosage`;

async function search(where: string, params: Record<string, unknown>,
                      region: string, filter: string): Promise<VariantSearch> {
    const [variants, [summary]] = await Promise.all([
        rows<RawRow>(`SELECT ${COLUMNS} FROM variants WHERE ${where}
                      ORDER BY chrom, pos LIMIT {limit:UInt32}`,
                     { ...params, limit: MAX_VARIANTS }),
        rows<{ total: string; accessions: string[] }>(
            `SELECT count() AS total, arraySort(groupUniqArrayArray(carriers)) AS accessions
             FROM variants WHERE ${where}`, params),
    ]);
    return {
        region,
        filter,
        count: variants.length,
        total: Number(summary?.total ?? 0),
        variants: variants.map(toVariant),
        totalAccessions: summary?.accessions ?? [],
    };
}

/** Variants in an interval with an effect of the given impact. */
export function variantsInInterval(dataset: string, chromosome: string,
                                   start: number, end: number,
                                   impact: ImpactLevel): Promise<VariantSearch> {
    return search(
        `dataset = {dataset:String} AND chrom = {chrom:String}
         AND pos BETWEEN {start:UInt32} AND {end:UInt32}
         AND has(effect_impact, {impact:String})`,
        { dataset, chrom: chromosome, start, end, impact },
        `${chromosome}:${start}-${end}`, impact);
}

/** Variants affecting a gene, optionally with an effect of the given impact. */
export function variantsInGene(dataset: string, gene: string,
                               impact?: ImpactLevel): Promise<VariantSearch> {
    return search(
        `dataset = {dataset:String} AND has(genes, {gene:String})`
        + (impact ? ' AND has(effect_impact, {impact:String})' : ''),
        { dataset, gene, impact }, gene, impact ?? '');
}

export interface GeneMatch {
    gene_id: string;
    name: string;
    chrom: string;
    start: number;
    end: number;
    description: string;
}

/** Genes whose id, name or description contains the search term. */
export async function searchGenes(dataset: string, term: string,
                                  chromosome?: string, limit = 20): Promise<GeneMatch[]> {
    const matches = await rows<GeneMatch>(
        `SELECT gene_id, name, chrom, start, end, description FROM genes
         WHERE dataset = {dataset:String}
           ${chromosome ? 'AND chrom = {chrom:String}' : ''}
           AND positionCaseInsensitive(concat(gene_id, ' ', name, ' ', description),
                                       {term:String}) > 0
         ORDER BY startsWith(lower(gene_id), lower({term:String})) DESC, gene_id
         LIMIT {limit:UInt32}`,
        { dataset, chrom: chromosome, term, limit });
    return matches.map(m => ({ ...m, start: Number(m.start), end: Number(m.end) }));
}
