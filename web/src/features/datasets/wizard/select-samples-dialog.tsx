import { SearchIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import type { VcfFile } from "../types"
import { rowsForVcf, useWizardStore } from "../wizard-store"
import { plural, replaceFileRows } from "./accessions-shared"

/** Make the chosen samples a file's rows, keeping edits to rows that stay. */
export function selectSamples(vcfId: string, chosen: string[]) {
  useWizardStore.getState().update((form) => {
    const vcf = form.vcfs.find((v) => v.id === vcfId)
    if (!vcf?.samples) return form
    const selected = vcf.samples.filter((s) => chosen.includes(s))
    const next = { ...vcf, selected }
    return {
      ...form,
      vcfs: form.vcfs.map((v) => (v.id === vcfId ? next : v)),
      accessions: replaceFileRows(
        form.accessions,
        vcfId,
        rowsForVcf(next, form.accessions)
      ),
    }
  })
}

/** 7d: which samples of a multi-sample VCF become accessions. */
export function SelectSamplesDialog({
  vcf,
  onOpenChange,
}: {
  /** The file to pick from; null closes the dialog. */
  vcf: VcfFile | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={vcf !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Select samples</DialogTitle>
          {vcf && (
            <DialogDescription className="flex min-w-0 items-baseline gap-2">
              <span
                className="min-w-0 truncate font-mono text-foreground"
                title={vcf.file.name}
              >
                {vcf.file.name}
              </span>
              <span className="shrink-0">
                {plural(vcf.samples?.length ?? 0, "sample")} in file
              </span>
            </DialogDescription>
          )}
        </DialogHeader>
        {vcf?.samples && (
          <SampleChecklist
            key={vcf.id}
            samples={vcf.samples}
            initial={vcf.selected.length ? vcf.selected : vcf.samples}
            onCancel={() => onOpenChange(false)}
            onApply={(chosen) => {
              selectSamples(vcf.id, chosen)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SampleChecklist({
  samples,
  initial,
  onCancel,
  onApply,
}: {
  samples: string[]
  initial: string[]
  onCancel: () => void
  onApply: (chosen: string[]) => void
}) {
  const [chosen, setChosen] = useState(() => new Set(initial))
  const [filter, setFilter] = useState("")
  const term = filter.trim().toLowerCase()
  const shown = term
    ? samples.filter((s) => s.toLowerCase().includes(term))
    : samples
  const allShown = shown.length > 0 && shown.every((s) => chosen.has(s))

  const toggle = (sample: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(sample)
    else next.delete(sample)
    setChosen(next)
  }
  const setShown = (on: boolean) => {
    const next = new Set(chosen)
    for (const s of shown) {
      if (on) next.add(s)
      else next.delete(s)
    }
    setChosen(next)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex h-(--control-sm) min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input px-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            aria-label="Filter samples"
            placeholder="Filter samples"
            className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-muted-foreground"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <Button variant="ghost" size="xs" onClick={() => setShown(!allShown)}>
          {allShown ? "Clear" : "Select all"}
        </Button>
      </div>
      <div className="max-h-[280px] overflow-y-auto rounded-md border py-1">
        {shown.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-muted-foreground">
            No sample matches.
          </p>
        ) : (
          shown.map((sample) => {
            const id = `sample-${sample}`
            return (
              <div
                key={sample}
                className="flex h-5 items-center gap-2 px-2.5 hover:bg-accent"
              >
                <Checkbox
                  id={id}
                  className="size-3.5"
                  checked={chosen.has(sample)}
                  onCheckedChange={(on) => toggle(sample, on === true)}
                />
                <label
                  htmlFor={id}
                  className="min-w-0 flex-1 cursor-pointer truncate font-mono"
                >
                  {sample}
                </label>
              </div>
            )
          })
        )}
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">
          {chosen.size} of {samples.length} selected
        </span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={chosen.size < 1}
            onClick={() => onApply(samples.filter((s) => chosen.has(s)))}
          >
            Use {plural(chosen.size, "sample")}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
