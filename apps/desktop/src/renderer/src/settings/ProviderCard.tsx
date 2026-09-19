import { providerStatusQuery, refreshProviderStatus } from "../data/providers"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { modelLabel } from "../data/model-label"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useQuery } from "@tanstack/react-query"
import type { Provider, ProviderModel } from "@meldshell/contracts"
import { Check, ChevronDown, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { SettingRow } from "./SettingRow"
import { effortLabel } from "../data/catalog"
import { ProviderIcon } from "../ui/ProviderIcon"
import { Button, DropdownMenu, MenuAction, Switch, TextField } from "../ui/controls"

interface ProviderCardProps {
  readonly provider: Provider
  readonly models: ReadonlyArray<ProviderModel>
  readonly onRename: (displayName: string) => void
  readonly onToggleProvider: (enabled: boolean) => void
  readonly onToggleModel: (
    model: ProviderModel,
    patch: { enabled?: boolean; hidden?: boolean },
  ) => void
  readonly onEditModel: (model: ProviderModel) => void
  readonly onDeleteModel: (model: ProviderModel) => void
  readonly onAddModel: () => void
  readonly onResetCatalog: () => void
}

const effortSummary = (model: ProviderModel): string =>
  model.reasoningEfforts.length === 0 ? "None" : model.reasoningEfforts.map(effortLabel).join(", ")

export function ProviderCard({
  provider,
  models,
  onRename,
  onToggleProvider,
  onToggleModel,
  onEditModel,
  onDeleteModel,
  onAddModel,
  onResetCatalog,
}: ProviderCardProps): React.JSX.Element {
  const status = useQuery(providerStatusQuery(provider.harness))
  // Commit on blur; key the input by the stored name to pick up external renames.
  const commitName = (input: HTMLInputElement): void => {
    const trimmed = input.value.trim()
    if (trimmed === "" || trimmed === provider.displayName) {
      input.value = provider.displayName
      return
    }
    onRename(trimmed)
  }

  return (
    <Collapsible.Root className="settings-group provider-card" render={<section />}>
      <div className="provider-card-header">
        <Collapsible.Trigger className="provider-disclosure">
          <span className="provider-logo" aria-hidden="true">
            <ProviderIcon provider={provider} size={18} />
          </span>
          <span className="provider-identity">
            <div>
              <span className="setting-label">{provider.displayName}</span>
              <p className="provider-sub">
                {provider.harness} · {models.length} {models.length === 1 ? "model" : "models"}
              </p>
            </div>
          </span>
          <ChevronDown className="provider-chevron" size={15} strokeWidth={1.75} />
        </Collapsible.Trigger>
        <label className="provider-toggle">
          <span>{provider.enabled ? "Enabled" : "Disabled"}</span>
          <Switch
            checked={provider.enabled}
            onCheckedChange={onToggleProvider}
            label={`Enable ${provider.displayName}`}
          />
        </label>
      </div>

      <Collapsible.Panel className="provider-details" keepMounted>
        <SettingRow label="Connection" description={status.data?.detail ?? "Connecting..."}>
          <Button onClick={() => void refreshProviderStatus(provider.harness)}>Check again</Button>
        </SettingRow>
        <SettingRow
          label="Display name"
          description="The name shown in menus and thread controls."
          controlId={`provider-name-${provider.id}`}
        >
          <TextField
            id={`provider-name-${provider.id}`}
            key={provider.displayName}
            aria-label={`Display name for ${provider.displayName}`}
            defaultValue={provider.displayName}
            onBlur={(event) => commitName(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") {
                event.currentTarget.value = provider.displayName
                event.currentTarget.blur()
              }
            }}
          />
        </SettingRow>

        <div className="model-table">
          <div className="model-table-title">
            <span>Models</span>
            <span>{models.length} in catalog</span>
          </div>
          <div className="model-table-header">
            <span>Model</span>
            <span>Reasoning</span>
            <span>Fast</span>
            <span>Hidden</span>
            <span>Enabled</span>
            <span />
          </div>

          {models.length === 0 ? (
            <p className="settings-empty">
              This provider has no models. Add one to make it selectable in the composer.
            </p>
          ) : (
            models.map((model) => (
              <div key={model.id} className="model-row" data-disabled={!model.enabled}>
                <div className="model-identity">
                  <span className="model-name" title={modelLabel(model.displayName)}>
                    {modelLabel(model.displayName)}
                  </span>
                </div>
                <span className="effort-summary">{effortSummary(model)}</span>
                <span className="tick" data-off={!model.supportsFast}>
                  {model.supportsFast ? <Check size={14} strokeWidth={2} /> : <Minus size={14} />}
                </span>
                <Switch
                  checked={model.hidden}
                  onCheckedChange={(hidden) => onToggleModel(model, { hidden })}
                  label={`Hide ${modelLabel(model.displayName)} from the composer`}
                />
                <Switch
                  checked={model.enabled}
                  onCheckedChange={(enabled) => onToggleModel(model, { enabled })}
                  label={`Enable ${modelLabel(model.displayName)}`}
                />
                <DropdownMenu
                  align="end"
                  trigger={
                    <BaseButton
                      type="button"
                      className="icon-button"
                      aria-label={`Actions for ${modelLabel(model.displayName)}`}
                      title={`Actions for ${modelLabel(model.displayName)}`}
                    >
                      <MoreHorizontal size={15} strokeWidth={1.75} />
                    </BaseButton>
                  }
                >
                  <MenuAction
                    icon={<Pencil size={13} strokeWidth={1.75} />}
                    onClick={() => onEditModel(model)}
                  >
                    Edit model
                  </MenuAction>
                  <MenuAction
                    icon={<Trash2 size={13} strokeWidth={1.75} />}
                    onClick={() => onDeleteModel(model)}
                  >
                    Remove from catalog
                  </MenuAction>
                </DropdownMenu>
              </div>
            ))
          )}

          <div className="model-table-footer">
            <Button size="sm" icon={<Plus size={13} strokeWidth={2} />} onClick={onAddModel}>
              Add model
            </Button>
            <Button size="sm" variant="ghost" onClick={onResetCatalog}>
              Restore built-in models
            </Button>
          </div>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
