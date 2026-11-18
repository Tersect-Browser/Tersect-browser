/**
 * Validation of request input against the dataset it refers to.
 *
 * Values from requests end up as arguments to external tools (tersect,
 * bcftools, the analysis scripts) and inside their query languages, so they
 * are checked against what the dataset actually contains rather than only
 * against a pattern.
 */
import * as fs from 'node:fs';

import { ChromosomeIndex } from '../models/chromosomeindex';
import { runCommand } from './utils';

/** Invalid input; reported to the client as 400 Bad Request. */
export class ValidationError extends Error {}

interface DatasetLike {
    reference: string;
    tsi_location: string;
}

const sampleCache = new Map<string, { mtimeMs: number; samples: Promise<Set<string>> }>();

/** Accession names in a Tersect index (cached until the file changes). */
export function datasetSamples(tsiLocation: string): Promise<Set<string>> {
    const mtimeMs = fs.statSync(tsiLocation).mtimeMs;
    const cached = sampleCache.get(tsiLocation);
    if (cached && cached.mtimeMs === mtimeMs) {
        return cached.samples;
    }
    const samples = runCommand('tersect', ['samples', '-n', tsiLocation])
        .then(output => new Set(output.split('\n').filter(Boolean)));
    samples.catch(() => sampleCache.delete(tsiLocation));
    sampleCache.set(tsiLocation, { mtimeMs, samples });
    return samples;
}

/** An integer within [min, max]. */
export function integer(value: unknown, name: string,
                        min: number, max = Number.MAX_SAFE_INTEGER): number {
    const number = typeof value === 'string' && value.trim() !== ''
        ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isInteger(number)
        || number < min || number > max) {
        throw new ValidationError(
            `${name} must be a whole number between ${min} and ${max}`);
    }
    return number;
}

/** One of a fixed set of values. */
export function oneOf<T extends string>(value: unknown, name: string,
                                        allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
    }
    return value as T;
}

/** A plain identifier (letters, digits, '.', '_', '-'), e.g. a gene id. */
export function identifier(value: unknown, name: string): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(value)) {
        throw new ValidationError(`${name} is not a valid identifier`);
    }
    return value;
}

/** A chromosome of the dataset's reference; resolves with its size. */
export async function chromosomeOf(dataset: DatasetLike, value: unknown,
                                   name = 'chromosome'): Promise<number> {
    if (typeof value !== 'string') {
        throw new ValidationError(`${name} is required`);
    }
    const chromosome: any = await ChromosomeIndex.findOne(
        { reference: dataset.reference, name: value },
        { size: 1 }
    ).lean().exec();
    if (!chromosome) {
        throw new ValidationError(`Unknown ${name}: ${value}`);
    }
    return chromosome.size;
}

/** A 1-based, inclusive interval on a chromosome of the dataset. */
export async function regionOf(dataset: DatasetLike, chromosome: unknown,
                               interval: unknown): Promise<[number, number]> {
    const size = await chromosomeOf(dataset, chromosome);
    if (!Array.isArray(interval) || interval.length !== 2) {
        throw new ValidationError('interval must be [start, end]');
    }
    const start = integer(interval[0], 'interval start', 0, size);
    // The end may run past the chromosome by up to one (largest) bin.
    const end = integer(interval[1], 'interval end', start, size + 100_000);
    return [start, end];
}

/** Accession names, each present in the dataset's Tersect index. */
export async function accessionsOf(dataset: DatasetLike, value: unknown,
                                   name = 'accessions', min = 1,
                                   max = 100_000): Promise<string[]> {
    if (!Array.isArray(value) || value.length < min || value.length > max) {
        throw new ValidationError(
            `${name} must be a list of ${min} to ${max} accessions`);
    }
    const samples = await datasetSamples(dataset.tsi_location);
    for (const accession of value) {
        if (typeof accession !== 'string' || !samples.has(accession)) {
            throw new ValidationError(`Unknown accession in ${name}: ${accession}`);
        }
    }
    return value;
}

/** A single accession present in the dataset's Tersect index. */
export async function accessionOf(dataset: DatasetLike, value: unknown,
                                  name = 'accession'): Promise<string> {
    const [accession] = await accessionsOf(dataset, [value], name, 1, 1);
    return accession;
}
