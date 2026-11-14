"""Reference, VCF, Tersect and snpEff steps.

Commands run as argument lists, chained through pipes; nothing goes through a
shell, so names and paths from manifests are never interpreted.
"""
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile

from . import settings

BCFTOOLS = 'bcftools'


class StepError(RuntimeError):
    pass


def run_chain(commands, stdout=None, log=None, stdin=None):
    """Run commands connected by pipes, like `a | b | c > stdout`.

    Raises StepError naming the commands that failed. stderr of every command
    goes to `log` (a path) if given, otherwise into the error message.
    """
    errors = open(log, 'ab') if log else tempfile.TemporaryFile()
    out_handle = open(stdout, 'wb') if isinstance(stdout, str) else stdout
    processes = []
    try:
        previous = stdin
        for i, command in enumerate(commands):
            last = i == len(commands) - 1
            errors.write(('$ %s\n' % ' '.join(command)).encode())
            errors.flush()
            process = subprocess.Popen(
                command, stdin=previous,
                stdout=out_handle if last else subprocess.PIPE,
                stderr=errors)
            if previous is not None and previous is not stdin:
                previous.close()  # so the producer sees SIGPIPE if we stop
            previous = process.stdout
            processes.append(process)
        failures = ['%s exited with %d' % (command[0], process.wait())
                    for command, process in zip(commands, processes)
                    if process.wait() != 0]
        if failures:
            if log:
                detail = ' (see %s)' % log
            else:
                errors.seek(0)
                detail = ': ' + errors.read().decode(errors='replace')[-2000:]
            raise StepError('; '.join(failures) + detail)
    finally:
        if isinstance(stdout, str):
            out_handle.close()
        errors.close()


class atomic_output:
    """A temporary path that becomes `target` only if the block succeeds.

    A step that is killed or fails leaves no partial file under the final
    name, so a resumed build never mistakes it for a finished one.
    """

    def __init__(self, target):
        self.target = target
        self.path = '%s.partial-%d' % (target, os.getpid())

    def __enter__(self):
        return self.path

    def __exit__(self, kind, value, traceback):
        if kind is None:
            os.replace(self.path, self.target)
        elif os.path.exists(self.path):
            os.remove(self.path)
        return False


def output(command):
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout


# ── Reference ────────────────────────────────────────────────────────────────

def is_bgzipped(path):
    with open(path, 'rb') as handle:
        header = handle.read(16)
    return header[:2] == b'\x1f\x8b' and header[12:14] == b'BC'


def bgzip(source, target, log=None):
    """Write `source` (plain, gzip or bgzip) to `target` as bgzip."""
    if is_bgzipped(source):
        shutil.copyfile(source, target)
        return
    with open(source, 'rb') as handle:
        gzipped = handle.read(2) == b'\x1f\x8b'
    reader = ['gzip', '-dc', source] if gzipped else ['cat', source]
    run_chain([reader, ['bgzip', '-@', '4']], stdout=target, log=log)


def prepare_reference(fasta, target, wanted, log=None):
    """bgzip and index the reference; return its chromosomes with sizes.

    `wanted` (or None for all) is checked against the FASTA.
    """
    bgzip(fasta, target, log)
    subprocess.run(['samtools', 'faidx', target], check=True)
    sizes = {}
    with open(target + '.fai') as fai:
        for line in fai:
            name, length = line.split('\t')[:2]
            sizes[name] = int(length)
    if wanted:
        missing = [c for c in wanted if c not in sizes]
        if missing:
            raise StepError('Chromosomes not in the reference FASTA: %s (it has: %s)'
                            % (', '.join(missing), ', '.join(list(sizes)[:20])))
        return [{'name': c, 'size': sizes[c]} for c in wanted]
    return [{'name': c, 'size': s} for c, s in sizes.items()]


def prepare_gff(gff, target, chromosomes, log=None):
    """Sorted, bgzipped, tabix-indexed gene models (genome browser + snpEff)."""
    keep = set(chromosomes)
    opener = gzip.open if open(gff, 'rb').read(2) == b'\x1f\x8b' else open
    header, features = [], []
    with opener(gff, 'rt') as handle:
        for line in handle:
            if line.startswith('##FASTA'):
                break  # embedded sequences are not needed
            if line.startswith('#'):
                if not line.startswith('##sequence-region') or line.split()[1] in keep:
                    header.append(line)
            elif line.strip():
                fields = line.split('\t', 4)
                if len(fields) >= 4 and fields[0] in keep:
                    features.append((fields[0], int(fields[3]), line))
    if not features:
        raise StepError('The GFF has no features on the chosen chromosomes; '
                        'check that it matches the reference.')
    features.sort(key=lambda f: (f[0], f[1]))
    process = subprocess.Popen(['bgzip', '-@', '4'], stdin=subprocess.PIPE,
                               stdout=open(target, 'wb'))
    for line in header:
        process.stdin.write(line.encode())
    for _, _, line in features:
        process.stdin.write(line.encode())
    process.stdin.close()
    if process.wait() != 0:
        raise StepError('bgzip failed for %s' % gff)
    subprocess.run(['tabix', '-f', '-p', 'gff', target], check=True)


# ── Samples ──────────────────────────────────────────────────────────────────

def vcf_samples(vcf):
    return [s for s in output([BCFTOOLS, 'query', '-l', vcf]).splitlines() if s]


def normalise_sample(vcf, sample, reference, chromosomes, target, qc_path, log):
    """One clean, indexed VCF per accession.

    Selects the sample, keeps the chosen chromosomes, drops existing
    annotations, splits multi-allelic sites and left-aligns indels against the
    reference (sites whose REF does not match the reference are dropped and
    counted), keeps sites where the sample carries the alternative allele and
    renames the sample.
    """
    available = vcf_samples(vcf)
    if not available:
        raise StepError('%s has no samples (a genotype column is required)' % vcf)
    source = sample.vcf_sample or available[0]
    if source not in available:
        raise StepError('Sample "%s" is not in %s (it has: %s)'
                        % (source, vcf, ', '.join(available[:10])))

    names = {c['name'] for c in chromosomes}
    with tempfile.TemporaryDirectory(dir=os.path.dirname(target)) as tmp:
        # Older VCFs often lack ##contig lines. Declare every sequence of
        # the reference (bcftools fails if only some are declared), so later
        # steps and the index know their lengths.
        header = output([BCFTOOLS, 'view', '-h', vcf])
        declared = set(re.findall(r'##contig=<ID=([^,>]+)', header))
        contigs = os.path.join(tmp, 'contigs.txt')
        with open(reference + '.fai') as fai, open(contigs, 'w') as handle:
            for line in fai:
                name, length = line.split('\t')[:2]
                if name not in declared:
                    handle.write('##contig=<ID=%s,length=%s>\n' % (name, length))
        unsorted = os.path.join(tmp, 'normalised.bcf')
        run_chain([
            # Dropping INFO and FORMAT fields first also removes any tags
            # the header does not define, which sample selection rejects.
            [BCFTOOLS, 'annotate', '-Ou', '-x', 'ID,INFO,^FORMAT/GT',
             '--header-lines', contigs, vcf],
            [BCFTOOLS, 'view', '-Ou', '--samples', source, '--trim-alt-alleles',
             '--targets', ','.join(sorted(names))],
            [BCFTOOLS, 'norm', '-Ou', '--multiallelics', '-any',
             '--fasta-ref', reference, '--check-ref', 'x'],
            [BCFTOOLS, 'view', '-Ob', '--include', 'GT="alt"', '-o', unsorted],
        ], log=log)
        renamed = os.path.join(tmp, 'renamed.bcf')
        names_file = os.path.join(tmp, 'names.txt')
        with open(names_file, 'w') as handle:
            handle.write(sample.name + '\n')
        subprocess.run([BCFTOOLS, 'reheader', '--samples', names_file,
                        '-o', renamed, unsorted], check=True)
        sorted_vcf = os.path.join(tmp, 'sorted.vcf.gz')
        run_chain([[BCFTOOLS, 'sort', '-Oz', '-m', '1G', '-T', tmp,
                    '-o', sorted_vcf, renamed]], log=log)
        subprocess.run([BCFTOOLS, 'index', '-f', '--tbi', sorted_vcf], check=True)
        os.replace(sorted_vcf + '.tbi', target + '.tbi')
        os.replace(sorted_vcf, target)

    stats = output([BCFTOOLS, 'index', '--stats', target])
    per_chromosome = {}
    for line in stats.splitlines():
        parts = line.split('\t')
        if len(parts) >= 3:
            per_chromosome[parts[0]] = int(parts[2])
    total = sum(per_chromosome.values())
    if total == 0:
        contigs = output([BCFTOOLS, 'view', '-h', vcf])
        found = re.findall(r'##contig=<ID=([^,>]+)', contigs)[:10]
        raise StepError(
            'No variants left for %s on the chosen chromosomes. Do the VCF '
            'contig names (%s) match the reference (%s)?'
            % (sample.name, ', '.join(found) or 'none declared',
               ', '.join(sorted(names)[:5])))
    with open(qc_path, 'w') as handle:
        json.dump({'sample': sample.name, 'source_sample': source,
                   'variants': total, 'per_chromosome': per_chromosome},
                  handle, indent=2)


# ── Tersect ──────────────────────────────────────────────────────────────────

def tersect_build(vcfs, target, homozygous, types, log):
    command = ['tersect', 'build', '-f']
    if homozygous:
        command.append('-H')
    if types != 'both':
        command += ['-t', types]
    with atomic_output(target) as path:
        run_chain([command + [path] + list(vcfs)], stdout=subprocess.DEVNULL, log=log)


def tersect_chromosomes(tsi):
    """Chromosome names and sizes recorded in a Tersect index."""
    chromosomes = []
    for line in output(['tersect', 'chroms', '-n', tsi]).splitlines():
        parts = line.split('\t')
        if len(parts) >= 2 and parts[1].isdigit():
            chromosomes.append({'name': parts[0], 'size': int(parts[1])})
    return chromosomes


# ── snpEff ───────────────────────────────────────────────────────────────────

def _snpeff(args, log, memory='3g'):
    return ['snpEff', '-Xmx%s' % memory] + args


def snpeff_database(manifest, reference, gff, log):
    """Directory and name of the snpEff database to annotate with.

    "build": built from the reference and gene models, once per distinct
    pair (cached by content). Otherwise a prebuilt database, downloaded by
    snpEff on first use.
    """
    root = settings.snpeff_dir()
    os.makedirs(root, exist_ok=True)
    if manifest.snpeff != 'build':
        config = os.path.join(root, 'snpEff.config')
        if not os.path.exists(config):
            with open(config, 'w') as handle:
                handle.write('data.dir = %s\n' % os.path.join(root, 'data'))
        run_chain([_snpeff(['download', '-c', config, '-v', manifest.snpeff], log)],
                  stdout=subprocess.DEVNULL, log=log)
        return config, manifest.snpeff

    digest = hashlib.sha256()
    for path in (reference, gff):
        with open(path, 'rb') as handle:
            for block in iter(lambda: handle.read(1 << 20), b''):
                digest.update(block)
    name = '%s_%s' % (manifest.reference_id, digest.hexdigest()[:10])
    data_dir = os.path.join(root, 'data')
    genome_dir = os.path.join(data_dir, name)
    config = os.path.join(root, '%s.config' % name)
    if os.path.exists(os.path.join(genome_dir, 'snpEffectPredictor.bin')):
        return config, name

    os.makedirs(genome_dir, exist_ok=True)
    # snpEff reads only the first block of a bgzip (multi-member) file, so
    # give it single-member gzip copies.
    for source, file_name in ((reference, 'sequences.fa.gz'), (gff, 'genes.gff.gz')):
        run_chain([['gzip', '-dc', source], ['gzip', '-1']],
                  stdout=os.path.join(genome_dir, file_name), log=log)
    with open(config, 'w') as handle:
        handle.write('data.dir = %s\n%s.genome : %s\n' % (data_dir, name, manifest.reference_id))
    # CDS and protein checks need transcript sequences, which a GFF alone
    # does not provide.
    run_chain([_snpeff(['build', '-gff3', '-noCheckCds', '-noCheckProtein',
                        '-c', config, '-v', name], log, memory='5g')],
              stdout=subprocess.DEVNULL, log=log)
    return config, name


def merge_and_annotate(vcfs, chromosome, snpeff, target, log):
    """All accessions on one chromosome in one VCF, annotated by snpEff.

    `snpeff` is (config, database) or None to skip annotation.
    """
    commands = [
        [BCFTOOLS, 'merge', '-Ou', '--merge', 'none', '--regions', chromosome]
        + list(vcfs),
    ]
    if snpeff:
        config, database = snpeff
        commands.append([BCFTOOLS, 'view', '-Ov'])
        commands.append(_snpeff(['ann', '-c', config, '-noStats', '-no-upstream',
                                 '-no-downstream', '-nodownload', database], log))
        commands.append(['bgzip', '-@', '2'])
    else:
        commands.append([BCFTOOLS, 'view', '-Oz'])
    with atomic_output(target) as path:
        run_chain(commands, stdout=path, log=log)


def accessions(tsi):
    return [s for s in output(['tersect', 'samples', '-n', tsi]).splitlines() if s]
