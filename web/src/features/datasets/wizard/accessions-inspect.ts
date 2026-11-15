/**
 * Reads each VCF's header (POST /api/datasets/inspect) as soon as the file is
 * available: a URL or server file at once, an upload once it is verified.
 * The samples become accession rows; contigs feed the mismatch check.
 */
import { useEffect } from "react"
import { create } from "zustand"

import { inspectFile } from "../api"
import type { InspectResult, VcfFile, WizardForm } from "../types"
import { useUploads } from "../uploads"
import { rowsForVcf, useForm, useWizardStore } from "../wizard-store"
import { fileStem, replaceFileRows } from "./accessions-shared"

export type InspectState =
  | { state: "running" }
  /** Read, but the server could not list samples yet (e.g. a URL fetched later). */
  | { state: "note"; note: string }

/** In-memory: per VcfFile id. Survives leaving step 2, not a reload. */
export const useInspectState = create<Record<string, InspectState>>(() => ({}))

const setInspect = (id: string, value: InspectState | null) =>
  useInspectState.setState((all) => {
    const next = { ...all }
    if (value) next[id] = value
    else delete next[id]
    return next
  }, true)

function applyResult(
  form: WizardForm,
  id: string,
  result: InspectResult
): WizardForm {
  const vcf = form.vcfs.find((v) => v.id === id)
  if (!vcf) return form
  const samples = result.samples ?? null
  const next: VcfFile = {
    ...vcf,
    samples,
    contigs: result.contigs ?? null,
    hasGenotypes: result.has_genotypes ?? null,
    inspectError:
      result.error ??
      (samples && samples.length === 0 ? "No samples in this file." : null),
    // Samples picked before the header was read (accepted assistant
    // suggestions) stay picked; otherwise every sample is.
    selected:
      samples && samples.length > 1
        ? vcf.selected.some((s) => samples.includes(s))
          ? vcf.selected.filter((s) => samples.includes(s))
          : samples
        : [],
    file: { ...vcf.file, size: vcf.file.size ?? result.size },
  }
  const vcfs = form.vcfs.map((v) => (v.id === id ? next : v))
  const current = form.accessions.filter((r) => r.fileId === id)
  if (!samples || samples.length === 0) return { ...form, vcfs }

  let rows
  if (samples.length === 1) {
    // Keep the row (and the user's edits); name it after the sample unless renamed.
    const stem = fileStem(vcf.file.name)
    const [sample] = samples
    rows = current.slice(0, 1).map((row) => ({
      ...row,
      sample,
      name: row.name === stem ? sample : row.name,
      label: row.label === stem ? sample : row.label,
    }))
  } else {
    const group = current.find((r) => !r.sample)?.group ?? ""
    rows = rowsForVcf(next, form.accessions).map((row) =>
      group && !row.group ? { ...row, group } : row
    )
  }
  return {
    ...form,
    vcfs,
    accessions: replaceFileRows(form.accessions, id, rows),
  }
}

function inspect(vcf: VcfFile) {
  setInspect(vcf.id, { state: "running" })
  inspectFile(vcf.file, "vcf").then(
    (result) => {
      const stillThere = useWizardStore
        .getState()
        .draft?.form.vcfs.some((v) => v.id === vcf.id)
      if (!stillThere) return setInspect(vcf.id, null)
      if (!result.error && result.samples == null) {
        setInspect(vcf.id, {
          state: "note",
          note: result.note ?? "Samples are listed once the file is read.",
        })
      } else {
        setInspect(vcf.id, null)
      }
      useWizardStore
        .getState()
        .update((form) => applyResult(form, vcf.id, result))
    },
    (error: Error) => {
      setInspect(vcf.id, null)
      useWizardStore.getState().update((form) => ({
        ...form,
        vcfs: form.vcfs.map((v) =>
          v.id === vcf.id
            ? {
                ...v,
                inspectError: `Could not read the header: ${error.message}`,
              }
            : v
        ),
      }))
    }
  )
}

/** Retry reading a header after an error. */
export function reinspect(vcfId: string) {
  useWizardStore.getState().update((form) => ({
    ...form,
    vcfs: form.vcfs.map((v) =>
      v.id === vcfId ? { ...v, inspectError: null } : v
    ),
  }))
}

/** Mount wherever VCFs should be read (step 2; the wizard shell may mount it too). */
export function useVcfInspector() {
  const { vcfs } = useForm()
  const items = useUploads((s) => s.items)
  useEffect(() => {
    const states = useInspectState.getState()
    for (const vcf of vcfs) {
      if (vcf.samples !== null || vcf.inspectError !== null || states[vcf.id])
        continue
      if (!vcf.file.location) continue
      if (vcf.file.source === "upload") {
        const item = Object.values(items).find(
          (i) => i.uploadId === vcf.file.location
        )
        // Unknown here (e.g. browser storage cleared): the server may have it.
        if (item && item.status !== "verified") continue
      }
      inspect(vcf)
    }
  }, [vcfs, items])
}
