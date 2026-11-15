import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

/** 7e: shown on Cancel, or when leaving with uploads running. */
export function LeaveDialog({
  open,
  onOpenChange,
  title = "Leave the new dataset?",
  uploading,
  busy,
  onDiscard,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  /** Uploads of this draft still running. */
  uploading: number
  busy: "discard" | "save" | null
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Your work is kept as a draft. Resume it from Home to carry on where
            you left off.
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground">
          {uploading > 0
            ? `${uploading === 1 ? "One upload pauses" : `${uploading} uploads pause`} when you leave and ${uploading === 1 ? "resumes" : "resume"} from where ${uploading === 1 ? "it" : "they"} stopped when you come back.`
            : "Uploads pause when you leave and resume from where they stopped when you come back."}
        </p>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
            disabled={busy !== null}
            onClick={onDiscard}
          >
            {busy === "discard" && <Spinner className="size-3" />}
            Discard draft
          </Button>
          <div className="flex flex-col-reverse gap-1.5 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => onOpenChange(false)}
            >
              Keep editing
            </Button>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={onSave}
              autoFocus
            >
              {busy === "save" && <Spinner className="size-3" />}
              Save draft and leave
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
