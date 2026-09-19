import { FileIcon } from "../ui/FileIcon"
import { useTabStore } from "./tab-store"
import { Tabs } from "@base-ui-components/react/tabs"
import { Separator } from "@base-ui-components/react/separator"
import type { Provider, Thread } from "@meldshell/contracts"
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from "lucide-react"
import { IconButton } from "../ui/controls"
import { MeldMark } from "../ui/MeldMark"
import { ProviderIcon } from "../ui/ProviderIcon"

interface TitleBarProps {
  readonly openThreads: ReadonlyArray<Thread>
  readonly providersByThreadId: ReadonlyMap<string, Provider>
  readonly selectedThreadId: string | null
  readonly onCloseThread: (threadId: string) => void
  readonly sidebarsVisible: boolean
  readonly inboxCollapsed: boolean
  readonly sourceControlCollapsed: boolean
  readonly onToggleInbox: () => void
  readonly onToggleSourceControl: () => void
}

export function TitleBar({
  openThreads,
  providersByThreadId,
  selectedThreadId,
  onCloseThread,
  sidebarsVisible,
  inboxCollapsed,
  sourceControlCollapsed,
  onToggleInbox,
  onToggleSourceControl,
}: TitleBarProps): React.JSX.Element {
  const files = useTabStore((state) => state.files)
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
        {openThreads.map((thread) => {
          const provider = providersByThreadId.get(thread.id)
          const providerLabel =
            provider === undefined
              ? "Unknown provider"
              : `${provider.displayName} via ${provider.harness}`

          return (
            <div
              key={thread.id}
              className="tab window-interactive"
              {...(thread.id === selectedThreadId ? { "data-selected": "" } : {})}
            >
              <Tabs.Tab
                value={thread.id}
                aria-label={`${thread.title}, ${providerLabel}`}
                title={`${thread.title}\n${providerLabel}`}
                className="tab-label"
              >
                <span className="tab-provider-mark" title={providerLabel} aria-hidden="true">
                  <ProviderIcon provider={provider} size={13} />
                </span>
                <span className="tab-title">{thread.title}</span>
              </Tabs.Tab>
              <IconButton
                unstyled
                className="tab-close"
                label={`Close ${thread.title}`}
                onClick={() => onCloseThread(thread.id)}
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
            {...(file.id === selectedThreadId ? { "data-selected": "" } : {})}
          >
            <Tabs.Tab value={file.id} className="tab-label" title={file.path}>
              <FileIcon path={file.path} size={14} />
              <span className="tab-title">{file.path.split("/").pop()}</span>
            </Tabs.Tab>
            <IconButton
              unstyled
              className="tab-close"
              label={`Close ${file.path}`}
              onClick={() => onCloseThread(file.id)}
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
