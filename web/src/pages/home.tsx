import { ArrowRightIcon } from "lucide-react"
import { Link } from "react-router"

import { useDatasets } from "@/components/app-shell"
import { Skeleton } from "@/components/ui/skeleton"
import type { DatasetPublic } from "@/lib/types"

/** Fields the API may provide in future; rows render without them. */
type Dataset = DatasetPublic & {
  description?: string
  accession_count?: number
}

const GRID = "grid grid-cols-[1fr_9rem_7rem_1.5rem] items-center gap-4 px-4"

function Message({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-muted-foreground">{detail}</p>
    </div>
  )
}

export function HomePage() {
  const datasets = useDatasets()
  const rows = (datasets.data ?? []) as Dataset[]

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-[860px] flex-col gap-8 px-6 pt-14 pb-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] leading-tight font-semibold">
            Compare genomes along a chromosome
          </h1>
          <p className="max-w-[640px] text-sm text-muted-foreground">
            Tersect Browser shows how far every accession in a dataset is from a
            reference you choose, bin by bin, beside a tree of their similarity.
            Use it to find introgressions, then drill into the genes and
            variants behind them.
          </p>
        </div>

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className={`${GRID} caption border-b py-2`}>
            <span>Dataset</span>
            <span>Reference</span>
            <span className="text-right">Accessions</span>
            <span />
          </div>

          {datasets.isPending &&
            [0, 1, 2].map((row) => (
              <div
                key={row}
                className={`${GRID} border-b py-3 last:border-b-0`}
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="ml-auto h-4 w-10" />
                <span />
              </div>
            ))}

          {datasets.isError && (
            <Message
              title="Datasets could not be loaded"
              detail="The server did not respond. Check that the backend is running."
            />
          )}
          {datasets.isSuccess && rows.length === 0 && (
            <Message
              title="No datasets yet"
              detail="Datasets appear here once they have been added to the server."
            />
          )}

          {rows.map((dataset) => (
            <Link
              key={dataset.dataset_id}
              to={`/share/${dataset.view_id}`}
              className={`${GRID} border-b py-3 last:border-b-0 hover:bg-accent`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {dataset.dataset_id}
                </span>
                {dataset.description && (
                  <span className="block truncate text-muted-foreground">
                    {dataset.description}
                  </span>
                )}
              </span>
              <span className="font-mono">{dataset.reference}</span>
              <span className="text-right font-mono">
                {dataset.accession_count?.toLocaleString("en-US")}
              </span>
              <ArrowRightIcon className="size-[13px] text-muted-foreground" />
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
