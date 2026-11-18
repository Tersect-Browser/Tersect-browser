/**
 * Proposals the user applied from the assistant panel. They are shown in the
 * form as SUGGESTED blocks and rows but are not part of the form (or the
 * manifest) until accepted there; accepting writes them through
 * useWizardStore.update, so they then go through the usual inline checks and
 * Review. Kept per draft in sessionStorage.
 */
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { fileNameOf } from "../format"
import { referenceIdFrom } from "../manifest"
import type {
  AccessionRow,
  FileRef,
  VcfFile,
  WizardForm,
  WizardStep,
} from "../types"
import { newId, useWizardStore } from "../wizard-store"
import { sessionJsonStorage } from "./storage"
import { setProposalState } from "./store"
import type {
  AccessionsProposal,
  OptionsProposal,
  Proposal,
  ReferenceProposal,
  RenameMapProposal,
  SheetProposal,
} from "./types"

/** The step a proposal is shown in. */
export const PROPOSAL_STEP: Record<Proposal["kind"], WizardStep> = {
  reference: "reference",
  accessions: "accessions",
  "rename-map": "accessions",
  sheet: "accessions",
  options: "options",
}

export const STEP_NUMBER: Record<WizardStep, number> = {
  reference: 1,
  accessions: 2,
  options: 3,
  review: 4,
}

export interface Suggestion<P extends Proposal = Proposal> {
  proposal: P
  /** ms timestamp; a block applied a moment ago scrolls into view. */
  appliedAt: number
}

interface SuggestionsState {
  byDraft: Record<string, Suggestion[]>
}

export const useSuggestions = create<SuggestionsState>()(
  persist((): SuggestionsState => ({ byDraft: {} }), {
    name: "tb.assistant.suggestions",
    storage: sessionJsonStorage(),
  })
)

type KindOf<K extends Proposal["kind"]> = Extract<Proposal, { kind: K }>

/** The draft's suggestions of one kind (newest last). */
export function useSuggestionsOf<K extends Proposal["kind"]>(
  draftId: string | undefined,
  kind: K
): Suggestion<KindOf<K>>[] {
  const list = useSuggestions((s) => (draftId ? s.byDraft[draftId] : undefined))
  return (list ?? EMPTY).filter(
    (s): s is Suggestion<KindOf<K>> => s.proposal.kind === kind
  )
}
const EMPTY: Suggestion[] = []

/**
 * Apply a card: record the suggestion (one per kind, except rename maps,
 * which are per file set) and open its step. The form does not change.
 */
export function applyProposal(draftId: string, proposal: Proposal) {
  const list = useSuggestions.getState().byDraft[draftId] ?? []
  const kept = list.filter((x) =>
    proposal.kind === "rename-map"
      ? x.proposal.id !== proposal.id &&
        !(
          x.proposal.kind === "rename-map" &&
          sameSet(x.proposal.payload.files, proposal.payload.files)
        )
      : x.proposal.kind !== proposal.kind
  )
  useSuggestions.setState((s) => ({
    byDraft: {
      ...s.byDraft,
      [draftId]: [...kept, { proposal, appliedAt: Date.now() }],
    },
  }))
  // A suggestion it replaces goes back to "open" on its card.
  for (const old of list)
    if (!kept.includes(old) && old.proposal.id !== proposal.id)
      setProposalState(draftId, old.proposal.id, "open")
  setProposalState(draftId, proposal.id, "applied")
  const wizard = useWizardStore.getState()
  if (wizard.draft?.id === draftId) wizard.setStep(PROPOSAL_STEP[proposal.kind])
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x))

function remove(draftId: string, proposalId: string) {
  useSuggestions.setState((s) => ({
    byDraft: {
      ...s.byDraft,
      [draftId]: (s.byDraft[draftId] ?? []).filter(
        (x) => x.proposal.id !== proposalId
      ),
    },
  }))
}

/** Dismiss in the form: the suggestion goes, the form is unchanged. */
export function rejectSuggestion(draftId: string, proposalId: string) {
  remove(draftId, proposalId)
  setProposalState(draftId, proposalId, "rejected")
}

function accept(
  draftId: string,
  proposal: Proposal,
  recipe: (f: WizardForm) => WizardForm
) {
  useWizardStore.getState().update(recipe)
  remove(draftId, proposal.id)
  setProposalState(draftId, proposal.id, "accepted")
}

/* ------------------------------------------------------------ accept -- */

export function acceptReference(draftId: string, proposal: ReferenceProposal) {
  const { fasta, gff, reference_id, name, description } = proposal.payload
  accept(draftId, proposal, (f) => {
    const reference = { ...f.reference }
    if (fasta) {
      // As choosing a FASTA in step 1: the sequences are read again.
      reference.fasta = fasta
      reference.sequences = null
      reference.chromosomes = []
    }
    if (gff) {
      reference.gff = gff
      reference.gffSeqids = null
    }
    reference.id =
      reference_id || reference.id || (fasta ? referenceIdFrom(fasta.name) : "")
    return {
      ...f,
      name: f.name.trim() ? f.name : (name ?? f.name),
      description: f.description.trim()
        ? f.description
        : (description ?? f.description),
      reference,
    }
  })
}

const sameFile = (a: FileRef, b: FileRef) =>
  a.source === b.source && a.location === b.location

/**
 * One VcfFile per distinct VCF location (samples unread, so step 2's
 * inspector reads the headers) and one row per accession. Names already in
 * the form are skipped. Returns the number of rows added.
 */
export function acceptAccessions(
  draftId: string,
  proposal: AccessionsProposal
): number {
  let added = 0
  accept(draftId, proposal, (f) => {
    const taken = new Set(f.accessions.map((r) => r.name))
    const vcfs: VcfFile[] = [...f.vcfs]
    const rows: AccessionRow[] = []
    for (const p of proposal.payload.rows) {
      if (taken.has(p.name)) continue
      taken.add(p.name)
      const file: FileRef = {
        ...p.vcf,
        name: p.vcf.name || fileNameOf(p.vcf.location),
      }
      let vcf = vcfs.find((v) => sameFile(v.file, file))
      if (!vcf) {
        vcf = {
          id: newId("vcf"),
          file,
          samples: null,
          contigs: null,
          hasGenotypes: null,
          inspectError: null,
          selected: [],
          renameContigs: null,
        }
        vcfs.push(vcf)
      }
      if (p.sample && !vcf.selected.includes(p.sample)) {
        const at = vcfs.indexOf(vcf)
        vcf = { ...vcf, selected: [...vcf.selected, p.sample] }
        vcfs[at] = vcf
      }
      rows.push({
        id: newId("acc"),
        name: p.name,
        label: p.label || p.name,
        group: p.group ?? "",
        fileId: vcf.id,
        sample: p.sample ?? "",
        info: { ...p.info },
      })
    }
    added = rows.length
    return { ...f, vcfs, accessions: [...f.accessions, ...rows] }
  })
  return added
}

/** Files of the form a rename map names (by file name). */
export function renameTargets(form: WizardForm, proposal: RenameMapProposal) {
  return form.vcfs.filter((v) => proposal.payload.files.includes(v.file.name))
}

export function acceptRenameMap(draftId: string, proposal: RenameMapProposal) {
  accept(draftId, proposal, (f) => {
    const ids = new Set(renameTargets(f, proposal).map((v) => v.id))
    return {
      ...f,
      vcfs: f.vcfs.map((v) =>
        ids.has(v.id) ? { ...v, renameContigs: { ...proposal.payload.map } } : v
      ),
    }
  })
}

export function acceptOptions(draftId: string, proposal: OptionsProposal) {
  const { effects, snpeff_db, types, homozygous } = proposal.payload
  accept(draftId, proposal, (f) => ({
    ...f,
    options: {
      ...f.options,
      ...(effects !== null && { effects }),
      ...(snpeff_db !== null && { snpeffDb: snpeff_db }),
      ...(types !== null && { types }),
      ...(homozygous !== null && { homozygous }),
    },
  }))
}

/** Sheet rows → form rows: by accession name, then by VCF sample name. */
export function sheetMatches(form: WizardForm, proposal: SheetProposal) {
  const keys = new Map<string, AccessionRow>()
  for (const row of form.accessions)
    if (row.sample && !keys.has(row.sample)) keys.set(row.sample, row)
  for (const row of form.accessions) keys.set(row.name, row)
  return proposal.payload.rows.map((r) => ({ sheet: r, row: keys.get(r.name) }))
}

/** Returns the number of accessions changed. */
export function acceptSheet(draftId: string, proposal: SheetProposal): number {
  let matched = 0
  accept(draftId, proposal, (f) => {
    const changes = new Map<string, Partial<AccessionRow>>()
    for (const { sheet, row } of sheetMatches(f, proposal)) {
      if (!row) continue
      changes.set(row.id, {
        ...(sheet.label && { label: sheet.label }),
        ...(sheet.group && { group: sheet.group }),
        info: { ...row.info, ...sheet.info },
      })
    }
    matched = changes.size
    return {
      ...f,
      accessions: f.accessions.map((row) => {
        const change = changes.get(row.id)
        return change ? { ...row, ...change } : row
      }),
    }
  })
  return matched
}
