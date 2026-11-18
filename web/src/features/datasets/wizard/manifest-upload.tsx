import { FileUpIcon } from "lucide-react"
import { useRef, useState, type ChangeEvent } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import { importManifest } from "../api"
import type { WizardForm } from "../types"
import { useForm, useWizardStore } from "../wizard-store"

/** Manifests are a few KB; anything much larger is the wrong file. */
const MAX_MANIFEST_BYTES = 2_000_000

function hasInput(form: WizardForm): boolean {
  return Boolean(
    form.name.trim() ||
    form.description.trim() ||
    form.reference.fasta ||
    form.reference.gff ||
    form.vcfs.length ||
    form.accessions.length
  )
}

/**
 * The row at the top of step 1: fill in the whole form from a manifest file
 * (YAML, as "Download manifest" gives it) instead of entering it by hand.
 */
export function ManifestUpload() {
  const form = useForm()
  const update = useWizardStore((s) => s.update)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  // A manifest that was read while the form already holds input.
  const [pending, setPending] = useState<{
    form: WizardForm
    notes: string[]
  } | null>(null)

  function apply(imported: { form: WizardForm; notes: string[] }) {
    update(() => imported.form)
    for (const note of imported.notes) {
      toast.warning(note, { duration: 30_000, closeButton: true })
    }
    toast.success(
      "Filled in from the manifest. Check each step, then review and build."
    )
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Lets the same file be chosen again after an error.
    event.target.value = ""
    if (!file) return
    if (file.size > MAX_MANIFEST_BYTES) {
      toast.error("This file is too large to be a dataset manifest.")
      return
    }
    setBusy(true)
    try {
      const imported = await importManifest(await file.text())
      if (hasInput(form)) setPending(imported)
      else apply(imported)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The manifest could not be read."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2">
      <p className="min-w-0 flex-1 basis-60 text-muted-foreground">
        You can upload a manifest instead: a file from{" "}
        <span className="text-foreground">Download manifest</span> of a dataset
        that built before fills in every step.
      </p>
      <input
        ref={input}
        type="file"
        accept=".yaml,.yml,text/yaml,application/x-yaml"
        className="hidden"
        onChange={onFile}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? <Spinner className="size-3" /> : <FileUpIcon />} Upload manifest
      </Button>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace what you have entered?</AlertDialogTitle>
            <AlertDialogDescription>
              The manifest fills in every step of this dataset. The name, files,
              accessions and options entered so far are replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep what I have</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) apply(pending)
                setPending(null)
              }}
            >
              Replace with the manifest
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
