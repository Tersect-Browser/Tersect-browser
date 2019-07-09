export interface Chromosome {
    name: string;
    size: number; // in bp
}

// Temporary (should be loaded from tersect)
export const SL2_50_chromosomes = [
    { label: 'Chromosome 1 (98.54Mbp)', value: { name: 'SL2.50ch01', size: 98543444 }},
    { label: 'Chromosome 2 (55.34Mbp)', value: { name: 'SL2.50ch02', size: 55340444 }},
    { label: 'Chromosome 3 (70.79Mbp)', value: { name: 'SL2.50ch03', size: 70787664 }},
    { label: 'Chromosome 4 (66.47Mbp)', value: { name: 'SL2.50ch04', size: 66470942 }},
    { label: 'Chromosome 5 (65.88Mbp)', value: { name: 'SL2.50ch05', size: 65875088 }},
    { label: 'Chromosome 6 (49.75Mbp)', value: { name: 'SL2.50ch06', size: 49751636 }},
    { label: 'Chromosome 7 (68.05Mbp)', value: { name: 'SL2.50ch07', size: 68045021 }},
    { label: 'Chromosome 8 (65.87Mbp)', value: { name: 'SL2.50ch08', size: 65866657 }},
    { label: 'Chromosome 9 (72.48Mbp)', value: { name: 'SL2.50ch09', size: 72482091 }},
    { label: 'Chromosome 10 (65.53Mbp)', value: { name: 'SL2.50ch10', size: 65527505 }},
    { label: 'Chromosome 11 (56.30Mbp)', value: { name: 'SL2.50ch11', size: 56302525 }},
    { label: 'Chromosome 12 (67.15Mbp)', value: { name: 'SL2.50ch12', size: 67145203 }},
    { label: 'Chromosome 0 (21.81Mbp)', value: { name: 'SL2.50ch00', size: 21805821 }}
];
