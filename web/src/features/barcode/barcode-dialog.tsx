import { useMutation } from "@tanstack/react-query"
import { CircleAlertIcon, CircleCheckIcon, DownloadIcon } from "lucide-react"
import { useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
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

function BarcodeForm({
  target,
  onClose,
}: {
  target: BarcodeTarget
  onClose: () => void
}) {
  const [barcodeSize, setBarcodeSize] = useState(String(DEFAULT_BARCODE_SIZE))
  const [maxVariants, setMaxVariants] = useState("")

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
      return {
        url: toSameOrigin(response.downloadableURL),
        filename:
          response.filename ?? response.downloadableURL.split("/").pop() ?? "",
        count: response.count,
      }
    },
  })

  const size = parseInt(barcodeSize, 10)
  const sizeValid = size >= 10 && size <= 1000
  const result = generate.data
  const done = result !== undefined && !generate.isPending

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        generate.mutate()
      }}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-[3px] rounded-xl bg-muted px-2.5 py-2">
        <dt className="text-muted-foreground">Accession</dt>
        <dd className="font-mono">{target.accessionName}</dd>
        <dt className="text-muted-foreground">Region</dt>
        <dd className="font-mono">
          {formatLocus(target.chromosome, target.start, target.end)}
        </dd>
      </dl>
      <p className="leading-normal text-pretty text-muted-foreground">
        A barcode is a short DNA sequence that occurs in this accession and in
        no other selected accession within the region. Barcodes can be used as
        diagnostic markers.
      </p>
      <p className="leading-normal text-pretty text-muted-foreground">
        Longer barcodes are more specific. Limiting the number of variants per
        barcode keeps them easier to assay.
      </p>

      <div className="grid grid-cols-2 items-end gap-2.5 max-sm:grid-cols-1">
        <div className="flex flex-col gap-1">
          <Label htmlFor="barcode-size">Barcode size (bp)</Label>
          <Input
            id="barcode-size"
            type="number"
            min={10}
            max={1000}
            className="text-right font-mono"
            value={barcodeSize}
            aria-invalid={!sizeValid}
            onChange={(event) => setBarcodeSize(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="barcode-max-variants">
            Max variants per barcode
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            id="barcode-max-variants"
            type="number"
            min={0}
            placeholder="No limit"
            className="text-right font-mono"
            value={maxVariants}
            onChange={(event) => setMaxVariants(event.target.value)}
          />
        </div>
      </div>

      {generate.isError ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>
            The barcodes could not be generated.
          </AlertDescription>
        </Alert>
      ) : (
        done && (
          <div className="flex items-center gap-2 rounded-xl border px-2.5 py-2 max-sm:flex-wrap">
            <CircleCheckIcon className="size-[15px] shrink-0 text-primary" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">
                {result.count === undefined
                  ? "Barcodes ready"
                  : `${result.count.toLocaleString("en-US")} barcode${result.count === 1 ? "" : "s"} found`}
              </span>
              <span className="truncate font-mono text-t11 text-muted-foreground">
                {result.filename}
              </span>
            </div>
            <Button asChild className="max-sm:w-full">
              <a href={result.url} download={result.filename}>
                <DownloadIcon />
                Download
              </a>
            </Button>
          </div>
        )
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          type="submit"
          variant={done ? "outline" : "default"}
          className="max-sm:flex-1"
          disabled={generate.isPending || !sizeValid}
        >
          {generate.isPending && <Spinner />}
          {generate.isPending
            ? "Generating…"
            : done
              ? "Regenerate"
              : "Generate"}
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
      <DialogContent className="sm:w-[40vw] sm:max-w-none sm:min-w-[440px]">
        <DialogHeader>
          <DialogTitle>Barcode Generator</DialogTitle>
        </DialogHeader>
        {target && (
          <BarcodeForm
            key={`${target.accession}:${target.start}`}
            target={target}
            onClose={() => setTarget(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
