import { useMutation, useQuery } from "@tanstack/react-query"
import { PlusSquareIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { getTgrcAccessions, getTgrcGeneAlleles, getTgrcGenes } from "@/lib/api"
import type { AccessionInfo } from "@/lib/types"

/** Accession info field holding the TGRC accession number. */
const TGRC_FIELD = "TGRC #"

interface TgrcImporterProps {
  infos: AccessionInfo[]
  onInfosChange: (infos: AccessionInfo[]) => void
}

/**
 * Adds a column to the accession table with each accession's allele of a
 * gene from the Tomato Genetics Resource Center.
 */
export function TgrcImporter({ infos, onInfosChange }: TgrcImporterProps) {
  const [open, setOpen] = useState(false)

  const genes = useQuery({
    queryKey: ["tgrc", "genes"],
    queryFn: ({ signal }) => getTgrcGenes(signal),
    staleTime: Infinity,
  })
  const accessions = useQuery({
    queryKey: ["tgrc", "accessions"],
    queryFn: ({ signal }) => getTgrcAccessions(signal),
    staleTime: Infinity,
  })

  /** Genes with a known allele in at least one accession of this dataset. */
  const options = useMemo(() => {
    if (!genes.data || !accessions.data) {
      return []
    }
    const tgrcNumbers = new Set(infos.map((info) => info[TGRC_FIELD]))
    const geneIds = new Set<string>()
    for (const accession of accessions.data) {
      if (tgrcNumbers.has(accession.accession)) {
        accession.alleles.forEach((allele) => geneIds.add(allele.gene))
      }
    }
    return genes.data
      .filter((gene) => geneIds.has(gene.gene))
      .map((gene) => ({
        value: gene.gene,
        label: gene.locusName?.length
          ? `${gene.gene} (${gene.locusName})`
          : gene.gene,
      }))
  }, [genes.data, accessions.data, infos])

  const importGene = useMutation({
    mutationFn: getTgrcGeneAlleles,
    onSuccess: (alleles, gene) => {
      onInfosChange(
        infos.map((info) => ({
          ...info,
          [gene]: alleles[info[TGRC_FIELD]] ?? "",
        }))
      )
    },
    onError: () => toast.error("The gene could not be imported."),
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={importGene.isPending}>
          <PlusSquareIcon />
          Import TGRC gene...
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search genes..." />
          <CommandList>
            <CommandEmpty>
              {genes.isPending || accessions.isPending
                ? "Loading genes..."
                : "No gene found."}
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    importGene.mutate(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
