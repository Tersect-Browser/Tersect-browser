import { ChevronRightIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

import { SuggestedOptions } from "../assistant/suggested-blocks"
import { formatCount } from "../format"
import type {
  EffectsMode,
  FileRef,
  InspectResult,
  VariantTypes,
} from "../types"
import { useForm, useWizardStore } from "../wizard-store"
import { FileInput } from "./file-input"
import { Segmented } from "./segmented"
import {
  CautionNote,
  Field,
  LockedNote,
  ReadOnlyRow,
  Section,
} from "./step-reference"
import { Switch } from "./switch"
import { distanceLabel, effectsLabel } from "./wizard-helpers"

function EffectCard({
  value,
  title,
  description,
  disabled,
  selected,
  children,
}: {
  value: EffectsMode
  title: string
  description: ReactNode
  disabled?: boolean
  selected: boolean
  children?: ReactNode
}) {
  const id = `effects-${value}`
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card px-2.5 py-2",
        selected && !disabled && "border-primary bg-accent/40",
        disabled && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <RadioGroupItem
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-description`}
          className="mt-px size-[max(0.875rem,var(--cb))]"
        />
        <label
          htmlFor={id}
          className={cn("flex flex-col gap-0.5", !disabled && "cursor-pointer")}
        >
          <span className="font-medium">{title}</span>
          <span
            id={`${id}-description`}
            className="text-t11 text-muted-foreground"
          >
            {description}
          </span>
        </label>
      </div>
      {children}
    </div>
  )
}

function ReadOnlyOptions() {
  const form = useForm()
  const base = useWizardStore((s) => s.draft?.base_dataset ?? null)
  return (
    <div className="flex max-w-[760px] flex-col gap-4 px-4 pt-4 pb-7 sm:px-6 sm:py-5">
      <LockedNote base={base} />
      <dl className="flex flex-col">
        <ReadOnlyRow label="Variant effects">{effectsLabel(form)}</ReadOnlyRow>
        <ReadOnlyRow label="Distance index">{distanceLabel(form)}</ReadOnlyRow>
      </dl>
    </div>
  )
}

export function StepOptions({
  fix,
}: {
  fix?: { kind?: string; target?: string }
}) {
  const form = useForm()
  const draft = useWizardStore((s) => s.draft)
  const update = useWizardStore((s) => s.update)
  const { options } = form
  const hasGff = form.reference.gff !== null
  const addMode = draft?.mode === "add"
  const [advanced, setAdvanced] = useState(
    options.useIndex || fix?.kind === "index"
  )

  // Without a GFF, Build from GFF is not possible: None is selected (6c).
  const needsSwitch = !addMode && !hasGff && options.effects === "build"
  useEffect(() => {
    if (needsSwitch)
      update((f) => ({ ...f, options: { ...f.options, effects: "none" } }))
  }, [needsSwitch, update])

  const setOptions = useCallback(
    (change: Partial<typeof options>) =>
      update((f) => ({ ...f, options: { ...f.options, ...change } })),
    [update]
  )

  const onIndex = useCallback(
    (ref: FileRef | null) => setOptions({ index: ref, indexSamples: null }),
    [setOptions]
  )
  const onIndexInspect = useCallback(
    (result: InspectResult) => {
      if (!result.error && result.samples)
        setOptions({ indexSamples: result.samples })
    },
    [setOptions]
  )

  if (addMode) return <ReadOnlyOptions />

  const effects = options.useIndex ? "none" : options.effects

  return (
    <div className="flex max-w-[760px] flex-col gap-6 px-4 pt-4 pb-7 sm:px-6 sm:py-5">
      <SuggestedOptions />
      <Section title="Variant effects">
        <RadioGroup
          aria-label="Variant effects"
          value={effects}
          disabled={options.useIndex}
          onValueChange={(value) =>
            setOptions({ effects: value as EffectsMode })
          }
          className="gap-1.5"
        >
          <EffectCard
            value="build"
            title="Build from GFF"
            selected={effects === "build"}
            disabled={!hasGff || options.useIndex}
            description={
              hasGff
                ? "Make a snpEff database from the reference and its gene models, then annotate every variant."
                : "Needs gene models: add a GFF3 file in step 1 (Reference)."
            }
          />
          <EffectCard
            value="prebuilt"
            title="Prebuilt snpEff database"
            selected={effects === "prebuilt"}
            disabled={options.useIndex}
            description="Use a database snpEff already has, by name."
          >
            {effects === "prebuilt" && (
              <div className="pl-[22px]">
                <Input
                  aria-label="snpEff database name"
                  value={options.snpeffDb}
                  placeholder="SL2.50"
                  autoFocus={!options.snpeffDb}
                  aria-invalid={!options.snpeffDb.trim() || undefined}
                  onChange={(event) =>
                    setOptions({ snpeffDb: event.target.value })
                  }
                  className="h-(--control-sm) w-[200px] max-w-full font-mono"
                />
              </div>
            )}
          </EffectCard>
          <EffectCard
            value="none"
            title="None"
            selected={effects === "none"}
            disabled={options.useIndex}
            description="Skip annotation. Variants are listed without predicted effects or genes."
          />
        </RadioGroup>
        {options.useIndex && (
          <p className="text-t11 text-muted-foreground">
            Not used with an existing Tersect index.
          </p>
        )}
      </Section>

      <Section title="Distance index">
        <Field label={<span id="variant-types">Variant types</span>}>
          <Segmented<VariantTypes>
            aria-labelledby="variant-types"
            value={options.types}
            onChange={(types) => setOptions({ types })}
            options={[
              { value: "snps", label: "SNPs", disabled: options.useIndex },
              { value: "indels", label: "Indels", disabled: options.useIndex },
              { value: "both", label: "Both", disabled: options.useIndex },
            ]}
            className="self-start"
          />
        </Field>
        <div className="flex items-start gap-2">
          <Switch
            id="homozygous"
            checked={options.homozygous}
            disabled={options.useIndex}
            onCheckedChange={(homozygous) => setOptions({ homozygous })}
            aria-describedby="homozygous-help"
            className="mt-px"
          />
          <div className="flex flex-col gap-0.5">
            <label
              htmlFor="homozygous"
              className="font-medium whitespace-nowrap"
            >
              Homozygous only
            </label>
            <span
              id="homozygous-help"
              className="text-t11 text-muted-foreground"
            >
              Count only homozygous alternative genotypes; heterozygous calls
              are left out of the distances.
            </span>
          </div>
        </div>
      </Section>

      <section className="flex flex-col gap-2.5">
        <button
          type="button"
          aria-expanded={advanced}
          aria-controls="advanced-options"
          onClick={() => setAdvanced((open) => !open)}
          className="flex items-center gap-1 self-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-lg:min-h-11 pointer-coarse:min-h-11"
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              advanced && "rotate-90"
            )}
          />
          <span className="caption">Advanced</span>
        </button>
        {advanced && (
          <div
            id="advanced-options"
            className="flex flex-col gap-2.5 pl-[18px]"
          >
            <div className="flex items-start gap-2">
              <Switch
                id="use-index"
                checked={options.useIndex}
                onCheckedChange={(useIndex) => setOptions({ useIndex })}
                className="mt-px"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor="use-index" className="font-medium">
                  Use an existing Tersect index (.tsi) instead of VCFs
                </label>
                <span className="text-t11 text-muted-foreground">
                  Accessions come from the samples in the index; step 2 lists
                  them for labels and groups.
                </span>
              </div>
            </div>
            {options.useIndex && (
              <>
                <FileInput
                  kind="tsi"
                  label="Tersect index"
                  value={options.index}
                  onChange={onIndex}
                  accept=".tsi"
                  dropLabel="Drop the .tsi file here"
                  draftId={draft?.id ?? ""}
                  inspected={options.indexSamples !== null}
                  onInspect={onIndexInspect}
                  help={
                    options.indexSamples
                      ? `${formatCount(options.indexSamples.length)} samples in the index.`
                      : undefined
                  }
                />
                <CautionNote>
                  <span className="font-semibold">No variant search.</span> A
                  prebuilt index has distances and trees but no variant records,
                  so the browser cannot search variants or show their effects.
                  Variant effects are set to None.
                </CautionNote>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
