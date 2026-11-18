/**
 * The draft open in the wizard. Every change is saved to the server
 * (debounced), so leaving the page keeps a Draft row on Home.
 *
 * Assistant suggestions live in `suggestions` and are not part of the form
 * (or the manifest) until accepted.
 */
import { create } from "zustand"

import { createDraft, saveDraft } from "./api"
import { emptyForm } from "./manifest"
import type { AccessionRow, Draft, VcfFile, WizardForm, WizardStep } from "./types"

export type SaveState = "idle" | "saving" | "saved" | "error"

interface WizardState {
  draft: Draft | null
  saveState: SaveState
  /** Load a draft from the server (or one just created). */
  open: (draft: Draft) => void
  close: () => void
  setStep: (step: WizardStep) => void
  /** Replace part of the form. */
  update: (recipe: (form: WizardForm) => WizardForm) => void
  /** Save now (e.g. before leaving); resolves when the server has it. */
  flush: () => Promise<void>
}

const SAVE_DELAY_MS = 800
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> = Promise.resolve()

export const useWizardStore = create<WizardState>((set, get) => {
  const persist = () => {
    const draft = get().draft
    if (!draft) return Promise.resolve()
    set({ saveState: "saving" })
    saving = saving
      .then(() => saveDraft(draft))
      .then(
        (saved) => {
          // Keep local edits made while saving; take the server timestamp.
          const current = get().draft
          if (current?.id === saved.id) {
            set({ draft: { ...current, updated_at: saved.updated_at }, saveState: "saved" })
          }
        },
        () => set({ saveState: "error" })
      )
    return saving
  }

  const schedule = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persist()
    }, SAVE_DELAY_MS)
  }

  return {
    draft: null,
    saveState: "idle",
    open: (draft) => set({ draft, saveState: "saved" }),
    close: () => {
      // Send a pending save before letting go of the draft.
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
        void persist()
      }
      set({ draft: null, saveState: "idle" })
    },
    setStep: (step) => {
      const draft = get().draft
      if (!draft || draft.step === step) return
      set({ draft: { ...draft, step } })
      schedule()
    },
    update: (recipe) => {
      const draft = get().draft
      if (!draft) return
      set({ draft: { ...draft, form: recipe(draft.form) } })
      schedule()
    },
    flush: () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
        return persist()
      }
      return saving
    },
  }
})

/** The open draft's form; only valid inside the wizard. */
export function useForm(): WizardForm {
  return useWizardStore((s) => s.draft?.form ?? EMPTY)
}
const EMPTY = emptyForm()

export const newDraft = () =>
  createDraft({
    mode: "new",
    base_dataset: null,
    base_accessions: null,
    step: "reference",
    form: emptyForm(),
    build_id: null,
  })

/* ----------------------------------------------------- form helpers -- */

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Accession rows for a VCF's selected samples (names from sample names). */
export function rowsForVcf(vcf: VcfFile, existing: AccessionRow[]): AccessionRow[] {
  const samples = vcf.selected.length ? vcf.selected : (vcf.samples ?? [])
  return samples.map((sample) => {
    const previous = existing.find((r) => r.fileId === vcf.id && r.sample === sample)
    return (
      previous ?? {
        id: newId("acc"),
        name: sample,
        label: sample,
        group: "",
        fileId: vcf.id,
        sample,
        info: {},
      }
    )
  })
}
