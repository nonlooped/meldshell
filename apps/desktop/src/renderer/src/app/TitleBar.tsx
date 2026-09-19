import { FileIcon } from "../ui/FileIcon"
import { useTabStore } from "./tab-store"
import { Tabs } from "@base-ui-components/react/tabs"
import { Separator } from "@base-ui-components/react/separator"
import type { Provider, Thread } from "@meldshell/contracts"
import {
  Columns2,
  Rows2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react"
import { IconButton } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"
import { threadDragProps } from "./thread-drag"
import { type ThreadLayout, visibleThreads } from "./thread-layout"

interface TitleBarProps {
  readonly openThreads: ReadonlyArray<Thread>
  readonly providersByThreadId: ReadonlyMap<string, Provider>
  readonly selectedTabId: string | null
  readonly onCloseTab: (tabId: string) => void
  readonly sidebarsVisible: boolean
  readonly inboxCollapsed: boolean
  readonly sourceControlCollapsed: boolean
  readonly onToggleInbox: () => void
  readonly onToggleSourceControl: () => void
}

function TabMark({ layout, provider }: { layout: ThreadLayout; provider: Provider | undefined }) {
  if (layout.kind === "thread") return <ProviderIcon provider={provider} size={13} />
  return layout.orientation === "horizontal" ? <Columns2 size={14} /> : <Rows2 size={14} />
}

export function TitleBar({
  openThreads,
  providersByThreadId,
  selectedTabId,
  onCloseTab,
  sidebarsVisible,
  inboxCollapsed,
  sourceControlCollapsed,
  onToggleInbox,
  onToggleSourceControl,
}: TitleBarProps): React.JSX.Element {
  const files = useTabStore((state) => state.files)
  const threadTabs = useTabStore((state) => state.threadTabs)
  return (
    <header className="titlebar">
      <MeldMark className="brand-mark" />
      {sidebarsVisible && (
        <IconButton
          className="window-interactive"
          label={inboxCollapsed ? "Expand inbox" : "Collapse inbox"}
          aria-expanded={!inboxCollapsed}
          aria-controls="inbox"
          onClick={onToggleInbox}
        >
          {inboxCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </IconButton>
      )}

      {openThreads.length > 0 && (
        <Separator className="titlebar-divider" orientation="vertical" aria-hidden="true" />
      )}

      <Tabs.List className="tab-strip" aria-label="Open tabs">
        {threadTabs.map((tab) => {
          const members = visibleThreads(tab.layout).flatMap((id) => {
            const thread = openThreads.find((candidate) => candidate.id === id)
            return thread ? [thread] : []
          })
          const thread = members.find((member) => member.id === tab.focusedThreadId) ?? members[0]
          if (!thread) return null
          const shared = tab.layout.kind === "split"
          const title = members.map((member) => member.title).join(" / ")
          const label = shared ? `Shared split: ${title}` : title
          const provider = providersByThreadId.get(thread.id)
          const providerLabel =
            provider === undefined
              ? "Unknown provider"
              : `${provider.displayName} via ${provider.harness}`

          return (
            <div
              key={tab.id}
              className="tab window-interactive"
              {...(shared ? {} : threadDragProps(thread.id))}
              {...(tab.id === selectedTabId ? { "data-selected": "" } : {})}
              {...(shared ? { "data-shared": "" } : {})}
            >
              <Tabs.Tab
                value={tab.id}
                aria-label={shared ? label : `${title}, ${providerLabel}`}
                title={
                  shared
                    ? `${label}\n${members.length} threads`
                    : `${title}\n${providerLabel}\nDrag onto a pane to move or split it`
                }
                className="tab-label"
              >
                <span className="tab-provider-mark" aria-hidden="true">
                  <TabMark layout={tab.layout} provider={provider} />
                </span>
                <span className="tab-title">{title}</span>
                {shared && (
                  <span className="tab-pane-count" aria-hidden="true">
                    {members.length}
                  </span>
                )}
              </Tabs.Tab>
              <IconButton
                unstyled
                className="tab-close"
                label={`Close ${label}`}
                onClick={() => onCloseTab(tab.id)}
              >
                <X size={12} strokeWidth={2} />
              </IconButton>
            </div>
          )
        })}
        {files.map((file) => (
          <div
            key={file.id}
            className="tab window-interactive"
            {...(file.id === selectedTabId ? { "data-selected": "" } : {})}
          >
            <Tabs.Tab
              value={file.id}
              className="tab-label"
              title={`${file.path}${file.diffSide ? ` · ${file.diffSide} changes` : ""}`}
            >
              <FileIcon path={file.path} size={14} />
              <span className="tab-title">
                {file.path.split("/").pop()}
                {file.diffSide ? ` · ${file.diffSide} changes` : ""}
              </span>
            </Tabs.Tab>
            <IconButton
              unstyled
              className="tab-close"
              label={`Close ${file.path}`}
              onClick={() => onCloseTab(file.id)}
            >
              <X size={12} />
            </IconButton>
          </div>
        ))}
      </Tabs.List>
      {sidebarsVisible && (
        <IconButton
          className="window-interactive"
          label={sourceControlCollapsed ? "Expand files and changes" : "Collapse files and changes"}
          aria-expanded={!sourceControlCollapsed}
          aria-controls="source-control"
          onClick={onToggleSourceControl}
        >
          {sourceControlCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </IconButton>
      )}
    </header>
  )
}
