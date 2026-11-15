/**
 * Contract between the dataset assistant panel and POST /api/assistant
 * (pipeline/tbpipeline/server/assistant.py). Spec: section 9 of
 * docs/design/HANDOFF-dataset-upload.md.
 *
 * The model never acts: it can only read (papers, directory listings,
 * tables) and propose. Proposals are structured data that map onto the form;
 * the server checks every URL in them before they reach the panel, and the
 * user must accept them in the form before they enter the manifest.
 */
import type {
  Build,
  EffectsMode,
  FileRef,
  UrlCheck,
  VariantTypes,
  WizardForm,
  WizardStep,
} from "../types"

/* ------------------------------------------------------------ request -- */

export interface ChatMessage {
  role: "user" | "assistant"
  /** Plain text. Assistant turns are sent back as the text they streamed. */
  content: string
}

/** POST /api/assistant body. The whole conversation is resent each turn. */
export interface AssistantRequest {
  messages: ChatMessage[]
  context: {
    draft_id: string | null
    /** Where the user is: a wizard step, or "build" when asking about a build. */
    step: WizardStep | "build"
    /** The current form, so answers and proposals fit what is already there. */
    form: WizardForm | null
    /** The failed build being explained ("Explain an error"). */
    build: Pick<Build, "id" | "status" | "error" | "log"> | null
  }
  /**
   * Let the model reason before answering and stream that reasoning as
   * `thinking` events. Slower: a small model reasons for hundreds of tokens
   * per step. The reasoning is never sent back in `messages`.
   */
  think?: boolean
}

/* ------------------------------------------------------------- events -- */

/**
 * The response is a server-sent event stream (text/event-stream) read with
 * fetch, since EventSource cannot POST. Events, in order of arrival:
 *
 *   event: status    data: {"text": "Reading Table S1…"}      what it is doing
 *   event: thinking  data: {"delta": "The user wants …"}       reasoning (think: true)
 *   event: text      data: {"delta": "Aflitos et al. …"}       assistant prose
 *   event: proposal  data: Proposal                           a proposal card
 *   event: done      data: {}
 *   event: error     data: {"message": "…"}                    then the stream ends
 *
 * A turn can interleave text and proposals; the panel shows them in order.
 */
export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "thinking"; delta: string }
  | { type: "text"; delta: string }
  | { type: "proposal"; proposal: Proposal }
  | { type: "done" }
  | { type: "error"; message: string }

/* ---------------------------------------------------------- proposals -- */

/** A link the server checked (headers only) before showing the proposal. */
export type LinkCheck = UrlCheck

interface ProposalBase {
  id: string
  /** e.g. "Set reference to SL2.50", "Add 84 accessions". */
  title: string
  /** One line; states partial results ("79 with VCF links; 5 need a location"). */
  note: string
  /** Where the values came from: "Data availability, para. 2 · Table S1". */
  source: string
  /** Checked links to show (a sample of them for long lists). */
  links: LinkCheck[]
  /** e.g. "76 more links, all reachable." */
  more?: string | null
  /** Primary button label: "Apply", "Review 79", "Review in step 2". */
  action: string
  /**
   * False when nothing in it can be used (no reachable link): the card shows
   * no primary button. Unreachable items are already left out of `payload`.
   */
  applicable: boolean
}

export interface ReferenceProposal extends ProposalBase {
  kind: "reference"
  payload: {
    /** Always URL refs, already checked. */
    fasta: FileRef | null
    gff: FileRef | null
    reference_id: string | null
    /** Dataset name and description, when the paper suggests them. */
    name: string | null
    description: string | null
  }
}

export interface ProposedAccession {
  name: string
  label: string
  group: string | null
  vcf: FileRef
  /** Sample in a multi-sample VCF. */
  sample: string | null
  info: Record<string, string>
}

export interface AccessionsProposal extends ProposalBase {
  kind: "accessions"
  payload: {
    rows: ProposedAccession[]
    /** Accessions found without a usable VCF location (left out of rows). */
    missing: string[]
  }
}

export interface RenameMapProposal extends ProposalBase {
  kind: "rename-map"
  payload: {
    /** VcfFile file names (FileRef.name) the map applies to. */
    files: string[]
    /** VCF contig → reference sequence. */
    map: Record<string, string>
  }
}

export interface OptionsProposal extends ProposalBase {
  kind: "options"
  payload: {
    effects: EffectsMode | null
    snpeff_db: string | null
    types: VariantTypes | null
    homozygous: boolean | null
  }
}

/** Labels, groups and info for accessions already in the form, matched by name. */
export interface SheetProposal extends ProposalBase {
  kind: "sheet"
  payload: {
    rows: {
      name: string
      label: string | null
      group: string | null
      info: Record<string, string>
    }[]
  }
}

export type Proposal =
  | ReferenceProposal
  | AccessionsProposal
  | RenameMapProposal
  | OptionsProposal
  | SheetProposal
