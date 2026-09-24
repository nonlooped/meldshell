import { iconButtonClasses } from "../ui/styles"
import { CollapsiblePanel, Pressable } from "../ui/motion"
import { providerStatusQuery, refreshProviderStatus } from "../data/providers"
import { Button as BaseButton } from "@base-ui-components/react/button"
import { modelLabel } from "../data/model-label"
import { Collapsible } from "@base-ui-components/react/collapsible"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import type { Provider, ProviderModel, ProviderStatus } from "@meldshell/contracts"
import { REASONING_EFFORTS } from "@meldshell/contracts"
import { ChevronDown, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { SettingRow } from "./SettingRow"
import { effortLabel } from "../data/catalog"
import { ProviderIcon } from "../ui/ProviderIcon"
import { Button, DropdownMenu, MenuAction, SelectField, Switch, TextField } from "../ui/controls"

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

type Availability = ProviderStatus["availability"]

const STATUS: Record<Availability, { readonly label: string; readonly tone: string }> = {
  probing: { label: "Connecting…", tone: "var(--text-tertiary)" },
  ready: { label: "Ready", tone: "var(--color-added)" },
  missing: { label: "Not installed", tone: "var(--color-modified)" },
  unauthenticated: { label: "Signed out", tone: "var(--color-modified)" },
  outdated: { label: "Update required", tone: "var(--color-modified)" },
  error: { label: "Error", tone: "var(--color-deleted)" },
}

const SIGN_IN_HINTS: Readonly<Record<string, string>> = {
  codex: "Run codex login in a terminal, then check again.",
  "claude-code": "Sign in to Claude Code in a terminal, then check again.",
  cursor: "Sign in with Cursor CLI, then check again.",
}

/** Problems a person has to fix outside MeldShell open the card so the next step is visible. */
const needsAttention = (availability: Availability | undefined): boolean =>
  availability !== undefined && availability !== "probing" && availability !== "ready"

function connectionDescription(harness: string, status: ProviderStatus | undefined): string {
  if (status === undefined) return "Connecting…"
  if (status.availability === "unauthenticated")
    return SIGN_IN_HINTS[harness] ?? `${status.detail} Sign in, then check again.`
  const checked = new Date(status.checkedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return status.availability === "probing" ? status.detail : `${status.detail} Checked ${checked}.`
}

const versionLabel = (version: string | null): string | null =>
  version === null ? null : /^\d/.test(version) ? `v${version}` : version

/** Contiguous effort ranges read as "Low–High"; the tooltip always lists every effort. */
function effortRange(model: ProviderModel): string {
  const efforts = REASONING_EFFORTS.filter((effort) => model.reasoningEfforts.includes(effort))
  const first = efforts[0]
  const last = efforts.at(-1)
  if (first === undefined || last === undefined) return "None"
  return first === last ? effortLabel(first) : `${effortLabel(first)}–${effortLabel(last)}`
}

type Visibility = "shown" | "hidden" | "off"

const visibilityOf = (model: ProviderModel): Visibility =>
  !model.enabled ? "off" : model.hidden ? "hidden" : "shown"

const VISIBILITY_OPTIONS: ReadonlyArray<{ readonly value: Visibility; readonly label: string }> = [
  { value: "shown", label: "Shown" },
  { value: "hidden", label: "Hidden" },
  { value: "off", label: "Off" },
]

const VISIBILITY_PATCH: Record<Visibility, { enabled: boolean; hidden: boolean }> = {
  shown: { enabled: true, hidden: false },
  hidden: { enabled: true, hidden: true },
  off: { enabled: false, hidden: false },
}

/** Long catalogs get a filter; short ones are easier to scan without it. */
const FILTER_THRESHOLD = 8

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
  const availability = status.data?.availability
  // Follows the connection until the person opens or closes the card themselves.
  const [openChoice, setOpenChoice] = useState<boolean | null>(null)
  const open = openChoice ?? needsAttention(availability)
  const [checking, setChecking] = useState(false)
  const [filter, setFilter] = useState("")

  // Commit on blur; key the input by the stored name to pick up external renames.
  const commitName = (input: HTMLInputElement): void => {
    const trimmed = input.value.trim()
    if (trimmed === "" || trimmed === provider.displayName) {
      input.value = provider.displayName
      return
    }
    onRename(trimmed)
  }

  const checkAgain = (): void => {
    setChecking(true)
    void refreshProviderStatus(provider.harness)
      .then(() => status.refetch())
      .catch(() => status.refetch())
      .finally(() => setChecking(false))
  }

  const statusInfo = STATUS[availability ?? "probing"]
  const version = versionLabel(status.data?.version ?? null)
  const shownCount = models.filter((model) => visibilityOf(model) === "shown").length
  const query = filter.trim().toLowerCase()
  const visibleModels =
    query === ""
      ? models
      : models.filter(
          (model) =>
            model.displayName.toLowerCase().includes(query) ||
            model.slug.toLowerCase().includes(query),
        )
  const busy = checking || availability === "probing"

  return (
    <Collapsible.Root
      className="settings-group m-0 border-t-[1px] border-t-[color:var(--line-subtle)] border-b-[1px] border-b-[color:var(--line-subtle)] [&_+_.settings-group]:border-t-0 provider-card"
      render={<section />}
      open={open}
      onOpenChange={setOpenChoice}
    >
      <div className="flex items-center justify-between gap-[20px] min-h-[76px] [padding:18px_0] [@container(max-width:_540px)]:flex-wrap [@container(max-width:_540px)]:gap-[12px]">
        <Collapsible.Trigger className="flex min-w-0 flex-[1_1_auto] items-center [align-self:stretch] gap-[11px] p-0 border-0 bg-transparent text-inherit cursor-default text-left [&[data-panel-open]_.provider-chevron]:[transform:rotate(180deg)] [&:hover_.setting-label]:text-[var(--accent-hover)]">
          <span
            className="grid w-[30px] h-[30px] flex-[0_0_30px] text-[var(--text-secondary)] place-items-center"
            aria-hidden="true"
          >
            <ProviderIcon provider={provider} size={18} />
          </span>
          <span className="flex min-w-0 flex-col gap-[4px]">
            <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
              {provider.displayName}
            </span>
            <span className="flex min-w-0 items-center gap-[6px] text-[var(--text-secondary)] text-[12px] leading-[1.6]">
              <span
                aria-hidden="true"
                className="w-[6px] h-[6px] flex-none rounded-[50%]"
                style={{ background: statusInfo.tone }}
              />
              <span className="flex-none">{statusInfo.label}</span>
              {/* No account email: the settings page is often on screen while streaming or sharing. */}
              {version !== null && (
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-tertiary)]">
                  · {version}
                </span>
              )}
            </span>
          </span>
          <ChevronDown
            className="motion-transform provider-chevron flex-none ml-[2px] text-[var(--text-tertiary)]"
            size={15}
            strokeWidth={1.75}
          />
        </Collapsible.Trigger>
        <Switch
          checked={provider.enabled}
          onCheckedChange={onToggleProvider}
          label={`Use ${provider.displayName}`}
        />
      </div>

      <CollapsiblePanel
        className="border-t-[1px] border-t-[color:var(--line-subtle)] [&[hidden]]:hidden"
        keepMounted
      >
        <SettingRow
          label="Connection"
          description={
            <span className="flex items-baseline gap-[6px]">
              {needsAttention(availability) && (
                <span className="flex-none font-medium" style={{ color: statusInfo.tone }}>
                  {statusInfo.label}.
                </span>
              )}
              <span>{connectionDescription(provider.harness, status.data)}</span>
            </span>
          }
        >
          <Button
            icon={<RefreshCw size={13} aria-hidden="true" />}
            disabled={busy}
            onClick={checkAgain}
          >
            {busy ? "Checking…" : "Check again"}
          </Button>
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

        <div className="border-t-[1px] border-t-[color:var(--line-subtle)]">
          <div className="flex items-center justify-between gap-[16px] [padding:18px_0_12px] [@container(max-width:_540px)]:flex-col [@container(max-width:_540px)]:items-start">
            <div className="flex min-w-0 flex-col gap-[4px]">
              <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                Models
              </span>
              <p className="m-0 text-[var(--text-secondary)] text-[12px] leading-[1.6]">
                {shownCount} of {models.length} shown in the model menu. Hidden models stay usable
                in threads that already chose them; models that are off are never used.
              </p>
            </div>
            {models.length > FILTER_THRESHOLD && (
              <div className="w-[220px] flex-[0_0_220px] [@container(max-width:_540px)]:w-[min(100%,_220px)] [@container(max-width:_540px)]:basis-auto">
                <TextField
                  type="search"
                  aria-label={`Filter ${provider.displayName} models`}
                  placeholder="Filter models"
                  value={filter}
                  onValueChange={setFilter}
                />
              </div>
            )}
          </div>

          {models.length === 0 ? (
            <p className="settings-empty m-0 [padding:28px_0] border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-tertiary)] text-[12.5px] text-center">
              This provider has no models. Add one to make it selectable in the composer.
            </p>
          ) : visibleModels.length === 0 ? (
            <p className="settings-empty m-0 [padding:28px_0] border-t-[1px] border-t-[color:var(--line-subtle)] text-[var(--text-tertiary)] text-[12.5px] text-center">
              No models match “{filter.trim()}”.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none">
              {visibleModels.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  onChangeVisibility={(visibility) =>
                    onToggleModel(model, VISIBILITY_PATCH[visibility])
                  }
                  onEdit={() => onEditModel(model)}
                  onDelete={() => onDeleteModel(model)}
                />
              ))}
            </ul>
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
      </CollapsiblePanel>
    </Collapsible.Root>
  )
}

function ModelRow({
  model,
  onChangeVisibility,
  onEdit,
  onDelete,
}: {
  readonly model: ProviderModel
  readonly onChangeVisibility: (visibility: Visibility) => void
  readonly onEdit: () => void
  readonly onDelete: () => void
}): React.JSX.Element {
  const name = modelLabel(model.displayName)
  const visibility = visibilityOf(model)
  return (
    <li className={modelRowClasses} data-off={visibility === "off"}>
      <div className="flex min-w-0 flex-col gap-[2px] [padding:10px_0]">
        <span className="flex min-w-0 items-center gap-[6px]">
          <span
            className="model-name overflow-hidden text-[var(--text-primary)] text-[12.5px] text-ellipsis whitespace-nowrap"
            title={name}
          >
            {name}
          </span>
          {model.isDefault && <Badge>Default</Badge>}
          {!model.builtIn && <Badge>Custom</Badge>}
          {model.supportsFast && <Badge>Fast</Badge>}
        </span>
        <span
          className="model-slug overflow-hidden text-[var(--text-tertiary)] [font-family:var(--font-mono)] text-[10.5px] text-ellipsis whitespace-nowrap"
          title={model.slug}
        >
          {model.slug}
        </span>
      </div>
      <span
        className="overflow-hidden text-[var(--text-secondary)] text-[11.5px] text-ellipsis whitespace-nowrap [@container(max-width:_540px)]:hidden"
        title={
          model.reasoningEfforts.length === 0
            ? "No reasoning efforts"
            : `Reasoning: ${model.reasoningEfforts.map(effortLabel).join(", ")}`
        }
      >
        {effortRange(model)}
      </span>
      <SelectField<Visibility>
        label={`Visibility of ${name}`}
        value={visibility}
        options={VISIBILITY_OPTIONS}
        onValueChange={onChangeVisibility}
      />
      <DropdownMenu
        align="end"
        trigger={
          <BaseButton
            render={<Pressable />}
            type="button"
            className={`motion-colors ${iconButtonClasses}`}
            aria-label={`Actions for ${name}`}
            title={`Actions for ${name}`}
          >
            <MoreHorizontal size={15} strokeWidth={1.75} />
          </BaseButton>
        }
      >
        <MenuAction icon={<Pencil size={13} strokeWidth={1.75} />} onClick={onEdit}>
          Edit model
        </MenuAction>
        {/* Discovery re-adds built-in models, so only custom ones can be removed for good. */}
        {!model.builtIn && (
          <MenuAction icon={<Trash2 size={13} strokeWidth={1.75} />} onClick={onDelete}>
            Remove from catalog
          </MenuAction>
        )}
      </DropdownMenu>
    </li>
  )
}

function Badge({ children }: { readonly children: string }): React.JSX.Element {
  return (
    <span className="flex-none [padding:0_5px] border-[1px] border-[color:var(--line)] rounded-[var(--radius-sm)] text-[var(--text-tertiary)] text-[10px] leading-[16px]">
      {children}
    </span>
  )
}

const modelRowClasses = [
  "grid items-center gap-[12px] grid-cols-[minmax(0,_1fr)_96px_104px_28px]",
  "min-h-[52px] border-t-[1px] border-t-[color:var(--line-subtle)]",
  "[&[data-off='true']_.model-name]:text-[var(--text-disabled)]",
  "[&[data-off='true']_.model-slug]:text-[var(--text-disabled)]",
  "[@container(max-width:_540px)]:grid-cols-[minmax(0,_1fr)_96px_28px]",
].join(" ")
