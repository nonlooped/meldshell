import { chipClasses, kbdClasses } from "../ui/styles"
import { FadeDiv, PopPresence, Pressable, Swap } from "../ui/motion"
import { useLayoutEffect, useRef, useState } from "react"
import { Notice } from "../ui/Notice"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { ComposerAttachment } from "@meldshell/contracts/ipc"
import type {
  AppSnapshot,
  ReasoningEffort,
  SandboxMode,
  SetThreadSettingsInput,
} from "@meldshell/contracts"
import {
  ChevronDown,
  Eye,
  ImageIcon,
  FolderPen,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  X,
  ArrowUp,
  ListPlus,
  Square,
} from "lucide-react"
import { effortLabel, resolveSelection, selectableModels } from "../data/catalog"
import { FileIcon } from "../ui/FileIcon"
import { ModelPicker } from "./ModelPicker"
import {
  Button,
  IconButton,
  DropdownMenu,
  MenuChoice,
  MenuGroup,
  MenuRadioGroup,
  MenuSeparator,
} from "../ui/controls"

interface ComposerProps {
  readonly snapshot: AppSnapshot
  readonly threadId: string
  readonly draft: string
  readonly onDraftChange: (draft: string) => void
  readonly providerReady: boolean
  readonly providerDetail: string
  readonly onRecheckProvider: () => void
  readonly onChangeSettings: (input: SetThreadSettingsInput) => void
  readonly onSend: () => void
  readonly onInterrupt: () => void
  readonly running: boolean
  readonly interrupting: boolean
  readonly queuedCount: number
  readonly sending: boolean
  readonly attachments: ReadonlyArray<ComposerAttachment>
  readonly onAddAttachments: (attachments: ReadonlyArray<ComposerAttachment>) => void
  readonly onRemoveAttachment: (index: number) => void
}

const SPEED_LABEL = { standard: "Standard", fast: "Fast" } as const
const SANDBOX_LABEL: Readonly<Record<SandboxMode, string>> = {
  "read-only": "Read only",
  "workspace-write": "Workspace write",
  "danger-full-access": "Full access",
}

const LevelIcon = ({ index, count }: { index: number; count: number }): React.JSX.Element => {
  const activeBars = count <= 1 ? 2 : 1 + Math.round((index / (count - 1)) * 3)
  return (
    <span
      className={
        "flex w-[14px] h-[14px] items-end justify-center gap-[1px] [&_>_span]:w-[2px] [&_>_span]:rounded-[1px] [&_>_span]:[background:currentColor] [&_>_span]:opacity-[0.22] [&_>_span:nth-child(1)]:h-[4px] [&_>_span:nth-child(2)]:h-[7px] [&_>_span:nth-child(3)]:h-[10px] [&_>_span:nth-child(4)]:h-[13px] [&_>_span[data-active='true']]:opacity-[0.9]"
      }
      aria-hidden="true"
    >
      {[0, 1, 2, 3].map((bar) => (
        <span key={bar} data-active={bar < activeBars} />
      ))}
    </span>
  )
}

const SandboxIcon = ({ mode }: { mode: SandboxMode }): React.JSX.Element => {
  if (mode === "read-only") return <Eye size={14} strokeWidth={1.7} />
  if (mode === "workspace-write") return <FolderPen size={14} strokeWidth={1.7} />
  return <ShieldCheck size={14} strokeWidth={1.7} />
}

const SpeedIcon = ({ speed }: { speed: keyof typeof SPEED_LABEL }): React.JSX.Element => (
  <svg
    className="flex-none [stroke:currentColor] stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]"
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path d="M2.25 11.75a5.9 5.9 0 0 1 11.5 0" />
    <path d={speed === "fast" ? "M8 10.75 11.35 6.4" : "M8 10.75 6.25 7.55"} />
    <circle cx="8" cy="10.75" r="0.8" fill="currentColor" stroke="none" />
  </svg>
)

function ComposerAttachments({
  attachments,
  onRemoveAttachment,
}: Pick<ComposerProps, "attachments" | "onRemoveAttachment">): React.JSX.Element | null {
  if (attachments.length === 0) return null
  return (
    <div
      className="flex gap-[8px] overflow-x-auto p-[8px] border-b-[1px] border-b-[color:var(--line-subtle)]"
      aria-label="Turn attachments"
    >
      {attachments.map((attachment, index) => (
        <FadeDiv duration={0.2} className={attachmentChipClasses} key={index}>
          <span
            className="grid w-[48px] h-[48px] flex-[0_0_48px] overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-active)] place-items-center [&_img]:w-full [&_img]:h-full [&_img]:object-contain"
            aria-hidden="true"
          >
            {attachment.previewUrl || attachment.type === "image" ? (
              <img src={attachment.previewUrl ?? attachment.value} alt="" />
            ) : attachment.type === "localImage" ? (
              <ImageIcon size={22} />
            ) : (
              <FileIcon path={attachment.name ?? attachment.value} size={22} />
            )}
          </span>
          <span className="flex flex-1 min-w-0 flex-col gap-[3px]">
            <span
              className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
              title={attachment.name ?? attachment.value}
            >
              {attachment.name ?? (attachment.type === "image" ? "Pasted image" : attachment.value)}
            </span>
            <span className="text-[var(--text-tertiary)] text-[11px]">
              {attachment.type === "image" || attachment.type === "localImage"
                ? "Image"
                : attachment.type === "skill"
                  ? "Skill"
                  : "File"}
            </span>
          </span>
          <IconButton
            unstyled
            label={`Remove ${attachment.name ?? "attachment"}`}
            onClick={() => onRemoveAttachment(index)}
          >
            <X size={11} />
          </IconButton>
        </FadeDiv>
      ))}
    </div>
  )
}

function sendTitle({
  sending,
  providerReady,
  providerName,
  hasSelection,
  loadingAttachments,
  hasContent,
  running,
  sendShortcutLabel,
}: {
  sending: boolean
  providerReady: boolean
  providerName: string
  hasSelection: boolean
  loadingAttachments: boolean
  hasContent: boolean
  running: boolean
  sendShortcutLabel: string
}): string {
  if (sending) return "Sending message…"
  if (!providerReady) return `${providerName} is unavailable`
  if (!hasSelection) return "Enable a model in Settings"
  if (loadingAttachments) return "Adding attachments…"
  if (!hasContent) return "Write a message or attach a file"
  if (running) return `Queue for the next turn (${sendShortcutLabel})`
  return `Send to ${providerName} (${sendShortcutLabel})`
}

function ReasoningSettings({
  selection,
  threadId,
  onChangeSettings,
}: Pick<ComposerProps, "threadId" | "onChangeSettings"> & {
  selection: ModelSelection
}): React.JSX.Element | null {
  const isClaude = selection.provider.harness === "claude-code"
  const efforts = selection.model.reasoningEfforts
  const supportsFast = selection.model.supportsFast
  const fastTier = selection.model.serviceTiers.find(
    (tier) => tier.id === selection.model.fastServiceTier,
  )
  const selectedEffortIndex = Math.max(
    0,
    efforts.findIndex((effort) => effort === selection.reasoningEffort),
  )

  if (efforts.length === 0 && !supportsFast) return null
  return (
    <DropdownMenu
      trigger={
        <BaseButton
          data-motion="background-color border-color color opacity"
          render={<Pressable />}
          type="button"
          className={chipClasses}
          aria-label="Change reasoning effort and speed"
        >
          <span
            className={
              "flex h-[14px] items-center gap-[3px] text-[var(--text-tertiary)] [&_>_svg]:flex-none"
            }
          >
            {efforts.length > 0 && <LevelIcon index={selectedEffortIndex} count={efforts.length} />}
            {supportsFast && <SpeedIcon speed={selection.speed} />}
          </span>
          <span className="overflow-hidden text-ellipsis">
            {selection.reasoningEffort === null
              ? "Reasoning"
              : effortLabel(selection.reasoningEffort)}
            {supportsFast && ` · ${SPEED_LABEL[selection.speed]}`}
          </span>
          <ChevronDown
            size={13}
            strokeWidth={1.75}
            className="flex-none text-[var(--text-tertiary)]"
          />
        </BaseButton>
      }
    >
      {efforts.length > 0 && (
        <MenuRadioGroup
          value={selection.reasoningEffort ?? ""}
          onValueChange={(value) =>
            onChangeSettings({
              threadId,
              reasoningEffort: String(value) as ReasoningEffort,
            })
          }
        >
          <MenuGroup label="Reasoning effort">
            {efforts.map((effort, index) => (
              <MenuChoice key={effort} value={effort}>
                {effortLabel(effort)}
                <span className="grid w-[14px] h-[14px] flex-[0_0_14px] ml-[auto] text-[var(--text-secondary)] place-items-center">
                  <LevelIcon index={index} count={efforts.length} />
                </span>
              </MenuChoice>
            ))}
          </MenuGroup>
        </MenuRadioGroup>
      )}

      {efforts.length > 0 && supportsFast && <MenuSeparator />}

      {supportsFast && (
        <MenuRadioGroup
          value={selection.speed}
          onValueChange={(value) =>
            onChangeSettings({
              threadId,
              speed: String(value) as keyof typeof SPEED_LABEL,
            })
          }
        >
          <MenuGroup label="Speed">
            {isClaude && (
              <p className="[margin:8px_12px] text-[11px] text-[var(--text-secondary)]">
                Fast uses paid usage credits.
              </p>
            )}
            {[SPEED_LABEL.standard, fastTier?.name ?? SPEED_LABEL.fast].map((label, index) => (
              <MenuChoice
                key={index === 0 ? "standard" : "fast"}
                value={index === 0 ? "standard" : "fast"}
              >
                {label}
                <span className="grid w-[14px] h-[14px] flex-[0_0_14px] ml-[auto] text-[var(--text-secondary)] place-items-center">
                  <SpeedIcon speed={index === 0 ? "standard" : "fast"} />
                </span>
              </MenuChoice>
            ))}
          </MenuGroup>
        </MenuRadioGroup>
      )}
    </DropdownMenu>
  )
}

type ModelSelection = NonNullable<ReturnType<typeof resolveSelection>>

function ComposerSettings({
  snapshot,
  threadId,
  selection,
  onChangeSettings,
}: Pick<ComposerProps, "snapshot" | "threadId" | "onChangeSettings"> & {
  selection: ModelSelection | null
}): React.JSX.Element {
  if (selection === null)
    return (
      <span className="text-[var(--text-tertiary)] text-[10.5px] tabular-nums whitespace-nowrap">
        No model is enabled. Add one in Settings.
      </span>
    )
  const isClaude = selection.provider.harness === "claude-code"
  const isCursor = selection.provider.harness === "cursor"
  const toolPermissions = isClaude || isCursor
  const permissionLabels = isClaude
    ? { ask: "Manual", deny: "Don’t ask", full: "Bypass permissions" }
    : { ask: "Ask Every Time", deny: "Deny requests (custom)", full: "Run Everything" }
  const options: Array<{
    id: string
    label: string
    sandbox: SandboxMode
    approvalPolicy: "on-request" | "never"
  }> = toolPermissions
    ? [
        ...(isClaude
          ? [
              {
                id: "read",
                label: "Read tools only (custom)",
                sandbox: "read-only" as const,
                approvalPolicy: "on-request" as const,
              },
            ]
          : []),
        {
          id: "ask",
          label: permissionLabels.ask,
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
        },
        ...(isClaude
          ? [
              {
                id: "edits",
                label: "Accept edits",
                sandbox: "danger-full-access" as const,
                approvalPolicy: "on-request" as const,
              },
            ]
          : []),
        {
          id: "deny",
          label: permissionLabels.deny,
          sandbox: "workspace-write",
          approvalPolicy: "never",
        },
        {
          id: "full",
          label: permissionLabels.full,
          sandbox: "danger-full-access",
          approvalPolicy: "never",
        },
      ]
    : (Object.keys(SANDBOX_LABEL) as SandboxMode[]).map((sandbox) => ({
        id: sandbox,
        label: SANDBOX_LABEL[sandbox],
        sandbox,
        approvalPolicy: "on-request",
      }))
  const selected = isCursor
    ? options.find(
        (option) =>
          option.id ===
          (selection.approvalPolicy === "never"
            ? selection.sandbox === "danger-full-access"
              ? "full"
              : "deny"
            : "ask"),
      )!
    : toolPermissions
      ? (options.find(
          (option) =>
            option.sandbox === selection.sandbox &&
            option.approvalPolicy === selection.approvalPolicy,
        ) ??
        options.find((option) => option.sandbox === selection.sandbox) ??
        options.find((option) => option.id === "ask")!)
      : options.find((option) => option.sandbox === selection.sandbox)!
  const visible = selectableModels(snapshot).filter((model) => !model.hidden)
  return (
    <>
      <ModelPicker
        providers={snapshot.providers}
        models={visible}
        selected={selection.model}
        onSelect={(modelId) => onChangeSettings({ threadId, modelId })}
      />

      <ReasoningSettings
        selection={selection}
        threadId={threadId}
        onChangeSettings={onChangeSettings}
      />

      <DropdownMenu
        trigger={
          <BaseButton
            data-motion="background-color border-color color opacity"
            render={<Pressable />}
            type="button"
            className={chipClasses}
            aria-label={
              toolPermissions
                ? `Change ${isClaude ? "Claude" : "Cursor"} permissions`
                : "Change sandbox access"
            }
          >
            <SandboxIcon mode={selection.sandbox} />
            <span className="overflow-hidden text-ellipsis">{selected.label}</span>
            <ChevronDown
              size={13}
              strokeWidth={1.75}
              className="flex-none text-[var(--text-tertiary)]"
            />
          </BaseButton>
        }
      >
        <MenuRadioGroup
          value={selected.id}
          onValueChange={(value) => {
            const option = options.find((entry) => entry.id === value)
            if (option)
              onChangeSettings({
                threadId,
                sandbox: option.sandbox,
                ...(toolPermissions
                  ? { approvalPolicy: option.approvalPolicy, mode: "default" }
                  : {}),
              })
          }}
        >
          <MenuGroup label={toolPermissions ? "Tool permissions" : "Filesystem access"}>
            {options.map((option) => (
              <MenuChoice key={option.id} value={option.id}>
                {option.label}
                <span className="grid w-[14px] h-[14px] flex-[0_0_14px] ml-[auto] text-[var(--text-secondary)] place-items-center">
                  <SandboxIcon mode={option.sandbox} />
                </span>
              </MenuChoice>
            ))}
          </MenuGroup>
        </MenuRadioGroup>
      </DropdownMenu>
    </>
  )
}

const harnessName = (harness: string | undefined): string => {
  switch (harness) {
    case "cursor":
      return "Cursor"
    case "claude-code":
      return "Claude"
    default:
      return "Codex"
  }
}

export function Composer({
  snapshot,
  threadId,
  draft,
  onDraftChange,
  providerReady,
  providerDetail,
  onRecheckProvider,
  onChangeSettings,
  onSend,
  onInterrupt,
  running,
  interrupting,
  queuedCount,
  sending,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
}: ComposerProps): React.JSX.Element {
  const enterToSend = snapshot.settings.sendShortcut === "enter"
  const sendShortcutLabel = enterToSend ? "Enter" : "Ctrl+Enter"
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const attachmentReadsPending = useRef(0)
  const selection = resolveSelection(snapshot, threadId)
  const providerName = harnessName(selection?.provider.harness)
  const canSend =
    providerReady &&
    selection !== null &&
    (draft.trim().length > 0 || attachments.length > 0) &&
    !sending &&
    !loadingAttachments

  const addAttachments = async (
    read: () => Promise<ReadonlyArray<ComposerAttachment>>,
  ): Promise<void> => {
    if (sending) return
    attachmentReadsPending.current += 1
    setLoadingAttachments(true)
    setAttachmentError(null)
    try {
      onAddAttachments(await read())
    } catch {
      setAttachmentError("Could not read attachments. Try attaching them again.")
    } finally {
      attachmentReadsPending.current -= 1
      setLoadingAttachments(attachmentReadsPending.current > 0)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-measure the textarea after each draft edit.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea === null) return

    textarea.style.minHeight = "0px"
    textarea.style.height = "0px"
    const maxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight)
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.minHeight = ""
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [draft])

  return (
    <div className="composer-zone [padding:0_clamp(24px,_7vw,_104px)_18px] [&_.notice]:max-w-[860px] [&_.notice]:mr-[auto] [&_.notice]:ml-[auto]">
      {!providerReady && (
        <Notice
          tone="warning"
          role="status"
          title="Provider unavailable"
          message={providerDetail}
          className="mb-[10px]"
        >
          <Button size="sm" onClick={onRecheckProvider}>
            <RefreshCw size={13} strokeWidth={1.75} />
            Check again
          </Button>
        </Notice>
      )}

      <div
        data-motion="background-color border-color box-shadow"
        data-motion-duration="0.2"
        className={composerClasses}
      >
        <ComposerAttachments attachments={attachments} onRemoveAttachment={onRemoveAttachment} />
        {loadingAttachments && (
          <div className="text-[var(--text-tertiary)] text-[11px] p-[8px]" role="status">
            Adding attachments…
          </div>
        )}
        {attachmentError && (
          <div className="text-[var(--text-tertiary)] text-[11px] p-[8px]" role="alert">
            {attachmentError}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={draft}
          rows={2}
          placeholder={`Ask ${providerName} to work in this workspace…`}
          aria-label={`Message ${providerName}`}
          aria-keyshortcuts={enterToSend ? "Enter" : "Control+Enter"}
          onChange={(event) => onDraftChange(event.target.value)}
          onPaste={(event) => {
            const images = Array.from(event.clipboardData.files).filter((file) =>
              file.type.startsWith("image/"),
            )
            if (images.length === 0) return
            event.preventDefault()
            void addAttachments(() =>
              Promise.all(
                images.map(
                  (file) =>
                    new Promise<ComposerAttachment>((resolve, reject) => {
                      const reader = new FileReader()
                      reader.onload = () => {
                        if (typeof reader.result !== "string") {
                          reject(new Error("Could not read image"))
                          return
                        }
                        resolve({
                          type: "image",
                          value: reader.result,
                          name: file.name || "Pasted image",
                        })
                      }
                      reader.onerror = () => reject(reader.error)
                      reader.onabort = () => reject(new Error("Image read cancelled"))
                      reader.readAsDataURL(file)
                    }),
                ),
              ),
            )
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              !event.shiftKey &&
              !event.altKey &&
              (event.ctrlKey || enterToSend) &&
              canSend &&
              attachmentReadsPending.current === 0
            ) {
              event.preventDefault()
              onSend()
            }
          }}
        />

        <div className="flex items-center flex-wrap gap-[6px] [padding:7px_8px_8px] border-t-[1px] border-t-[color:var(--line-subtle)] [@container(max-width:_620px)]:gap-[4px] [@container(max-width:_620px)]:[&_.chip]:px-[6px]">
          <IconButton
            data-motion="background-color border-color color opacity"
            unstyled
            className={chipClasses}
            label="Attach image, file, or skill"
            disabled={loadingAttachments || sending}
            onClick={() => void addAttachments(() => window.meldshell.selectAttachments())}
          >
            <Paperclip size={13} strokeWidth={1.75} />
          </IconButton>
          <ComposerSettings
            snapshot={snapshot}
            threadId={threadId}
            selection={selection}
            onChangeSettings={onChangeSettings}
          />

          <span className="flex-[1_1_auto] min-w-[8px]" />

          <div className="flex flex-none items-center gap-[6px] ml-[auto]">
            {!running && queuedCount === 0 && (
              <span
                className="inline-flex items-center gap-[3px] mr-[5px] text-[var(--text-tertiary)] text-[10px] whitespace-nowrap [@container(max-width:_620px)]:hidden"
                aria-hidden="true"
              >
                {!enterToSend && (
                  <>
                    <kbd className={kbdClasses}>Ctrl</kbd>
                    <span>+</span>
                  </>
                )}
                <kbd className={kbdClasses}>Enter</kbd>
              </span>
            )}
            {queuedCount > 0 && (
              <span className="text-[var(--text-tertiary)] text-[10.5px] tabular-nums whitespace-nowrap">
                {queuedCount} queued {queuedCount === 1 ? "message" : "messages"}
              </span>
            )}

            <PopPresence show={running}>
              <IconButton
                unstyled
                className="[display:inline-grid] w-[28px] h-[28px] flex-[0_0_28px] border-[1px] border-[color:var(--line)] rounded-[50%] bg-transparent text-[var(--text-secondary)] cursor-default place-items-center [&:hover]:bg-[var(--surface-hover)] [&:hover]:[border-color:var(--line-strong)] [&:hover]:text-[var(--text-primary)]"
                label={interrupting ? "Stopping turn" : "Interrupt turn"}
                disabled={interrupting}
                onClick={onInterrupt}
              >
                <Square size={11} fill="currentColor" strokeWidth={1.5} />
              </IconButton>
            </PopPresence>

            <IconButton
              data-motion="background-color border-color color opacity"
              unstyled
              className={sendButtonClasses}
              disabled={!canSend}
              aria-label={running ? "Queue message" : "Send message"}
              label={sendTitle({
                sending,
                providerReady,
                providerName,
                hasSelection: selection !== null,
                loadingAttachments,
                hasContent: draft.trim().length > 0 || attachments.length > 0,
                running,
                sendShortcutLabel,
              })}
              onClick={() => onSend()}
            >
              <Swap id={running ? "queue" : "send"}>
                {running ? (
                  <ListPlus size={15} strokeWidth={2.25} />
                ) : (
                  <ArrowUp size={16} strokeWidth={2.25} />
                )}
              </Swap>
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

const attachmentChipClasses = [
  "inline-flex flex-[0_0_210px] max-w-[min(240px,_100%)] items-center gap-[8px] p-[6px]",
  "border-[1px] border-[color:var(--line)] rounded-[var(--radius)] bg-[var(--surface-hover)]",
  "text-[var(--text-secondary)] text-[10.5px]",
  "[&_button]:grid [&_button]:w-[20px] [&_button]:h-[20px] [&_button]:flex-[0_0_20px] [&_button]:p-0",
  "[&_button]:border-0 [&_button]:rounded-[3px] [&_button]:text-inherit [&_button]:bg-transparent",
  "[&_button]:cursor-default [&_button]:place-items-center [&_button:hover]:bg-[var(--surface-active)]",
  "[&_button:hover]:text-[var(--text-primary)]",
].join(" ")

const composerClasses = [
  "composer [container-type:inline-size] flex w-full max-w-[860px] [margin:0_auto] flex-col",
  "border-[1px] border-[color:var(--line)] rounded-[var(--radius-xl)] bg-[var(--surface-raised)]",
  "[box-shadow:var(--shadow-raised),_inset_0_1px_0_var(--edge-highlight)]",
  "[&:focus-within]:[border-color:var(--line-strong)]",
  "[&:focus-within]:[box-shadow:var(--shadow-raised),_inset_0_1px_0_var(--edge-highlight),_0_0_0_3px_var(--surface-hover)]",
  "[@media(prefers-reduced-transparency:_reduce)]:bg-[var(--surface-raised)]",
  "[@media(prefers-reduced-transparency:_reduce)]:[&:focus-within]:bg-[var(--surface-raised)]",
  "[&_textarea]:min-h-[72px] [&_textarea]:max-h-[210px] [&_textarea]:overflow-y-hidden",
  "[&_textarea]:[padding:15px_16px_10px] [&_textarea]:border-0 [&_textarea]:bg-transparent",
  "[&_textarea]:text-[var(--text-primary)] [&_textarea]:text-[14px] [&_textarea]:leading-[1.55]",
  "[&_textarea]:outline-none [&_textarea]:resize-none",
  "[&_textarea::placeholder]:text-[var(--text-tertiary)]",
].join(" ")

const sendButtonClasses = [
  "[display:inline-grid] w-[30px] h-[30px] flex-[0_0_30px] border-0 rounded-[50%] bg-[var(--accent)]",
  "text-[var(--accent-foreground)] cursor-default place-items-center",
  "[&:disabled]:bg-[var(--surface-active)] [&:disabled]:text-[var(--text-disabled)]",
  "[&:hover:not(:disabled)]:bg-[var(--accent-hover)]",
  "[&:hover:not(:disabled)]:[box-shadow:0_0_0_3px_var(--surface-active)]",
  "[&:active:not(:disabled)]:bg-[var(--text-secondary)]",
].join(" ")
