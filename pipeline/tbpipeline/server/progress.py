"""Build progress from Snakemake's output, and failures as BuildErrors.

Pure functions and a line-by-line parser, without I/O, so they can be tested
on captured output (pipeline/tests/). The seven stages are BUILD_STAGES in
web/src/features/datasets/types.ts; "fetch" is the builder's own download
pass (builds.py), the others are groups of Snakemake rules.

Snakemake 9 writes, per job:

    [Sat Nov 14 17:01:21 2026]
    localrule normalise:
        ...
        jobid: 6
        wildcards: sample=D
    ...
    [Sat Nov 14 17:01:23 2026]
    Finished jobid: 6 (Rule: normalise)
    4 of 16 steps (25%) done

and, at the start, a "Job stats:" table of the jobs it will run. Jobs that
depend on the `reference` checkpoint (per chromosome) are added only once it
has finished, so their counts come from the manifest (chromosomes) instead.
"""
import datetime
import os
import re

STAGES = [
    ('fetch', 'Fetching files'),
    ('reference', 'Preparing reference'),
    ('accessions', 'Checking accessions'),
    ('index', 'Building distance index'),
    ('annotate', 'Annotating variants'),
    ('load', 'Loading search tables'),
    ('publish', 'Publishing'),
]
STAGE_KEYS = [key for key, _ in STAGES]

# Rules of pipeline/rules/vcf.smk and index.smk, by stage.
VCF_RULES = {
    'reference': ['reference', 'gene_models'],
    'accessions': ['normalise'],
    'index': ['tersect_index'],
    'annotate': ['snpeff_database', 'annotate'],
    # genome_browser starts early (it needs only the accessions); counting it
    # under publish would show Publishing active for most of the build.
    'load': ['genes_table', 'variants_table', 'stage', 'genome_browser'],
    'publish': ['publish', 'all'],
}
INDEX_RULES = {
    'reference': ['index_copy', 'reference', 'gene_models'],
    'publish': ['genome_browser', 'publish', 'all'],   # nothing else to load
}


def stage_of(rule, from_vcfs=True):
    """The stage a rule belongs to, or None."""
    for stage, rules in (VCF_RULES if from_vcfs else INDEX_RULES).items():
        if rule in rules:
            return stage
    return None


# The rule whose jobs a stage counts, and what they are.
COUNTED = {'accessions': ('normalise', 'accessions'),
           'annotate': ('annotate', 'chromosomes'),
           'load': ('variants_table', 'chromosomes')}
# Added to the DAG after the reference checkpoint.
AFTER_CHECKPOINT = ('snpeff_database', 'annotate', 'variants_table')

TIMESTAMP = re.compile(r'^\[(\w{3} \w{3} +\d+ \d\d:\d\d:\d\d \d{4})\]$')
JOB_START = re.compile(r'^(?:local)?(?:rule|checkpoint) (\w+):$')
JOB_FIELD = re.compile(r'^\s+(jobid|wildcards): (.*)$')
JOB_FINISHED = re.compile(r'^Finished jobid: (\d+) \(Rule: (\w+)\)$')
JOB_ERROR = re.compile(r'^Error in rule (\w+):$')
TABLE_ROW = re.compile(r'^(\w+)\s+(\d+)$')


def parse_time(text):
    """Snakemake's local-time stamp as epoch seconds."""
    return datetime.datetime.strptime(' '.join(text.split()), '%a %b %d %H:%M:%S %Y').timestamp()


def parse_wildcards(text):
    return dict(part.strip().split('=', 1) for part in text.split(',') if '=' in part)


class SnakemakeProgress:
    """Feed it Snakemake's output line by line; `stages()` at any time.

    `samples` and `chromosomes` (None while unknown) are the counts the
    manifest implies; `rebuild` words stages with nothing to do.
    """

    def __init__(self, from_vcfs=True, samples=0, chromosomes=None, annotate=True,
                 rebuild=False):
        self.rules = VCF_RULES if from_vcfs else INDEX_RULES
        self.samples = samples
        self.chromosomes = chromosomes
        self.annotate = annotate
        self.rebuild = rebuild
        self.table = {}          # rule -> jobs planned at start
        self.table_seen = False
        self.nothing_to_do = False
        self.jobs = {}           # jobid -> {rule, wildcards, start, end}
        self.failed = []         # [{rule, wildcards}]
        self._now = None         # last timestamp line
        self._in_table = False
        self._job = None         # job whose fields are being read
        self._error = None       # failure whose fields are being read

    # -- parsing --

    def feed(self, line):
        line = line.rstrip('\n')
        stripped = line.strip()
        if self._in_table:
            row = TABLE_ROW.match(stripped)
            if row and row.group(1) != 'total':
                self.table[row.group(1)] = int(row.group(2))
            elif row or (not stripped and self.table):
                self._in_table = False
                self.table_seen = True
            return
        if stripped == 'Job stats:':
            self._in_table = True
            self.table = {}
            return
        if stripped.startswith('Nothing to be done'):
            self.nothing_to_do = self.table_seen = True
            return
        match = TIMESTAMP.match(stripped)
        if match:
            self._now = parse_time(match.group(1))
            self._job = self._error = None
            return
        match = JOB_START.match(line)
        if match:
            self._job = {'rule': match.group(1), 'wildcards': {}, 'start': self._now, 'end': None}
            self._error = None
            return
        match = JOB_ERROR.match(line)
        if match:
            self._error = {'rule': match.group(1), 'wildcards': {}}
            self.failed.append(self._error)
            self._job = None
            return
        match = JOB_FIELD.match(line)
        if match and (self._job or self._error):
            key, value = match.groups()
            target = self._job or self._error
            if key == 'wildcards':
                target['wildcards'] = parse_wildcards(value)
            elif self._job is not None:
                self.jobs[value.strip()] = self._job
            return
        match = JOB_FINISHED.match(stripped)
        if match:
            job = self.jobs.setdefault(match.group(1), {
                'rule': match.group(2), 'wildcards': {}, 'start': self._now, 'end': None})
            job['end'] = self._now
            return
        if line and not line.startswith(' '):
            self._job = self._error = None

    # -- state --

    def _started(self, rule):
        return [j for j in self.jobs.values() if j['rule'] == rule]

    def _expected(self, rule):
        """Jobs of `rule` this run, or None while unknown."""
        started = len(self._started(rule))
        if rule in AFTER_CHECKPOINT and self.table.get('reference'):
            # The checkpoint runs this time, so everything after it does too.
            if rule == 'snpeff_database':
                count = 1 if self.annotate else 0
            elif self.chromosomes is None:
                return None
            else:
                count = self.chromosomes
            return max(count, started)
        return max(self.table.get(rule, 0), started)

    def _total(self, rule):
        """Jobs of `rule` in a whole build (for "7 of 12 accessions")."""
        if rule == 'normalise':
            return self.samples
        if rule in ('annotate', 'variants_table'):
            return self.chromosomes
        return None

    def stages(self, now, status='running'):
        """BuildStage dicts for the Snakemake stages (all but fetch).

        `status` is the build's: "succeeded" finishes every stage,
        "cancelled" turns active stages into cancelled ones, "failed" leaves
        unfinished stages to do.
        """
        failed_stages = {stage_of(f['rule'], self.rules is VCF_RULES) for f in self.failed}
        result = []
        for key in STAGE_KEYS[1:]:
            rules = self.rules.get(key)
            stage = {'key': key, 'status': 'todo', 'done': None, 'total': None,
                     'detail': None, 'elapsed': None, 'unit': None}
            result.append(stage)
            if not rules:
                stage['status'] = 'done' if self.table_seen or status == 'succeeded' else 'todo'
                stage['detail'] = 'not needed'
                continue
            jobs = [j for rule in rules for j in self._started(rule)]
            expected = [self._expected(rule) for rule in rules]
            finished = sum(1 for j in jobs if j['end'] is not None)
            remaining = None if None in expected else sum(expected) - finished

            if key in COUNTED:
                rule, unit = COUNTED[key]
                total = self._total(rule)
                if total is not None and self.table_seen and self._expected(rule) is not None:
                    left = self._expected(rule) - sum(
                        1 for j in self._started(rule) if j['end'] is not None)
                    stage.update(done=max(0, total - left), total=total, unit=unit)
                elif total is not None:
                    stage.update(done=0, total=total, unit=unit)

            starts = [j['start'] for j in jobs if j['start'] is not None]
            ends = [j['end'] for j in jobs if j['end'] is not None]
            if key in failed_stages:
                stage['status'] = 'failed'
            elif status == 'succeeded' or self.nothing_to_do or (
                    self.table_seen and remaining == 0):
                stage['status'] = 'done'
                if not jobs:
                    stage['detail'] = 'kept from current version' if self.rebuild else 'already done'
                if stage['total'] is not None:
                    stage['done'] = stage['total']
            elif jobs:
                stage['status'] = 'active'
            if starts:
                last = max(ends) if stage['status'] in ('done', 'failed') and ends else now
                stage['elapsed'] = max(0, round(last - min(starts)))
            if stage['status'] in ('active', 'failed') and status == 'cancelled':
                # Jobs stopped by the cancel are reported as errors.
                stage['status'] = 'cancelled'
            elif stage['status'] == 'active' and status == 'failed':
                stage['status'] = 'todo'
        return result


# ------------------------------------------------------------- logs --

ERROR_LINE = re.compile(
    r'^(Error in rule|RuleException|WorkflowError|Exiting because|Invalid manifest|'
    r'Traceback|Another build of|\w*(Error|Exception)\b)')
EXCEPTION_AT = re.compile(r'^\w+(Error|Exception) in file ".*", line \d+:$')


def flag_errors(lines):
    """Log tail entries {t, error?}: error lines and, after Snakemake's
    "<Error> in file ..., line n:", the message line itself."""
    out, message_next = [], False
    for line in lines:
        error = bool(ERROR_LINE.match(line.strip())) or message_next
        message_next = bool(EXCEPTION_AT.match(line.strip()))
        out.append({'t': line, 'error': True} if error else {'t': line})
    return out


# ------------------------------------------------------- BuildError --

def _base(path):
    if not path:
        return None
    return os.path.basename(path.split('?')[0]) or path


def build_error(failure, manifest=None):
    """BuildError (types.ts) for a failure.

    `failure` is a tbpipeline.failures record ({rule, wildcards, type,
    message, url?}), or {stage, message} from the builder itself.
    `manifest` is {fasta, gff, index, samples: [{name, vcf}]} for naming the
    file and choosing what "Fix and retry" opens.
    """
    manifest = manifest or {}
    samples = manifest.get('samples') or []
    vcf_of = {s['name']: s['vcf'] for s in samples}
    message = (failure.get('message') or 'The build failed; see the log.').strip()
    wildcards = failure.get('wildcards') or {}
    rule = failure.get('rule')
    accession = wildcards.get('sample')
    chromosome = wildcards.get('chrom')
    stage = failure.get('stage') or stage_of(rule, not manifest.get('index')) or 'fetch'
    error = {'stage': stage, 'message': message, 'accession': accession,
             'file': _base(vcf_of.get(accession)), 'chromosome': chromosome, 'fix': None}

    def fix(step, kind=None, target=None):
        error['fix'] = {'step': step, 'kind': kind, 'target': target}

    m = re.match(r'No variants left for (\S+) on the chosen chromosomes', message)
    if m:
        error['accession'] = accession = m.group(1)
        error['file'] = _base(vcf_of.get(accession))
        fix('accessions', 'rename-map', accession)
        return error
    m = re.match(r'Sample "(.+)" is not in (.+?) \(it has', message)
    if m:
        error['file'] = _base(m.group(2))
        fix('accessions', 'sample', accession)
        return error
    if re.search(r'has no samples \(a genotype column', message):
        fix('accessions', 'genotypes', accession)
        return error
    m = re.match(r'Chromosomes not in the reference FASTA: ([^(]+)', message)
    if m:
        error['chromosome'] = m.group(1).split(',')[0].strip()
        error['file'] = _base(manifest.get('fasta'))
        fix('reference', 'fasta', error['file'])
        return error
    if message.startswith('The GFF has no features'):
        error['file'] = _base(manifest.get('gff'))
        fix('reference', 'gff', error['file'])
        return error
    m = re.match(r'Download failed after \d+ attempts: (\S+)', message)
    if m or failure.get('type') == 'DownloadError':
        url = failure.get('url') or (m.group(1) if m else None)
        error['stage'] = 'fetch'
        error['file'] = _base(url)
        if url and url == manifest.get('fasta'):
            fix('reference', 'fasta', error['file'])
        elif url and url == manifest.get('gff'):
            fix('reference', 'gff', error['file'])
        elif url and url == manifest.get('index'):
            fix('options', 'index', error['file'])
        else:
            users = [s['name'] for s in samples if s['vcf'] == url]
            if users:
                error['accession'] = users[0]
            fix('accessions', 'vcf', users[0] if users else error['file'])
        return error

    # Anything else: open the step that holds the input, where there is one.
    if stage == 'accessions':
        fix('accessions', None, accession)
    elif stage == 'reference':
        fix('reference', 'gff' if rule == 'gene_models' else 'fasta',
            _base(manifest.get('gff' if rule == 'gene_models' else 'fasta')))
    elif rule == 'snpeff_database':
        fix('options', 'effects', None)
    return error


# -------------------------------------------------------- percentage --

WEIGHTS = {'fetch': 10, 'reference': 10, 'accessions': 25, 'index': 10,
           'annotate': 25, 'load': 15, 'publish': 5}


def percent(stages):
    """Rough 0-100 for a list of BuildStages."""
    total = done = 0
    for stage in stages or []:
        weight = WEIGHTS.get(stage.get('key'), 0)
        total += weight
        if stage.get('status') == 'done':
            done += weight
        elif stage.get('status') == 'active':
            if stage.get('total'):
                done += weight * min(1, (stage.get('done') or 0) / stage['total'])
            else:
                done += weight / 3
    return round(100 * done / total) if total else 0
