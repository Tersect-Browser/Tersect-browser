import { CircleAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

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
import type { AccessionGroup } from "@/lib/types"

interface AddGroupDialogProps {
  selectedAccessions: string[]
  groups: AccessionGroup[]
  categories: string[]
  onSave: (group: AccessionGroup) => void
  onClose: () => void
}

export function AddGroupDialog({
  selectedAccessions,
  groups,
  categories,
  onSave,
  onClose,
}: AddGroupDialogProps) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")

  const [submitted, setSubmitted] = useState(false)

  const groupName = name.trim()
  const nameInUse = groups.some((group) => group.name === groupName)
  const nameError = !groupName
    ? "A group name is required."
    : nameInUse
      ? "A group with this name already exists."
      : null

  const save = () => {
    const group: AccessionGroup = {
      name: groupName,
      accessions: selectedAccessions,
    }
    if (category.trim()) {
      group.category = category.trim()
    }
    onSave(group)
    toast.success("Group saved")
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Save as a group</DialogTitle>
          <DialogDescription className="text-foreground">
            Saving{" "}
            <b className="font-mono font-medium">{selectedAccessions.length}</b>{" "}
            selected accession{selectedAccessions.length === 1 ? "" : "s"} as a
            new group.
          </DialogDescription>
        </DialogHeader>

        <form
          id="add-group-form"
          className="flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (!nameError) {
              save()
            }
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="group-name">
              Group name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="group-name"
              autoFocus
              placeholder="e.g. Cherry types"
              value={name}
              aria-invalid={(submitted || nameInUse) && !!nameError}
              aria-describedby="group-name-error"
              onChange={(event) => setName(event.target.value)}
            />
            {(submitted || nameInUse) && nameError && (
              <span
                id="group-name-error"
                className="flex items-center gap-1 text-t11 text-destructive"
              >
                <CircleAlertIcon className="size-3" />
                {nameError}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="group-category">Category</Label>
            <Input
              id="group-category"
              list="group-categories"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <datalist id="group-categories">
              {categories.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <span className="text-t11 text-muted-foreground">
              Pick a category or type a new one.
            </span>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-group-form"
            disabled={selectedAccessions.length === 0}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
