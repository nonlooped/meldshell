import { modelLabel } from "../data/model-label"
import { useState } from "react"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import type { ProviderModel, ReasoningEffort, UpsertModelInput } from "@meldshell/contracts"
import { REASONING_EFFORTS } from "@meldshell/contracts"
import { effortLabel } from "../data/catalog"
import { AppDialog, Button, Switch, TextField } from "../ui/controls"

interface ModelDialogProps {
  readonly providerId: string
  /** `null` opens the dialog in create mode. */
  readonly model: ProviderModel | null
  readonly onClose: () => void
  readonly onSubmit: (input: UpsertModelInput) => void
}

/** The caller mounts a fresh form for each model. */
export function ModelDialog({
  providerId,
  model,
  onClose,
  onSubmit,
}: ModelDialogProps): React.JSX.Element {
  const [slug, setSlug] = useState(model?.slug ?? "")
  const [displayName, setDisplayName] = useState(model?.displayName ?? "")
  const [efforts, setEfforts] = useState<ReadonlyArray<ReasoningEffort>>(
    model?.reasoningEfforts ?? ["low", "medium", "high"],
  )
  const [supportsFast, setSupportsFast] = useState(model?.supportsFast ?? false)

  const submit = (): void => {
    onSubmit({
      providerId,
      ...(model === null ? {} : { modelId: model.id }),
      slug,
      displayName: displayName.trim() === "" ? slug : displayName,
      reasoningEfforts: efforts,
      supportsFast,
    })
    onClose()
  }

  return (
    <AppDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={model === null ? "Add a model" : `Edit ${modelLabel(model.displayName)}`}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={slug.trim() === ""} onClick={submit}>
            {model === null ? "Add model" : "Save changes"}
          </Button>
        </>
      }
    >
      <p>
        Use the exact model identifier accepted by your provider. The display name appears in
        MeldShell's menus.
      </p>

      <div className="[padding:14px_20px_0] mt-[0]">
        <TextField
          label="Model identifier"
          mono
          value={slug}
          placeholder="gpt-5.1-codex"
          onValueChange={setSlug}
        />
        <TextField
          label="Display name"
          value={displayName}
          placeholder={slug === "" ? "GPT-5.1 Codex" : slug}
          onValueChange={setDisplayName}
        />

        <div className="field block [&_+_.field]:mt-[14px]">
          <span className="block mb-[6px] text-[var(--text-secondary)] text-[11.5px] font-medium">
            Reasoning efforts
          </span>
          <ToggleGroup
            className="flex flex-wrap gap-[6px]"
            multiple
            value={efforts}
            aria-label="Reasoning efforts"
            onValueChange={(values) =>
              setEfforts(REASONING_EFFORTS.filter((effort) => values.includes(effort)))
            }
          >
            {REASONING_EFFORTS.map((effort) => (
              <Toggle
                key={effort}
                value={effort}
                className="motion-colors h-[26px] [padding:0_10px] border-[1px] border-[color:var(--line)] rounded-[var(--radius)] bg-transparent text-[var(--text-tertiary)] cursor-default text-[11.5px] [&:hover]:text-[var(--text-secondary)] [&[data-pressed]]:[border-color:transparent] [&[data-pressed]]:bg-[var(--accent)] [&[data-pressed]]:text-[var(--accent-foreground)] [&[data-pressed]]:font-medium"
              >
                {effortLabel(effort)}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-[10px] mt-[16px] text-[var(--text-secondary)] text-[12.5px]">
          <Switch
            checked={supportsFast}
            onCheckedChange={setSupportsFast}
            label="Offers a fast tier"
          />
          <span>Offers a fast tier</span>
        </div>
      </div>
    </AppDialog>
  )
}
