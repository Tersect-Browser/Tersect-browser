-- Variant search store for Tersect Browser.
--
-- Applied by the ClickHouse container on first start and again (idempotently)
-- by the dataset pipeline before every load. The pipeline loads a dataset into
-- a staging copy of each table and swaps it in with REPLACE PARTITION, so a
-- dataset's rows are replaced all at once and readers never see a partial load.
--
-- Partitioned by dataset: one partition per dataset.

CREATE DATABASE IF NOT EXISTS tersect;

-- One row per variant (after splitting multi-allelic sites), with its
-- predicted effects (parallel effect_* arrays, one entry per transcript/effect)
-- and the accessions that carry the alternative allele.
CREATE TABLE IF NOT EXISTS tersect.variants
(
    dataset        LowCardinality(String),
    chrom          LowCardinality(String),
    pos            UInt32,
    ref            String,
    alt            String,
    -- Most severe predicted impact: 0 none, 1 MODIFIER, 2 LOW, 3 MODERATE, 4 HIGH
    impact_rank    UInt8,
    -- Genes affected by any effect, for gene search
    genes          Array(LowCardinality(String)),
    effect         Array(LowCardinality(String)),
    effect_impact  Array(LowCardinality(String)),
    effect_gene    Array(LowCardinality(String)),
    effect_feature Array(String),
    effect_hgvs_c  Array(String),
    effect_hgvs_p  Array(String),
    -- Accessions with a non-reference genotype, and their alt allele count
    -- (1 heterozygous, 2 homozygous)
    carriers       Array(LowCardinality(String)),
    dosage         Array(UInt8),

    INDEX idx_genes genes TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_carriers carriers TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_impact impact_rank TYPE minmax GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY dataset
ORDER BY (dataset, chrom, pos, ref, alt);

-- Gene models, for gene-name search and gene coordinates.
CREATE TABLE IF NOT EXISTS tersect.genes
(
    dataset     LowCardinality(String),
    gene_id     String,
    name        String,
    chrom       LowCardinality(String),
    start       UInt32,
    end         UInt32,
    strand      Int8,
    description String,

    INDEX idx_search lower(concat(gene_id, ' ', name, ' ', description))
        TYPE ngrambf_v1(3, 4096, 2, 0) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY dataset
ORDER BY (dataset, gene_id);
