import { useMutation } from "@tanstack/react-query"
import { DownloadIcon } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { generateBarcodes } from "@/lib/api"
import { toSameOrigin } from "@/lib/config"
import { formatLocus } from "@/lib/format"
import { usePlotStore } from "@/store/plot-store"
import { useUiStore, type BarcodeTarget } from "@/store/ui-store"

const DEFAULT_BARCODE_SIZE = 150
const DEFAULT_MAX_VARIANTS = 1

function BarcodeForm({ target }: { target: BarcodeTarget }) {
  const [barcodeSize, setBarcodeSize] = useState(String(DEFAULT_BARCODE_SIZE))
  const [maxVariants, setMaxVariants] = useState(String(DEFAULT_MAX_VARIANTS))

  const generate = useMutation({
    mutationFn: async () => {
      const datasetId = usePlotStore.getState().datasetId
      if (!datasetId) {
        throw new Error("No dataset is loaded")
      }
      const response = await generateBarcodes(datasetId, {
        accessionName: target.accession,
        chrom: target.chromosome,
        start: target.start,
        end: target.end,
        size: parseInt(barcodeSize, 10),
        maxVar: maxVariants === "" ? null : parseInt(maxVariants, 10),
      })
      return toSameOrigin(response.downloadableURL)
    },
  })

  const size = parseInt(barcodeSize, 10)
  const sizeValid = size >= 10 && size <= 1000
  const downloadUrl = generate.data

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        generate.mutate()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="barcode-size">Barcode size (bp)</Label>
        <Input
          id="barcode-size"
          type="number"
          min={10}
          max={1000}
          className="w-40 font-mono"
          value={barcodeSize}
          aria-invalid={!sizeValid}
          onChange={(event) => setBarcodeSize(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="barcode-max-variants">
          Maximum number of variants allowed per barcode (optional)
        </Label>
        <Input
          id="barcode-max-variants"
          type="number"
          min={0}
          className="w-40 font-mono"
          value={maxVariants}
          onChange={(event) => setMaxVariants(event.target.value)}
        />
      </div>

      {generate.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            The barcodes could not be generated.
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        {downloadUrl && (
          <Button asChild variant="outline">
            <a href={downloadUrl} download={downloadUrl.split("/").pop()}>
              <DownloadIcon />
              Download
            </a>
          </Button>
        )}
        <Button type="submit" disabled={generate.isPending || !sizeValid}>
          {generate.isPending && <Spinner />}
          Generate
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Generates barcodes that tell one accession apart within a region. */
export function BarcodeDialog() {
  const target = useUiStore((state) => state.barcodeTarget)
  const setTarget = useUiStore((state) => state.setBarcodeTarget)

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => !open && setTarget(null)}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Barcode generator</DialogTitle>
          <DialogDescription>
            Generate accession-specific barcodes that identify{" "}
            <b>{target?.accessionName}</b> from all other accessions within{" "}
            <span className="font-mono">
              {target &&
                formatLocus(target.chromosome, target.start, target.end)}
            </span>
            . The number of variants, repeat content and GC content are reported
            for each barcode.
          </DialogDescription>
        </DialogHeader>
        {target && (
          <BarcodeForm
            key={`${target.accession}:${target.start}`}
            target={target}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
