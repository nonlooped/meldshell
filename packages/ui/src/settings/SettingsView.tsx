import { RemoteAccess } from "./RemoteAccess"
import { FadeDiv, TabIndicator } from "../ui/motion"
import { useState, useLayoutEffect, useRef } from "react"
import { Tabs } from "@base-ui-components/react/tabs"
import { Toggle } from "@base-ui-components/react/toggle"
import { ToggleGroup } from "@base-ui-components/react/toggle-group"
import type {
  AppSnapshot,
  Provider,
  ProviderModel,
  SetAppSettingsInput,
  UpsertModelInput,
} from "@meldshell/contracts"
import { Palette, ArrowLeft, Boxes, Info, Keyboard, MessagesSquare, Monitor } from "lucide-react"
import { modelsForProvider } from "../data/catalog"
import { useViewStore, type SettingsSection } from "../app/view-store"
import { AppDialog, Button, IconButton, TextField } from "../ui/controls"
import { cx, segmentClasses, segmentGroupClasses } from "../ui/styles"
import { useViewportTier, type ViewportTier } from "../app/viewport"
import { ModelDialog } from "./ModelDialog"
import { ProviderCard } from "./ProviderCard"
import { ThreadTitleCard } from "./ThreadTitleCard"
import {
  hasSubscriptionUsage,
  SubscriptionUsage,
  SubscriptionUsageRefresh,
} from "./SubscriptionUsage"
import { AppSettingsPanel } from "./AppSettingsPanel"
import { SettingsGroup } from "./SettingsGroup"
import { searchSettings, type SettingsSearchEntry } from "./settings-search"

import { KeyboardSettings } from "./KeyboardSettings"
import { Preferences } from "./Preferences"
import { DictationSettings } from "./DictationSettings"

interface SettingsViewProps {
  readonly settingsPending: boolean
  readonly settingsError: string | null
  readonly snapshot: AppSnapshot
  readonly sidebarWidth: number
  readonly onUpdateProvider: (
    providerId: string,
    patch: { displayName?: string; enabled?: boolean },
  ) => void
  readonly onUpsertModel: (input: UpsertModelInput) => void
  readonly onDeleteModel: (modelId: string) => void
  readonly onResetCatalog: (providerId: string) => void
  readonly onChangeAppSettings: (input: SetAppSettingsInput) => void
}

const SECTIONS: ReadonlyArray<{
  readonly id: SettingsSection
  readonly label: string
  readonly icon: React.JSX.Element
  readonly title: string
  readonly caption: string
}> = [
  {
    id: "threads",
    label: "Threads & agents",
    icon: <MessagesSquare size={16} />,
    title: "Threads & agents",
    caption: "Choose how conversations run, appear, and request your attention.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: <Palette size={16} />,
    title: "Appearance",
    caption: "Make MeldShell comfortable to read and use.",
  },
  {
    id: "keyboard",
    label: "Keyboard & dictation",
    icon: <Keyboard size={16} />,
    title: "Keyboard & dictation",
    caption: "Customize shortcuts and speech input.",
  },
  {
    id: "providers",
    label: "Providers & models",
    icon: <Boxes size={16} />,
    title: "Providers & models",
    caption: "Configure your agents and model catalogs, and check subscription usage.",
  },
  {
    id: "account",
    label: "Account & devices",
    icon: <Monitor size={16} />,
    title: "Account & devices",
    caption: "Manage your MeldShell account and continue from another device.",
  },
  {
    id: "app",
    label: "App & updates",
    icon: <Info size={16} />,
    title: "App & updates",
    caption: "Manage the runtime, external applications, setup, and MeldShell updates.",
  },
]

const settingsColumns = (tier: ViewportTier, sidebarWidth: number) => {
  if (tier === "phone") return "minmax(0, 1fr)"
  return `${tier === "compact" ? Math.min(sidebarWidth, 208) : sidebarWidth}px minmax(0, 1fr)`
}

/** The way back and the section list: a column beside the content, or a scrolling bar above it. */
function SettingsSidebar({
  stacked,
  onClose,
}: {
  stacked: boolean
  onClose: () => void
}): React.JSX.Element {
  return (
    <aside
      className={
        stacked
          ? "grid min-w-0 grid-cols-[auto_minmax(0,_1fr)] items-center gap-[4px] [padding:6px_8px] border-b-[1px] border-b-[color:var(--line-subtle)]"
          : "grid min-h-0 grid-rows-[auto_minmax(0,_1fr)] [padding:14px_12px_10px] border-r-[1px] border-r-[color:var(--line-subtle)]"
      }
    >
      <div className={`flex items-center gap-[6px] ${stacked ? "" : "[padding:0_4px_14px]"}`}>
        <IconButton label="Close settings (Esc)" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.75} />
        </IconButton>
        <h1
          className={`m-0 [font-family:var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] leading-[22px] ${stacked ? "sr-only" : ""}`}
        >
          Settings
        </h1>
      </div>

      <Tabs.List
        className={cx(
          settingsNavItemsClasses,
          stacked && "flex-row! overflow-x-auto overflow-y-hidden [scrollbar-width:none]",
        )}
        aria-label="Settings sections"
      >
        <TabIndicator className="rounded-[var(--radius)] bg-[var(--surface-selected)] [box-shadow:inset_0_0_0_1px_var(--line-subtle)]" />
        {SECTIONS.map((entry) => (
          <Tabs.Tab key={entry.id} value={entry.id}>
            {entry.icon}
            {entry.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </aside>
  )
}

export function SettingsView(props: SettingsViewProps): React.JSX.Element {
  const { snapshot, settingsError, sidebarWidth, onUpsertModel, onDeleteModel, onResetCatalog } =
    props

  const section = useViewStore((state) => state.settingsSection)
  const selectSection = useViewStore((state) => state.selectSettingsSection)
  const closeSettings = useViewStore((state) => state.closeSettings)
  const subsection = useViewStore((state) => state.settingsSubsection)
  const [query, setQuery] = useState("")
  const [searchTarget, setSearchTarget] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const searching = query.trim().length > 0
  const results = searchSettings(query, snapshot.providers, {
    editor: window.meldshell.desktop?.listEditors !== undefined,
    environment: window.meldshell.desktop?.environment !== undefined,
    hostControl: window.meldshell.hostControl !== undefined,
  })
  const usage = section === "providers" && subsection === "usage"

  useLayoutEffect(() => {
    if (searching || !searchTarget) return
    const content = contentRef.current
    const focusTarget = () => {
      const target = Array.from(
        content?.querySelectorAll<HTMLElement>("[data-setting-label]") ?? [],
      ).find((element) => element.dataset.settingLabel === searchTarget)
      if (!target) return false
      target.scrollIntoView({ block: "center", behavior: "instant" })
      target.focus({ preventScroll: true })
      return true
    }
    if (focusTarget() || !content) return
    content.focus({ preventScroll: true })
    const observer = new MutationObserver(() => {
      if (focusTarget()) observer.disconnect()
    })
    observer.observe(content, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [searchTarget, searching])

  const openResult = (entry: SettingsSearchEntry) => {
    selectSection(entry.section, entry.subsection)
    setQuery("")
    setSearchTarget(entry.target ?? entry.label)
  }

  const [modelDialog, setModelDialog] = useState<{
    readonly providerId: string
    readonly model: ProviderModel | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderModel | null>(null)
  const [resetTarget, setResetTarget] = useState<Provider | null>(null)

  const tier = useViewportTier()
  const stacked = tier === "phone"
  const active = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]
  const usageProviders = snapshot.providers.filter(hasSubscriptionUsage)

  return (
    <Tabs.Root
      data-settings-layout
      className={`grid h-full min-h-0 ${stacked ? "grid-rows-[auto_minmax(0,_1fr)]" : ""}`}
      orientation={stacked ? "horizontal" : "vertical"}
      value={section}
      onValueChange={(value) => {
        const next = SECTIONS.find((entry) => entry.id === value)
        if (next) {
          selectSection(next.id)
          setQuery("")
          setSearchTarget(null)
        }
      }}
      style={{ gridTemplateColumns: settingsColumns(tier, sidebarWidth) }}
    >
      {/* The heading doubles as the way back, so leaving sits where the eye starts; Escape also works. */}
      <SettingsSidebar stacked={stacked} onClose={closeSettings} />

      <Tabs.Panel
        value={section}
        className="[container-type:inline-size] grid min-w-0 min-h-0 grid-rows-[auto_auto_minmax(0,_1fr)]"
      >
        <div className={settingsHeaderClasses}>
          <div>
            <h2>{searching ? "Search settings" : active?.title}</h2>
            <p>{searching ? "Find a preference and open its location." : active?.caption}</p>
          </div>
          {usage && !searching && <SubscriptionUsageRefresh providers={usageProviders} />}
        </div>

        <div className="w-[min(720px,_calc(100%_-_80px))] mx-auto mb-[20px] [@container(max-width:_640px)]:w-[calc(100%_-_48px)] [@container(max-width:_460px)]:w-[calc(100%_-_32px)]">
          <TextField
            type="search"
            aria-label="Search settings"
            placeholder="Search settings…"
            value={query}
            onValueChange={setQuery}
          />
        </div>

        <div
          key={section}
          ref={contentRef}
          tabIndex={-1}
          className="min-h-0 [padding:0_40px_48px] [@container(max-width:_640px)]:pr-[24px] [@container(max-width:_640px)]:pl-[24px] [@container(max-width:_460px)]:pr-[16px] [@container(max-width:_460px)]:pl-[16px] overflow-y-auto [scrollbar-gutter:stable]"
        >
          <FadeDiv rise={8} className="w-[min(720px,_100%)] [margin:0_auto]">
            {settingsError && <p role="alert">{settingsError}</p>}
            {searching ? (
              <div aria-label="Settings search results">
                <p role="status" className="text-[12px] text-[var(--text-secondary)]">
                  {results.length
                    ? `${results.length} matching settings`
                    : "No settings match. Try another term."}
                </p>
                {results.map((entry) => (
                  <Button
                    key={`${entry.section}:${entry.label}`}
                    variant="ghost"
                    block
                    className="justify-between! min-h-[44px]!"
                    onClick={() => openResult(entry)}
                  >
                    <span>{entry.label}</span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      {SECTIONS.find((item) => item.id === entry.section)?.label}
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <SettingsContent
                {...props}
                onEditModel={(providerId, model) => setModelDialog({ providerId, model })}
                onRemoveModel={setDeleteTarget}
                onRestoreCatalog={setResetTarget}
                onClearSearchTarget={() => setSearchTarget(null)}
              />
            )}
          </FadeDiv>
        </div>
      </Tabs.Panel>

      {modelDialog !== null && (
        <ModelDialog
          key={`${modelDialog.providerId}:${modelDialog.model?.id ?? "new"}`}
          providerId={modelDialog.providerId}
          model={modelDialog.model}
          siblings={modelsForProvider(snapshot, modelDialog.providerId)}
          onClose={() => setModelDialog(null)}
          onSubmit={onUpsertModel}
        />
      )}

      <AppDialog
        alert
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Remove this model from the catalog?"
        actions={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (deleteTarget !== null) onDeleteModel(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Remove model
            </Button>
          </>
        }
      >
        <p>
          “{deleteTarget?.displayName}” will no longer be offered in the composer. Threads already
          using it switch to another available model. You can add it again later.
        </p>
      </AppDialog>

      <AppDialog
        alert
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        title={`Restore the built-in ${resetTarget?.displayName ?? ""} models?`}
        actions={
          <>
            <Button onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (resetTarget !== null) onResetCatalog(resetTarget.id)
                setResetTarget(null)
              }}
            >
              Restore models
            </Button>
          </>
        }
      >
        <p>
          Built-in models get their original names, reasoning options, and visibility back. Models
          you added yourself are kept. Other providers are not affected.
        </p>
      </AppDialog>
    </Tabs.Root>
  )
}

interface SettingsContentProps extends SettingsViewProps {
  readonly onEditModel: (providerId: string, model: ProviderModel | null) => void
  readonly onRemoveModel: (model: ProviderModel) => void
  readonly onRestoreCatalog: (provider: Provider) => void
  readonly onClearSearchTarget: () => void
}

function SettingsContent({
  snapshot,
  settingsPending,
  onChangeAppSettings,
  onUpdateProvider,
  onUpsertModel,
  onEditModel,
  onRemoveModel,
  onRestoreCatalog,
  onClearSearchTarget,
}: SettingsContentProps): React.JSX.Element {
  const section = useViewStore((state) => state.settingsSection)
  const subsection = useViewStore((state) => state.settingsSubsection)
  const selectSection = useViewStore((state) => state.selectSettingsSection)
  const dictation = subsection === "dictation"
  const usage = subsection === "usage"
  const usageProviders = snapshot.providers.filter(hasSubscriptionUsage)
  switch (section) {
    case "appearance":
      return (
        <Preferences
          section="appearance"
          settings={snapshot.settings}
          onChange={onChangeAppSettings}
          pending={settingsPending}
        />
      )
    case "account":
      return (
        <SettingsGroup title="Account & devices">
          <RemoteAccess />
        </SettingsGroup>
      )
    case "keyboard":
      return (
        <>
          <SubsectionNav
            label="Input settings"
            value={dictation ? "dictation" : "shortcuts"}
            options={[
              { value: "shortcuts", label: "Keyboard shortcuts" },
              { value: "dictation", label: "Dictation" },
            ]}
            onChange={(value) => {
              selectSection("keyboard", value === "dictation" ? "dictation" : "shortcuts")
              onClearSearchTarget()
            }}
          />
          {dictation ? (
            <SettingsGroup title="Dictation">
              <DictationSettings
                settings={snapshot.settings}
                pending={settingsPending}
                onChange={onChangeAppSettings}
              />
            </SettingsGroup>
          ) : (
            <SettingsGroup title="Keyboard shortcuts">
              <KeyboardSettings pending={settingsPending} onChange={onChangeAppSettings} />
            </SettingsGroup>
          )}
        </>
      )
    case "threads":
      return (
        <>
          <Preferences
            section="threads"
            settings={snapshot.settings}
            onChange={onChangeAppSettings}
            pending={settingsPending}
          />
          <SettingsGroup title="Thread titles">
            <ThreadTitleCard
              snapshot={snapshot}
              pending={settingsPending}
              onChangeTitleModel={(titleModelId) => onChangeAppSettings({ titleModelId })}
            />
          </SettingsGroup>
        </>
      )
    case "app":
      return (
        <AppSettingsPanel
          settings={snapshot.settings}
          pending={settingsPending}
          onChange={onChangeAppSettings}
        />
      )
    case "providers":
      return (
        <>
          <SubsectionNav
            label="Provider settings"
            value={usage ? "usage" : "configuration"}
            options={[
              { value: "configuration", label: "Configuration" },
              { value: "usage", label: "Subscription usage" },
            ]}
            onChange={(value) => {
              selectSection("providers", value === "usage" ? "usage" : "configuration")
              onClearSearchTarget()
            }}
          />
          {usage ? (
            <SettingsGroup title="Subscription usage">
              <SubscriptionUsage providers={usageProviders} />
            </SettingsGroup>
          ) : (
            <SettingsGroup title="Configuration">
              {snapshot.providers.length === 0 ? (
                <p className="settings-empty [padding:28px_0] text-[var(--text-tertiary)] text-[12.5px] text-center">
                  No providers are configured.
                </p>
              ) : (
                snapshot.providers.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    provider={provider}
                    models={modelsForProvider(snapshot, provider.id)}
                    onRename={(displayName) => onUpdateProvider(provider.id, { displayName })}
                    onToggleProvider={(enabled) => onUpdateProvider(provider.id, { enabled })}
                    onToggleModel={(model, patch) =>
                      onUpsertModel({
                        providerId: provider.id,
                        modelId: model.id,
                        ...patch,
                      })
                    }
                    onEditModel={(model) => onEditModel(provider.id, model)}
                    onDeleteModel={onRemoveModel}
                    onAddModel={() => onEditModel(provider.id, null)}
                    onResetCatalog={() => onRestoreCatalog(provider)}
                  />
                ))
              )}
            </SettingsGroup>
          )}
        </>
      )
  }
}

function SubsectionNav({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly options: readonly { readonly value: string; readonly label: string }[]
  readonly onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      className={cx(segmentGroupClasses, "mb-[24px] flex-wrap")}
      onValueChange={(next) => {
        if (next[0]) onChange(next[0])
      }}
    >
      {options.map((option) => (
        <Toggle key={option.value} value={option.value} className={segmentClasses}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

const settingsNavItemsClasses = [
  "relative flex min-h-0 overflow-y-auto flex-col gap-[1px] [&_button]:flex [&_button]:relative",
  "[&_button]:min-h-[36px] [&_button]:shrink-0 [&_button]:items-center [&_button]:gap-[9px]",
  "[&_button]:[padding:0_12px] [&_button]:border-0 [&_button]:rounded-[var(--radius)]",
  "[&_button]:bg-transparent [&_button]:text-[var(--text-secondary)] [&_button]:cursor-default",
  "[&_button]:text-[12.5px] [&_button]:text-left [&_button:hover]:bg-[var(--surface-hover)]",
  "[&_button:hover]:text-[var(--text-primary)] [&_button[data-active]]:text-[var(--text-primary)]",
  "[&_button]:z-[1] [&_button[data-active]:hover]:bg-transparent",
].join(" ")

const settingsHeaderClasses = [
  "flex items-center justify-between gap-[16px] w-[min(720px,_calc(100%_-_80px))] min-h-0",
  "[padding:32px_0_24px] [margin:0_auto] [&_h2]:m-0 [&_h2]:[font-family:var(--font-display)]",
  "[&_h2]:text-[23px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_p]:[margin:6px_0_0]",
  "[&_p]:text-[var(--text-secondary)] [&_p]:text-[12.5px]",
  "[@container(max-width:_640px)]:w-[calc(100%_-_48px)]",
  "[@container(max-width:_460px)]:w-[calc(100%_-_32px)] [@container(max-width:_460px)]:pt-[24px]",
].join(" ")
