import {
  FileSpreadsheetIcon,
  HardDriveIcon,
  LinkIcon,
  UploadIcon,
} from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Add bar: drop zone for VCFs, Browse, Paste URLs, Server folder, Accession sheet. */
export function AccessionsAddBar({
  large,
  onFiles,
  onPasteUrls,
  onServerFolder,
  onSheet,
}: {
  /** Empty state (6b): the bigger zone. */
  large: boolean
  onFiles: (files: File[]) => void
  onPasteUrls: () => void
  onServerFolder: () => void
  onSheet: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const browse = (
    <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
      Browse
    </Button>
  )
  const others = (
    <>
      <Button variant="outline" size="sm" onClick={onPasteUrls}>
        <LinkIcon /> Paste URLs
      </Button>
      <Button variant="outline" size="sm" onClick={onServerFolder}>
        <HardDriveIcon /> Server folder
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex rounded-md border border-dashed border-input bg-card transition-colors",
          large
            ? "min-h-36 flex-col items-center justify-center gap-2.5 px-6 py-6 text-center"
            : "min-h-12 flex-wrap items-center gap-2 px-3 py-2",
          over && "border-ring bg-accent/60"
        )}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
          setOver(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          onFiles([...event.dataTransfer.files])
        }}
      >
        <UploadIcon
          className={cn(
            "shrink-0 text-muted-foreground",
            large ? "size-5" : "size-4"
          )}
        />
        {large ? (
          <>
            <div className="flex flex-col gap-0.5">
              <p className="font-medium">Drop .vcf.gz files here</p>
              <p className="text-t11 text-muted-foreground">
                One file per accession, or multi-sample files. Uploads resume if
                interrupted.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {browse}
              {others}
            </div>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">
              Drop more .vcf.gz files here, or
            </span>
            {browse}
            <span className="flex-1 max-sm:hidden" />
            {others}
            <Button variant="outline" size="sm" onClick={onSheet}>
              <FileSpreadsheetIcon /> Accession sheet
            </Button>
          </>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept=".vcf,.gz,.bgz,.bcf"
          className="hidden"
          aria-label="Choose VCF files"
          onChange={(event) => {
            onFiles([...(event.target.files ?? [])])
            event.target.value = ""
          }}
        />
      </div>

      {large && (
        <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 max-sm:flex-wrap">
          <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 basis-40 flex-col">
            <span className="font-medium">Accession sheet</span>
            <span className="text-t11 text-muted-foreground">
              Fill labels, groups and extra info columns from a CSV or TSV,
              matched by accession name. Available once files are added.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Add VCF files first"
          >
            Choose sheet
          </Button>
        </div>
      )}
    </div>
  )
}
