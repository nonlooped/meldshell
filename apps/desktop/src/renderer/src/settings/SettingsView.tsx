import { useState } from "react"
import { Tabs } from "@base-ui-components/react/tabs"
import type {
  AppSnapshot,
  ProviderModel,
  SetAppSettingsInput,
  UpsertModelInput,
} from "@meldshell/contracts"
import { Settings, Palette, ArrowLeft, Boxes, Gauge, Info, MessagesSquare } from "lucide-react"
import desktopPackage from "../../../../package.json"
import { modelsForProvider } from "../data/catalog"
import { useViewStore, type SettingsSection } from "../app/view-store"
import { AppDialog, Button } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { ModelDialog } from "./ModelDialog"
import { ProviderCard } from "./ProviderCard"
import { ThreadTitleCard } from "./ThreadTitleCard"
import { SubscriptionUsage } from "./SubscriptionUsage"

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
  readonly onResetCatalog: () => void
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
    caption: "Rename providers and curate the model catalog offered to every thread.",
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
  const [resetOpen, setResetOpen] = useState(false)

  const active = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0]

  return (
    <Tabs.Root
      className="settings"
      orientation="vertical"
      value={section}
      onValueChange={(value) => {
        const next = SECTIONS.find((entry) => entry.id === value)
        if (next) selectSection(next.id)
      }}
      style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
    >
      {/*
        The nav is laid out exactly like the inbox, and Back occupies the same footer slot the
        Settings entry does, so the same click target toggles between the two views.
      */}
      <aside className="settings-nav">
        <div className="settings-nav-header">
          <h1>Settings</h1>
        </div>

        <Tabs.List className="settings-nav-items" aria-label="Settings sections">
          {SECTIONS.map((entry) => (
            <Tabs.Tab key={entry.id} value={entry.id}>
              {entry.icon}
              {entry.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <div className="settings-nav-footer">
          <Button
            variant="ghost"
            block
            icon={<ArrowLeft size={15} strokeWidth={1.75} />}
            style={{ justifyContent: "flex-start" }}
            onClick={closeSettings}
          >
            Back
          </Button>
        </div>
      </aside>

      <Tabs.Panel key={section} value={section} className="settings-body">
        <div className="settings-header">
          <div>
            <h2>{active?.title}</h2>
            <p>{active?.caption}</p>
          </div>
        </div>

        <div key={section} className="settings-scroll scrollable">
          <div className="settings-content">
            {settingsError && <p role="alert">{settingsError}</p>}
            {section === "general" || section === "appearance" ? (
              <Preferences
                section={section}
                settings={snapshot.settings}
                onChange={onChangeAppSettings}
                pending={settingsPending}
              />
            ) : section === "usage" ? (
              <div className="subscription-usage-list">
                {snapshot.providers
                  .filter((provider) =>
                    ["codex", "claude-code", "cursor"].includes(provider.harness),
                  )
                  .map((provider) => (
                    <SubscriptionUsage key={provider.id} provider={provider} />
                  ))}
              </div>
            ) : section === "threads" ? (
              <ThreadTitleCard
                snapshot={snapshot}
                pending={settingsPending}
                onChangeTitleModel={(titleModelId) => onChangeAppSettings({ titleModelId })}
              />
            ) : section === "providers" ? (
              snapshot.providers.length === 0 ? (
                <p className="settings-empty">No providers are configured.</p>
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
                    onResetCatalog={() => setResetOpen(true)}
                  />
                ))
              )
            ) : (
              <section className="about-settings">
                <div className="about-brand">
                  <MeldMark className="about-brand-mark" />
                  <div>
                    <h3>MeldShell</h3>
                    <p>A local desktop workspace for coding-agent threads.</p>
                  </div>
                </div>
                <div className="about-list">
                  <div className="about-row">
                    <span className="setting-label">App version</span>
                    <span className="about-value">{desktopPackage.version}</span>
                  </div>
                  <div className="about-row">
                    <span className="setting-label">Platform</span>
                    <span className="about-value">Windows desktop</span>
                  </div>
                  <div className="about-row">
                    <span className="setting-label">Runtime</span>
                    <span className="about-value">
                      Electron {desktopPackage.devDependencies.electron}
                    </span>
                  </div>
                  <div className="about-row">
                    <span className="setting-label">Data</span>
                    <span className="about-value">Stored locally</span>
                  </div>
                </div>
                <div className="about-shortcuts">
                  <h3>Keyboard shortcuts</h3>
                  <p>
                    <span>Search transcripts</span>
                    <kbd>Ctrl+K</kbd>
                  </p>
                  <p>
                    <span>Open thread</span>
                    <kbd>Ctrl+P</kbd>
                  </p>
                  <p>
                    <span>New thread</span>
                    <kbd>Ctrl+N</kbd>
                  </p>
                  <p>
                    <span>Settings</span>
                    <kbd>Ctrl+,</kbd>
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </Tabs.Panel>

      {modelDialog !== null && (
        <ModelDialog
          key={`${modelDialog.providerId}:${modelDialog.model?.id ?? "new"}`}
          providerId={modelDialog.providerId}
          model={modelDialog.model}
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
          pointing at it fall back to the first enabled model. Built-in models can be restored
          later.
        </p>
      </AppDialog>

      <AppDialog
        alert
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Restore the built-in models?"
        actions={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                onResetCatalog()
                setResetOpen(false)
              }}
            >
              Restore models
            </Button>
          </>
        }
      >
        <p>
          Built-in models are re-added with their original names and reasoning options. Models you
          added yourself are kept, and any edits to built-in entries are discarded.
        </p>
      </AppDialog>
    </Tabs.Root>
  )
}
