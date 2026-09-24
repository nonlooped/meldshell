import { RemoteAccess } from "./RemoteAccess"
import { FadeDiv } from "../ui/motion"
import { useState } from "react"
import { Tabs } from "@base-ui-components/react/tabs"
import type {
  AppSnapshot,
  Provider,
  ProviderModel,
  SetAppSettingsInput,
  UpsertModelInput,
} from "@meldshell/contracts"
import {
  Settings,
  Palette,
  ArrowLeft,
  Boxes,
  Gauge,
  Info,
  MessagesSquare,
  Monitor,
} from "lucide-react"
import desktopPackage from "../../../../package.json"
import { modelsForProvider } from "../data/catalog"
import { useViewStore, type SettingsSection } from "../app/view-store"
import { AppDialog, Button, IconButton } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { kbdClasses } from "../ui/styles"
import { ModelDialog } from "./ModelDialog"
import { ProviderCard } from "./ProviderCard"
import { ThreadTitleCard } from "./ThreadTitleCard"
import {
  hasSubscriptionUsage,
  SubscriptionUsage,
  SubscriptionUsageRefresh,
} from "./SubscriptionUsage"
import { UpdateSettings } from "./UpdateSettings"

import { Preferences } from "./Preferences"

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
    id: "general",
    label: "General",
    icon: <Settings size={16} />,
    title: "General",
    caption: "Choose how you send messages and organize your inbox.",
  },
  {
    id: "account",
    label: "Account & devices",
    icon: <Monitor size={16} />,
    title: "Account & devices",
    caption: "Continue your work from another device.",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: <Palette size={16} />,
    title: "Appearance",
    caption: "Make MeldShell comfortable to read and use.",
  },
  {
    id: "providers",
    label: "Providers",
    icon: <Boxes size={16} strokeWidth={1.75} />,
    title: "Providers",
    caption: "Check each connection and choose which models appear in the composer.",
  },
  {
    id: "usage",
    label: "Subscription usage",
    icon: <Gauge size={16} strokeWidth={1.75} />,
    title: "Subscription usage",
    caption: "See your remaining allowances and when they reset.",
  },
  {
    id: "threads",
    label: "Threads",
    icon: <MessagesSquare size={16} strokeWidth={1.75} />,
    title: "Threads",
    caption: "Control how MeldShell names new conversations.",
  },
  {
    id: "about",
    label: "About",
    icon: <Info size={16} strokeWidth={1.75} />,
    title: "About MeldShell",
    caption: "Version, application information, and keyboard shortcuts.",
  },
]

const desktopPlatformLabel = (): string => {
  if (window.meldshell.platform === "linux") return "Linux desktop"
  return "Windows desktop"
}

export function SettingsView({
  snapshot,
  settingsPending,
  settingsError,
  sidebarWidth,
  onUpdateProvider,
  onUpsertModel,
  onDeleteModel,
  onResetCatalog,
  onChangeAppSettings,
}: SettingsViewProps): React.JSX.Element {
  const section = useViewStore((state) => state.settingsSection)
  const selectSection = useViewStore((state) => state.selectSettingsSection)
  const closeSettings = useViewStore((state) => state.closeSettings)

  const [modelDialog, setModelDialog] = useState<{
    readonly providerId: string
    readonly model: ProviderModel | null
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProviderModel | null>(null)
  const [resetTarget, setResetTarget] = useState<Provider | null>(null)

  const active = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]
  const usageProviders = snapshot.providers.filter(hasSubscriptionUsage)

  return (
    <Tabs.Root
      data-settings-layout
      className="grid h-full min-h-0 grid-cols-[212px_minmax(0,_1fr)]"
      orientation="vertical"
      value={section}
      onValueChange={(value) => {
        const next = SECTIONS.find((entry) => entry.id === value)
        if (next) selectSection(next.id)
      }}
      style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
    >
      {/* The heading doubles as the way back, so leaving sits where the eye starts; Escape also works. */}
      <aside className="grid min-h-0 grid-rows-[auto_minmax(0,_1fr)] [padding:14px_12px_10px] border-r-[1px] border-r-[color:var(--line-subtle)]">
        <div className="flex items-center gap-[6px] [padding:0_4px_14px]">
          <IconButton label="Close settings (Esc)" onClick={closeSettings}>
            <ArrowLeft size={16} strokeWidth={1.75} />
          </IconButton>
          <h1 className="m-0 [font-family:var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] leading-[22px]">
            Settings
          </h1>
        </div>

        <Tabs.List className={settingsNavItemsClasses} aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <Tabs.Tab key={entry.id} value={entry.id}>
              {entry.icon}
              {entry.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </aside>

      <Tabs.Panel
        key={section}
        value={section}
        className="[container-type:inline-size] grid min-w-0 min-h-0 grid-rows-[auto_minmax(0,_1fr)]"
      >
        <div className={settingsHeaderClasses}>
          <div>
            <h2>{active?.title}</h2>
            <p>{active?.caption}</p>
          </div>
          {section === "usage" && <SubscriptionUsageRefresh providers={usageProviders} />}
        </div>

        <div
          key={section}
          className="min-h-0 [padding:0_40px_48px] [@media(max-width:_880px)]:pr-[24px] [@media(max-width:_880px)]:pl-[24px] [@media(max-width:_680px)]:pr-[16px] [@media(max-width:_680px)]:pl-[16px] overflow-y-auto [scrollbar-gutter:stable]"
        >
          <FadeDiv className="w-[min(720px,_100%)] [margin:0_auto]">
            {settingsError && <p role="alert">{settingsError}</p>}
            {(section === "general" || section === "appearance") && (
              <Preferences
                section={section}
                settings={snapshot.settings}
                onChange={onChangeAppSettings}
                pending={settingsPending}
              />
            )}
            {section === "account" && <RemoteAccess />}
            {section === "usage" && <SubscriptionUsage providers={usageProviders} />}
            {section === "threads" && (
              <ThreadTitleCard
                snapshot={snapshot}
                pending={settingsPending}
                onChangeTitleModel={(titleModelId) => onChangeAppSettings({ titleModelId })}
              />
            )}
            {section === "providers" &&
              (snapshot.providers.length === 0 ? (
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
                      onUpsertModel({ providerId: provider.id, modelId: model.id, ...patch })
                    }
                    onEditModel={(model) => setModelDialog({ providerId: provider.id, model })}
                    onDeleteModel={setDeleteTarget}
                    onAddModel={() => setModelDialog({ providerId: provider.id, model: null })}
                    onResetCatalog={() => setResetTarget(provider)}
                  />
                ))
              ))}
            {section === "about" && (
              <section className="max-w-[720px]">
                <div className="flex items-center gap-[14px] [padding:4px_0_28px] [&_h3]:m-0 [&_h3]:[font-family:var(--font-display)] [&_h3]:text-[15px] [&_h3]:font-semibold [&_p]:[margin:3px_0_0] [&_p]:text-[var(--text-tertiary)] [&_p]:text-[11.5px]">
                  <MeldMark className="w-[36px] h-[36px] flex-[0_0_36px] text-[var(--text-primary)]" />
                  <div>
                    <h3>MeldShell</h3>
                    <p>A local desktop workspace for coding-agent threads.</p>
                  </div>
                </div>
                <div className="border-t-[1px] border-t-[color:var(--line-subtle)]">
                  <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
                    <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                      App version
                    </span>
                    <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                      {desktopPackage.version}
                    </span>
                  </div>
                  <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
                    <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                      Platform
                    </span>
                    <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                      {desktopPlatformLabel()}
                    </span>
                  </div>
                  <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
                    <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                      Runtime
                    </span>
                    <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                      Electron {desktopPackage.devDependencies.electron}
                    </span>
                  </div>
                  <div className="flex min-h-[48px] items-center justify-between gap-[40px] [padding:12px_0] border-b-[1px] border-b-[color:var(--line-subtle)]">
                    <span className="setting-label text-[var(--text-primary)] text-[13px] font-medium">
                      Data
                    </span>
                    <span className="max-w-[52%] overflow-hidden text-[var(--text-secondary)] text-[12px] text-right text-ellipsis whitespace-nowrap">
                      Stored locally
                    </span>
                  </div>
                </div>
                <UpdateSettings />
                <div className="mt-[32px] max-w-[380px] [&_h3]:text-[12px] [&_h3]:font-medium [&_h3]:text-[var(--text-secondary)] [&_p]:flex [&_p]:items-center [&_p]:justify-between [&_p]:m-0 [&_p]:[padding:8px_0] [&_p+p]:border-t-[1px] [&_p+p]:border-t-[color:var(--line-subtle)] [&_p]:text-[12px] [&_kbd]:text-[10.5px]">
                  <h3>Keyboard shortcuts</h3>
                  <p>
                    <span>Search transcripts</span>
                    <kbd className={kbdClasses}>Ctrl+K</kbd>
                  </p>
                  <p>
                    <span>Open thread</span>
                    <kbd className={kbdClasses}>Ctrl+P</kbd>
                  </p>
                  <p>
                    <span>New thread</span>
                    <kbd className={kbdClasses}>Ctrl+N</kbd>
                  </p>
                  <p>
                    <span>Settings</span>
                    <kbd className={kbdClasses}>Ctrl+,</kbd>
                  </p>
                </div>
              </section>
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

const settingsNavItemsClasses = [
  "flex min-h-0 overflow-y-auto flex-col gap-[1px] [&_button]:flex [&_button]:relative",
  "[&_button]:min-h-[36px] [&_button]:shrink-0 [&_button]:items-center [&_button]:gap-[9px]",
  "[&_button]:[padding:0_12px] [&_button]:border-0 [&_button]:rounded-[var(--radius)]",
  "[&_button]:bg-transparent [&_button]:text-[var(--text-secondary)] [&_button]:cursor-default",
  "[&_button]:text-[12.5px] [&_button]:text-left [&_button:hover]:bg-[var(--surface-hover)]",
  "[&_button:hover]:text-[var(--text-primary)] [&_button[data-selected]]:bg-[var(--surface-selected)]",
  "[&_button[data-selected]]:text-[var(--text-primary)]",
  "[&_button[data-selected]]:[box-shadow:inset_0_0_0_1px_var(--line-subtle)]",
].join(" ")

const settingsHeaderClasses = [
  "flex items-center justify-between gap-[16px] w-[min(720px,_calc(100%_-_80px))] min-h-0",
  "[padding:32px_0_24px] [margin:0_auto] [&_h2]:m-0 [&_h2]:[font-family:var(--font-display)]",
  "[&_h2]:text-[23px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_p]:[margin:6px_0_0]",
  "[&_p]:text-[var(--text-secondary)] [&_p]:text-[12.5px]",
  "[@media(max-width:_880px)]:w-[calc(100%_-_48px)]",
  "[@media(max-width:_680px)]:w-[calc(100%_-_32px)] [@media(max-width:_680px)]:pt-[24px]",
].join(" ")
