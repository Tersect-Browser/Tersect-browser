/**
 * Dev-only stand-in for POST /api/assistant (see ./config.ts for the switch).
 * Streams the conversations of artboards 4a (replicate a paper: Aflitos et
 * al. 2014), 4c (a paper with raw reads only) and 4d (a build error with a
 * contig rename map), plus short options and sheet answers. The data is
 * invented; the URLs do not exist.
 */
import { fileNameOf } from "../format"
import type {
  AccessionsProposal,
  AssistantEvent,
  AssistantRequest,
  OptionsProposal,
  ProposedAccession,
  ReferenceProposal,
  RenameMapProposal,
  SheetProposal,
} from "./types"

type Step = AssistantEvent | { wait: number }

const MB = 1_000_000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"))
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true }
    )
  })

/** Prose as small text deltas, like a model streams it. */
function* prose(text: string): Generator<Step> {
  const words = text.split(/(?<=\s)/)
  for (let i = 0; i < words.length; i += 3) {
    yield { type: "text", delta: words.slice(i, i + 3).join("") }
    yield { wait: 18 }
  }
}

const status = (text: string, wait = 700): Step[] => [
  { type: "status", text },
  { wait },
]

const uid = () => Math.random().toString(36).slice(2, 8)

/* ------------------------------------------------------------- 4a -- */

const SPECIES: [string, number][] = [
  ["S. lycopersicum", 28],
  ["S. lycopersicum var. cerasiforme", 8],
  ["S. pimpinellifolium", 10],
  ["S. galapagense", 3],
  ["S. cheesmaniae", 3],
  ["S. habrochaites", 7],
  ["S. pennellii", 4],
  ["S. peruvianum", 6],
  ["S. chilense", 4],
  ["S. arcanum", 3],
  ["S. chmielewskii", 2],
  ["S. neorickii", 1],
]

const VCF_BASE = "https://www.tomatogenome.net/data/150genomes/vcf/"

function paperAccessions(): ProposedAccession[] {
  const rows: ProposedAccession[] = []
  let n = 1
  for (const [species, count] of SPECIES) {
    for (let i = 0; i < count; i++, n++) {
      const accession = `LA${String(400 + ((n * 37) % 3600)).padStart(4, "0")}`
      const name = `RF_${String(n).padStart(3, "0")}`
      const file = `${name}_SZAXPI0${String(8700 + n)}.vcf.gz`
      rows.push({
        name,
        label: `${species} ${accession}`,
        group: species,
        vcf: {
          source: "url",
          location: VCF_BASE + file,
          name: file,
          size: Math.round((180 + ((n * 53) % 140)) * MB),
        },
        sample: null,
        info: {
          accession,
          origin: ["Peru", "Ecuador", "Chile", "Galápagos"][n % 4],
        },
      })
    }
  }
  return rows
}

function replicatePaper(): Step[] {
  const fasta =
    "ftp://ftp.solgenomics.net/tomato_genome/assembly/build_2.50/S_lycopersicum_chromosomes.2.50.fa.gz"
  const gff =
    "ftp://ftp.solgenomics.net/tomato_genome/annotation/ITAG2.4_release/ITAG2.4_gene_models.gff3"
  const reference: ReferenceProposal = {
    id: `ref-${uid()}`,
    kind: "reference",
    title: "Set reference to SL2.50 from solgenomics.net",
    note: "Heinz 1706 assembly 2.50 with ITAG2.4 gene models, as used for the variant calls.",
    source: "Methods, “Read mapping and variant calling”",
    links: [
      { url: fasta, ok: true, status: 200, size: 247 * MB },
      { url: gff, ok: true, status: 200, size: 64 * MB },
    ],
    more: null,
    action: "Apply",
    applicable: true,
    payload: {
      fasta: {
        source: "url",
        location: fasta,
        name: fileNameOf(fasta),
        size: 247 * MB,
      },
      gff: {
        source: "url",
        location: gff,
        name: fileNameOf(gff),
        size: 64 * MB,
      },
      reference_id: "SL2.50",
      name: "tomato_150_genomes",
      description:
        "84 tomato accessions and wild relatives re-sequenced by the 100 Tomato Genome Sequencing Consortium (Aflitos et al. 2014).",
    },
  }

  const rows = paperAccessions()
  const missing = ["RF_080", "RF_081", "RF_082", "RF_083", "RF_084"]
  const accessions: AccessionsProposal = {
    id: `acc-${uid()}`,
    kind: "accessions",
    title: "Add 84 accessions",
    note: `${rows.length} with VCF links; ${missing.length} need a location.`,
    source: "Data availability, para. 2 · Table S1",
    links: [
      ...rows.slice(0, 3).map((r) => ({
        url: r.vcf.location,
        ok: true,
        status: 200,
        size: r.vcf.size ?? null,
      })),
      {
        url: `${VCF_BASE}RF_080_SZAXPI008780.vcf.gz`,
        ok: false,
        status: 404,
        size: null,
        error: "not found",
      },
    ],
    more: `${rows.length - 3} more links, all reachable. ${missing.length - 1} accessions in Table S1 have no VCF listed.`,
    action: `Review ${rows.length}`,
    applicable: true,
    payload: { rows, missing },
  }

  return [
    ...status("Resolving doi:10.1111/tpj.12616…", 500),
    ...status("Reading the data availability section…", 800),
    ...prose(
      "This is **Aflitos et al. 2014**, “Exploring genetic variation in the tomato clade by whole-genome sequencing” (The Plant Journal 80: 136–148). It re-sequenced 84 accessions of cultivated tomato and wild relatives against the Heinz 1706 reference.\n\nWhat I found:\n1. The reference is `SL2.50` with ITAG2.4 gene models, from solgenomics.net.\n2. Table S1 lists every accession with its species; per-accession VCFs are on tomatogenome.net.\n\nI checked every link before showing it.\n\n"
    ),
    ...status("Checking 2 reference links…", 600),
    { type: "proposal", proposal: reference },
    { wait: 200 },
    ...status("Reading Table S1 (84 rows)…", 900),
    ...status("Checking 80 VCF links…", 1100),
    { type: "proposal", proposal: accessions },
    ...prose(
      "\n\nThe paper filtered calls to homozygous SNPs, so for the distance index **SNPs, homozygous only** reproduces its trees most closely. I left options to you; ask and I can propose them."
    ),
    { type: "done" },
  ]
}

/* ------------------------------------------------------------- 4c -- */

function readsOnly(): Step[] {
  return [
    ...status("Resolving the DOI…", 500),
    ...status("Reading the data availability section…", 900),
    ...prose(
      "This paper publishes **raw reads only** (ENA project `PRJEB5235`), not variant calls, so there is nothing the wizard can build from directly. I have not proposed a dataset.\n\nTo replicate it you would need:\n- the reference it mapped to (`SL2.50`, from solgenomics.net);\n- per-accession VCFs, made by mapping the reads (for example with BWA-MEM) and calling variants (GATK or bcftools);\n- the accession list from Table S1, which I can turn into labels and groups once the VCFs exist.\n\nVariant calling runs outside Tersect Browser. When you have the VCFs on this server, add them in step 2 and paste Table S1 here."
    ),
    { type: "done" },
  ]
}

/* ------------------------------------------------------------- 4d -- */

function explainError(request: AssistantRequest): Step[] {
  const build = request.context.build
  const vcfs = request.context.form?.vcfs ?? []
  const files = vcfs.length
    ? vcfs.slice(0, 3).map((v) => v.file.name)
    : ["LA1777.vcf.gz", "LA0716.vcf.gz"]
  const map: Record<string, string> = {}
  for (let i = 1; i <= 12; i++)
    map[String(i)] = `SL2.50ch${String(i).padStart(2, "0")}`
  const rename: RenameMapProposal = {
    id: `ren-${uid()}`,
    kind: "rename-map",
    title: "Rename 12 contigs",
    note: `Maps 1 … 12 to SL2.50ch01 … SL2.50ch12 for ${files.length === 1 ? files[0] : `${files.length} files`}.`,
    source: "Build log · VCF headers",
    links: [],
    more: null,
    action: "Review in step 2",
    applicable: true,
    payload: { files, map },
  }
  const message =
    build?.error?.message ?? "no records on any selected chromosome"
  return [
    ...status("Reading the build log…", 700),
    ...status("Comparing VCF contigs with the reference…", 800),
    ...prose(
      `The build stopped at **Checking accessions**: \`${message}\`.\n\nThe VCFs name chromosomes \`1\` … \`12\`, but the reference uses \`SL2.50ch01\` … \`SL2.50ch12\`. bcftools found no records on the selected chromosomes, so the accession was empty.\n\nThe fix is a contig rename map, applied to those files before indexing. Nothing needs uploading again; a retry resumes at that stage.\n\n`
    ),
    { type: "proposal", proposal: rename },
    { type: "done" },
  ]
}

/* --------------------------------------------------------- others -- */

function options(): Step[] {
  const proposal: OptionsProposal = {
    id: `opt-${uid()}`,
    kind: "options",
    title: "SNPs, homozygous only",
    note: "Matches the paper's distance calculations.",
    source: "Methods, “Phylogeny”",
    links: [],
    more: null,
    action: "Apply",
    applicable: true,
    payload: {
      effects: "prebuilt",
      snpeff_db: "SL2.50",
      types: "snps",
      homozygous: true,
    },
  }
  return [
    ...status("Reading the options…", 500),
    ...prose(
      "**Homozygous only** counts only homozygous alternative genotypes in the distances. It suits inbred lines and selfing wild species, where heterozygous calls are mostly errors. For outcrossing accessions (such as S. peruvianum) it hides real diversity, so leave it off there.\n\n"
    ),
    { type: "proposal", proposal },
    { type: "done" },
  ]
}

function sheet(request: AssistantRequest): Step[] {
  const rows = request.context.form?.accessions ?? []
  const proposal: SheetProposal = {
    id: `sheet-${uid()}`,
    kind: "sheet",
    title: `Labels and groups for ${rows.length || 3} accessions`,
    note: "Columns read as name, species (group) and origin (info).",
    source: "Pasted table",
    links: [],
    more: null,
    action: "Review in step 2",
    applicable: true,
    payload: {
      rows: (rows.length
        ? rows.map((r) => r.name)
        : ["LA1777", "LA0716", "LA1589"]
      ).map((name, i) => ({
        name,
        label: `${name} (${["Wild", "Cultivated"][i % 2]})`,
        group: ["S. habrochaites", "S. pennellii", "S. pimpinellifolium"][
          i % 3
        ],
        info: { origin: ["Peru", "Ecuador"][i % 2] },
      })),
    },
  }
  return [
    ...status("Reading the table…", 600),
    ...prose("I read the table as one row per accession.\n\n"),
    { type: "proposal", proposal },
    { type: "done" },
  ]
}

/* ------------------------------------------------------------ entry -- */

function script(request: AssistantRequest): Step[] {
  const last = request.messages[request.messages.length - 1]?.content ?? ""
  if (/fail/i.test(last))
    return [
      ...status("Thinking…", 600),
      {
        type: "error",
        message: "The model did not answer in time (mock failure).",
      },
    ]
  if (/error/i.test(last)) return explainError(request)
  if (/reads|sra|prjeb|ena\b/i.test(last)) return readsOnly()
  if (/homozygous|option|effect/i.test(last)) return options()
  if (/table|sheet/i.test(last)) return sheet(request)
  return replicatePaper()
}

export async function* mockStream(
  request: AssistantRequest,
  signal: AbortSignal
): AsyncGenerator<AssistantEvent> {
  if (request.think) {
    // What a reasoning model streams before acting (think: true).
    const thought =
      "The user pasted a DOI. I should read the paper first and look for the data " +
      "availability statement. If it only lists reads, I must say so instead of " +
      "proposing a dataset. If VCFs are on an FTP server, I list the folder rather " +
      "than guessing file names."
    for (const word of thought.split(/(?<= )/)) {
      await sleep(40, signal)
      yield { type: "thinking", delta: word }
    }
  }
  for (const step of script(request)) {
    if ("wait" in step) await sleep(step.wait, signal)
    else {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError")
      yield step
    }
  }
}
