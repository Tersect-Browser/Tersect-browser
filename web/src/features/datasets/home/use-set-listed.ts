import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { setDatasetListed } from "../api"

/**
 * List or unlist a published dataset. Unlisted datasets are left out of the
 * public dataset list but still open from share links, and stay on Home
 * (marked Unlisted) so they can be listed again.
 */
export function useSetListed(datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listed: boolean) => setDatasetListed(datasetId, listed),
    onSuccess: ({ listed }) => {
      toast.success(
        listed
          ? `${datasetId} is listed.`
          : `${datasetId} is unlisted. Its share links still work.`
      )
    },
    onError: (e: Error) =>
      toast.error(`Could not change ${datasetId}: ${e.message}`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["builder", "datasets"] })
      // The public list (tbapi) used by the top bar and the fallback Home.
      void queryClient.invalidateQueries({ queryKey: ["datasets"] })
    },
  })
}
