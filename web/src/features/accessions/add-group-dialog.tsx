import { PlusIcon } from "lucide-react"
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

  const groupName = name.trim()
  const nameInUse = groups.some((group) => group.name === groupName)

  const save = () => {
    const group: AccessionGroup = {
      name: groupName,
      accessions: selectedAccessions,
    }
    if (category.trim()) {
      group.category = category.trim()
    }
    onSave(group)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add group</DialogTitle>
          <DialogDescription>
            Saving{" "}
            <b>
              {selectedAccessions.length > 1
                ? selectedAccessions.length
                : "one"}
            </b>{" "}
            selected accession{selectedAccessions.length > 1 ? "s" : ""} as a
            new group.
          </DialogDescription>
        </DialogHeader>

        <form
          id="add-group-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (groupName && !nameInUse) {
              save()
            }
          }}
        >
          {nameInUse && (
            <Alert variant="destructive">
              <AlertDescription>Group name already in use</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-name">Group name (required)</Label>
            <Input
              id="group-name"
              autoFocus
              value={name}
              aria-invalid={nameInUse}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
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
          </div>
        </form>

        <DialogFooter>
          <Button
            type="submit"
            form="add-group-form"
            disabled={
              selectedAccessions.length === 0 || !groupName || nameInUse
            }
          >
            <PlusIcon />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
