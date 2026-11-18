import { useState } from "react"
import { HexColorPicker } from "react-colorful"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const GROUP_COLOR_COUNT = 19

/**
 * Preset group colours, from the `--group-1` ... `--group-19` tokens. Groups
 * store the hex value itself, so shared views keep their colours.
 */
function readGroupColors(): string[] {
  const style = getComputedStyle(document.documentElement)
  return Array.from({ length: GROUP_COLOR_COUNT }, (_, i) =>
    style.getPropertyValue(`--group-${i + 1}`).trim()
  ).filter(Boolean)
}

/** Diagonal stripe marking "no colour". */
const NO_COLOR_STYLE = {
  background:
    "linear-gradient(to top right, transparent calc(50% - 1px), var(--destructive) calc(50% - 1px), var(--destructive) calc(50% + 1px), transparent calc(50% + 1px))",
}

export function ColorSwatch({
  color,
  className,
  ...props
}: React.ComponentProps<"span"> & { color: string | undefined }) {
  return (
    <span
      className={cn(
        "inline-block size-4 shrink-0 rounded-sm border",
        className
      )}
      style={color ? { backgroundColor: color } : NO_COLOR_STYLE}
      {...props}
    />
  )
}

interface ColorPickerProps {
  color: string | undefined
  onConfirm: (color: string | undefined) => void
  onCancel: () => void
}

/** Free colour picker plus preset swatches, including "no colour". */
export function ColorPicker({ color, onConfirm, onCancel }: ColorPickerProps) {
  const [draft, setDraft] = useState(color)
  const [presets] = useState(readGroupColors)
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">Select group color</div>
      <HexColorPicker
        color={draft ?? presets[0] ?? ""}
        onChange={setDraft}
        style={{ width: "100%", height: 140 }}
      />
      <div className="flex flex-wrap gap-1 max-sm:grid max-sm:grid-cols-5 max-sm:gap-2">
        {[undefined, ...presets].map((preset) => (
          <button
            key={preset ?? "none"}
            type="button"
            aria-label={preset ?? "No color"}
            aria-pressed={draft === preset}
            className={cn(
              "rounded-sm",
              draft === preset && "ring-2 ring-ring ring-offset-1"
            )}
            onClick={() => setDraft(preset)}
          >
            <ColorSwatch
              color={preset}
              className="block size-5 max-sm:h-8 max-sm:w-full"
            />
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <ColorSwatch color={draft} className="size-6" />
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onConfirm(draft)}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  )
}
