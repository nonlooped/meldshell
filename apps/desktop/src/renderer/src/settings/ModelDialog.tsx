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

      <div className="dialog-field">
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

        <div className="field">
          <span className="field-label">Reasoning efforts</span>
          <ToggleGroup
            className="effort-picker"
            multiple
            value={efforts}
            aria-label="Reasoning efforts"
            onValueChange={(values) =>
              setEfforts(REASONING_EFFORTS.filter((effort) => values.includes(effort)))
            }
          >
            {REASONING_EFFORTS.map((effort) => (
              <Toggle key={effort} value={effort} className="effort-toggle">
                {effortLabel(effort)}
              </Toggle>
            ))}
          </ToggleGroup>
        </div>

        <div className="checkbox-row">
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
