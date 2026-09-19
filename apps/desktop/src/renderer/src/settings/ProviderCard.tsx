import { iconButtonClasses } from "../ui/styles"
import { Pressable } from "../ui/motion"
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
    <Collapsible.Root
      className="settings-group m-0 border-t-[1px] border-t-[color:var(--line-subtle)] border-b-[1px] border-b-[color:var(--line-subtle)] [&_+_.settings-group]:border-t-0 provider-card"
      render={<section />}
    >
      <div className="flex items-center justify-between gap-[20px] min-h-[80px] [padding:20px_0] [@container(max-width:_540px)]:flex-wrap [@container(max-width:_540px)]:gap-[12px]">
        <Collapsible.Trigger className="flex min-w-0 flex-[1_1_auto] items-center [align-self:stretch] gap-[11px] p-0 border-0 bg-transparent text-inherit cursor-default text-left [&[data-panel-open]_.provider-chevron]:[transform:rotate(180deg)] [&:hover_.setting-label]:text-[var(--accent-hover)]">
          <span
            className="grid w-[30px] h-[30px] flex-[0_0_30px] text-[var(--text-secondary)] place-items-center"
            aria-hidden="true"
          >
            <ProviderIcon provider={provider} size={18} />
          </span>
          <span className="flex min-w-0 items-center gap-[0] [&_.provider-sub]:[margin:4px_0_0] [&_.provider-sub]:text-[var(--text-secondary)] [&_.provider-sub]:text-[12px] [&_.provider-sub]:leading-[1.6]">
            <div>
              <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                {provider.displayName}
              </span>
              <p className="provider-sub">
                {provider.harness} · {models.length} {models.length === 1 ? "model" : "models"}
              </p>
            </div>
          </span>
          <ChevronDown
            data-motion="transform"
            className="provider-chevron flex-none ml-[2px] text-[var(--text-tertiary)]"
            size={15}
            strokeWidth={1.75}
          />
        </Collapsible.Trigger>
        <label className="flex items-center gap-[10px] text-[var(--text-secondary)] text-[11.5px] whitespace-nowrap">
          <span>{provider.enabled ? "Enabled" : "Disabled"}</span>
          <Switch
            checked={provider.enabled}
            onCheckedChange={onToggleProvider}
            label={`Enable ${provider.displayName}`}
          />
        </label>
      </div>

      <Collapsible.Panel
        className="border-t-[1px] border-t-[color:var(--line-subtle)] [&[hidden]]:hidden [@container(max-width:_700px)]:pl-[0] [@media(max-width:_880px)]:pl-[0]"
        keepMounted
      >
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

        <div className="overflow-x-auto border-t-[1px] border-t-[color:var(--line-subtle)]">
          <div className="flex h-[42px] items-center justify-between text-[var(--text-primary)] text-[12px] font-semibold [&_span:last-child]:text-[var(--text-tertiary)] [&_span:last-child]:text-[10.5px] [&_span:last-child]:font-normal">
            <span>Models</span>
            <span>{models.length} in catalog</span>
          </div>
          <div className={modelTableHeaderClasses}>
            <span>Model</span>
            <span>Reasoning</span>
            <span>Fast</span>
            <span>Hidden</span>
            <span>Enabled</span>
            <span />
          </div>

          {models.length === 0 ? (
            <p className="settings-empty [padding:28px_0] text-[var(--text-tertiary)] text-[12.5px] text-center">
              This provider has no models. Add one to make it selectable in the composer.
            </p>
          ) : (
            models.map((model) => (
              <div key={model.id} className={modelRowClasses} data-disabled={!model.enabled}>
                <div className="flex min-w-0 flex-col gap-[2px] [padding:8px_0]">
                  <span
                    className="model-name overflow-hidden text-[var(--text-primary)] text-[12.5px] text-ellipsis whitespace-nowrap"
                    title={modelLabel(model.displayName)}
                  >
                    {modelLabel(model.displayName)}
                  </span>
                </div>
                <span className="text-[var(--text-tertiary)] text-[11px]">
                  {effortSummary(model)}
                </span>
                <span
                  className="text-[var(--text-secondary)] [&[data-off='true']]:text-[var(--line-strong)]"
                  data-off={!model.supportsFast}
                >
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
                      data-motion="background-color border-color color opacity"
                      render={<Pressable />}
                      type="button"
                      className={iconButtonClasses}
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

          <div className="flex items-center justify-between gap-[12px] min-h-[54px] [padding:12px_0] border-t-[1px] border-t-[color:var(--line-subtle)]">
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

const modelTableHeaderClasses = [
  "grid items-center gap-[12px] min-w-[440px] grid-cols-[minmax(100px,_1fr)_188px_56px_52px_56px_28px]",
  "p-0 h-[30px] border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-tertiary)] text-[11px]",
  "font-semibold [&_span:not(:first-child)]:[justify-self:center] [&_span:not(:first-child)]:text-center",
  "[@container(max-width:_700px)]:grid-cols-[minmax(100px,_1fr)_86px_32px_40px_44px_28px]",
  "[@container(max-width:_700px)]:gap-[8px]",
].join(" ")

const modelRowClasses = [
  "grid items-center gap-[12px] min-w-[440px] grid-cols-[minmax(100px,_1fr)_188px_56px_52px_56px_28px]",
  "p-0 min-h-[48px] border-t-[1px] border-t-[color:var(--line-subtle)]",
  "[&_>_*:not(:first-child):not(:last-child)]:[justify-self:center]",
  "[&_>_*:not(:first-child):not(:last-child)]:text-center [&:hover]:bg-[var(--surface-hover)]",
  "[&:focus-within]:bg-[var(--surface-hover)]",
  "[&[data-disabled='true']_.model-name]:text-[var(--text-disabled)]",
  "[&[data-disabled='true']_.model-slug]:text-[var(--text-disabled)]",
  "[@container(max-width:_700px)]:grid-cols-[minmax(100px,_1fr)_86px_32px_40px_44px_28px]",
  "[@container(max-width:_700px)]:gap-[8px]",
].join(" ")
