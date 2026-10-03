import { chipClasses } from "../ui/styles"
import { PopPresence, Pressable, Swap, useMotionPreference } from "../ui/motion"
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Notice } from "../ui/Notice"
import { Button as BaseButton } from "@base-ui-components/react/button"
import type { ComposerAttachment } from "@meldshell/contracts/ipc"
import {
  HARNESSES,
  type AppSnapshot,
  type CollaborationMode,
  type FollowUpDelivery,
  type ReasoningEffort,
  type SandboxMode,
  type SetThreadSettingsInput,
} from "@meldshell/contracts"
import { knownHarness } from "../data/providers"
import {
  AlarmClock,
  ChevronDown,
  Eye,
  ImageIcon,
  FolderPen,
  Hammer,
  ListChecks,
  MessageCircleQuestion,
  MicOff,
  Paperclip,
  RefreshCw,
  ShieldAlert,
  X,
  ArrowUp,
  CornerDownRight,
  ListPlus,
  Square,
  type LucideProps,
} from "lucide-react"
import { effortLabel, resolveSelection, selectableModels } from "../data/catalog"
import { workspaceScope } from "../data/workspace-scope"
import { FileIcon } from "../ui/FileIcon"
import { ImageLightbox } from "../ui/MarkdownBlocks"
import { ModelPicker } from "./ModelPicker"
import { useComposerCompletion } from "./ComposerCompletion"
import type { ComposerToken } from "./composer-completion"
import { dropText, launchFromText } from "../ui/flight"
import { useViewStore } from "../app/view-store"
import { DictationButton } from "./Dictation"
import {
  Button,
  ContextMenu,
  IconButton,
  DropdownMenu,
  MenuChoice,
  MenuGroup,
  MenuRadioGroup,
  MenuSeparator,
  MenuAction,
} from "../ui/controls"

interface ComposerProps {
  readonly snapshot: AppSnapshot
  readonly threadId: string
  readonly draft: string
  readonly onDraftChange: (draft: string) => void
  readonly tokens: ReadonlyArray<ComposerToken>
  readonly onTokensChange: (tokens: ReadonlyArray<ComposerToken>) => void
  readonly providerReady: boolean
  readonly providerDetail: string
  readonly onRecheckProvider: () => void
  readonly onChangeSettings: (input: SetThreadSettingsInput) => void
  /** `delivery` only matters while a turn runs: wait for it, or redirect it. */
  readonly onSend: (delivery: FollowUpDelivery) => void
  /** What Enter does while a turn runs; the opposite is Ctrl or Cmd with Enter. */
  readonly followUp: FollowUpDelivery
  readonly onFollowUpChange: (delivery: FollowUpDelivery) => void
  readonly onInterrupt: () => void
  readonly running: boolean
  readonly interrupting: boolean
  readonly sending: boolean
  readonly attachments: ReadonlyArray<ComposerAttachment>
  readonly onAddAttachments: (attachments: ReadonlyArray<ComposerAttachment>) => void
  readonly onRemoveAttachment: (index: number) => void
  /** Opens the schedule dialog for the draft. */
  readonly onSchedule: () => void
  /** Shown above the message box, such as the thread's scheduled prompts. */
  readonly accessory?: React.ReactNode
}

const FOLLOW_UP = {
  queue: { label: "Queue for next turn", short: "Queue", icon: ListPlus },
  steer: { label: "Steer the current turn", short: "Steer", icon: CornerDownRight },
} as const satisfies Record<FollowUpDelivery, unknown>

const DELIVERIES = ["queue", "steer"] as const

function FollowUpIcon({
  delivery,
  ...props
}: { delivery: FollowUpDelivery } & LucideProps): React.JSX.Element {
  const Icon = FOLLOW_UP[delivery].icon
  return <Icon {...props} />
}

const otherDelivery = (delivery: FollowUpDelivery): FollowUpDelivery =>
  delivery === "queue" ? "steer" : "queue"

const MODIFIER_KEY = window.meldshell.platform === "darwin" ? "⌘" : "Ctrl"

const SPEED_LABEL = { standard: "Standard", fast: "Fast" } as const
const SANDBOX_LABEL: Readonly<Record<SandboxMode, string>> = {
  "read-only": "Read only",
  "workspace-write": "Workspace write",
  "danger-full-access": "Full access",
}

const SANDBOX_HINT: Readonly<Record<SandboxMode, string>> = {
  "read-only": "Reads anything; asks before changing files",
  "workspace-write": "Edits this workspace; asks to go further",
  "danger-full-access": "No sandbox: any file, any command, network",
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
  return <ShieldAlert size={14} strokeWidth={1.7} />
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment
  onRemove: () => void
}): React.JSX.Element {
  return (
    <>
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
      <IconButton unstyled label={`Remove ${attachment.name ?? "attachment"}`} onClick={onRemove}>
        <X size={11} />
      </IconButton>
    </>
  )
}

function ComposerAttachments({
  attachments,
  onRemoveAttachment,
}: Pick<ComposerProps, "attachments" | "onRemoveAttachment">): React.JSX.Element {
  const reduced = useMotionPreference()
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const preview = previewIndex === null ? null : attachments[previewIndex]
  return (
    <>
      <AnimatePresence initial={false}>
        {attachments.length > 0 && (
          <motion.div
            key="attachments"
            className="relative flex gap-[8px] overflow-x-auto p-[8px] border-b-[1px] border-b-[color:var(--line-subtle)]"
            aria-label="Turn attachments"
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {attachments.map((attachment, index) => (
                <motion.div
                  layout={!reduced}
                  className={attachmentChipClasses}
                  key={`${attachment.type}:${attachment.value}`}
                  initial={reduced ? false : { opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                >
                  <ContextMenu
                    trigger={
                      <div className="flex min-w-0 flex-1 items-center gap-[8px]">
                        <AttachmentChip
                          attachment={attachment}
                          onRemove={() => onRemoveAttachment(index)}
                        />
                      </div>
                    }
                  >
                    {(attachment.type === "image" || attachment.previewUrl) && (
                      <MenuAction onClick={() => setPreviewIndex(index)}>Preview image</MenuAction>
                    )}
                    <MenuAction
                      onClick={() =>
                        void navigator.clipboard.writeText(attachment.name ?? attachment.value)
                      }
                    >
                      Copy name or path
                    </MenuAction>
                    <MenuAction onClick={() => onRemoveAttachment(index)}>
                      Remove attachment
                    </MenuAction>
                  </ContextMenu>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {preview && (preview.type === "image" || preview.previewUrl) && (
        <ImageLightbox
          images={[{ src: preview.previewUrl ?? preview.value, alt: preview.name ?? "Attachment" }]}
          index={0}
          onClose={() => setPreviewIndex(null)}
          onIndex={() => setPreviewIndex(null)}
        />
      )}
    </>
  )
}

function ComposerTextActions({
  input,
  onAttach,
  onSchedule,
  disabled,
}: {
  input: React.RefObject<HTMLTextAreaElement | null>
  onAttach: () => void
  onSchedule: () => void
  disabled: boolean
}) {
  const edit = (command: string, value?: string) => {
    input.current?.focus()
    document.execCommand(command, false, value)
  }
  const selected = () => {
    const field = input.current
    return field?.value.slice(field.selectionStart, field.selectionEnd) ?? ""
  }
  return (
    <>
      <MenuAction onClick={() => edit("undo")}>Undo</MenuAction>
      <MenuAction onClick={() => edit("redo")}>Redo</MenuAction>
      <MenuAction
        onClick={() =>
          void navigator.clipboard.writeText(selected()).then(() => edit("insertText", ""))
        }
      >
        Cut
      </MenuAction>
      <MenuAction onClick={() => void navigator.clipboard.writeText(selected())}>Copy</MenuAction>
      <MenuAction
        onClick={() => void navigator.clipboard.readText().then((text) => edit("insertText", text))}
      >
        Paste
      </MenuAction>
      <MenuAction
        onClick={() => {
          input.current?.focus()
          input.current?.select()
        }}
      >
        Select all
      </MenuAction>
      <MenuAction disabled={disabled} onClick={onAttach}>
        Attach file or image…
      </MenuAction>
      <MenuAction disabled={disabled} onClick={onSchedule}>
        Schedule this prompt…
      </MenuAction>
    </>
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
  delivery,
  settingUp,
}: {
  sending: boolean
  providerReady: boolean
  providerName: string
  hasSelection: boolean
  loadingAttachments: boolean
  hasContent: boolean
  running: boolean
  delivery: FollowUpDelivery
  settingUp: boolean
}): string {
  if (sending) return "Sending message…"
  if (settingUp) return "Waiting for the setup script to finish"
  if (!providerReady) return `${providerName} is unavailable`
  if (!hasSelection) return "Enable a model in Settings"
  if (loadingAttachments) return "Adding attachments…"
  if (!hasContent) return "Write a message or attach a file"
  if (running) return `${FOLLOW_UP[delivery].label} (Enter)`
  return `Send to ${providerName} (Enter)`
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
          render={<Pressable />}
          type="button"
          className={`motion-colors ${chipClasses}`}
          aria-label="Change reasoning effort and speed"
        >
          {efforts.length > 0 && (
            <span className="flex-none text-[var(--text-tertiary)]">
              <LevelIcon index={selectedEffortIndex} count={efforts.length} />
            </span>
          )}
          <span
            className={`overflow-hidden text-ellipsis ${efforts.length > 0 ? "chip-label" : ""}`}
          >
            {selection.reasoningEffort === null
              ? efforts.length > 0
                ? "Reasoning"
                : SPEED_LABEL[selection.speed]
              : `${effortLabel(selection.reasoningEffort)} effort`}
          </span>
          {efforts.length > 0 && supportsFast && selection.speed === "fast" && (
            <span className="chip-label flex-none [padding:1px_5px] rounded-[4px] bg-[var(--surface-active)] text-[var(--text-primary)] text-[10.5px] leading-[1.3]">
              Fast
            </span>
          )}
          <ChevronDown
            size={13}
            strokeWidth={1.75}
            className="chip-chevron flex-none text-[var(--text-tertiary)]"
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
              </MenuChoice>
            ))}
          </MenuGroup>
        </MenuRadioGroup>
      )}
    </DropdownMenu>
  )
}

type ModelSelection = NonNullable<ReturnType<typeof resolveSelection>>

const MODES: Readonly<
  Record<CollaborationMode, { label: string; hint: string; icon: typeof Hammer }>
> = {
  default: { label: "Agent", hint: "Works through the task and makes changes", icon: Hammer },
  plan: { label: "Plan", hint: "Proposes a plan before changing anything", icon: ListChecks },
  ask: {
    label: "Ask",
    hint: "Answers questions without making changes",
    icon: MessageCircleQuestion,
  },
}

/** The modes a harness offers; one with only the default mode offers no choice. */
const harnessModes = (harness: string): readonly CollaborationMode[] => {
  const { modes } = HARNESSES[knownHarness(harness)]
  return modes.length > 1 ? modes : []
}

function permissionOptions(selection: ModelSelection) {
  const isClaude = selection.provider.harness === "claude-code"
  const isCursor = selection.provider.harness === "cursor"
  const toolPermissions = isClaude || isCursor
  const permissionLabels = isClaude
    ? { ask: "Manual", deny: "Don’t ask", full: "Bypass permissions" }
    : { ask: "Ask Every Time", deny: "Deny requests (custom)", full: "Run Everything" }
  const options: Array<{
    id: string
    label: string
    hint: string
    sandbox: SandboxMode
    approvalPolicy: "on-request" | "never"
  }> = toolPermissions
    ? [
        ...(isClaude
          ? [
              {
                id: "read",
                label: "Read tools only (custom)",
                hint: "Reads, searches, and browses; never edits or runs commands",
                sandbox: "read-only" as const,
                approvalPolicy: "on-request" as const,
              },
            ]
          : []),
        {
          id: "ask",
          label: permissionLabels.ask,
          hint: isClaude ? "Asks before edits and commands" : "Asks before each tool runs",
          sandbox: "workspace-write",
          approvalPolicy: "on-request",
        },
        ...(isClaude
          ? [
              {
                id: "edits",
                label: "Accept edits",
                hint: "Edits files freely; asks before commands",
                sandbox: "danger-full-access" as const,
                approvalPolicy: "on-request" as const,
              },
            ]
          : []),
        {
          id: "deny",
          label: permissionLabels.deny,
          hint: isClaude
            ? "Runs only tools you already allowed; never asks"
            : "Declines anything that needs approval",
          sandbox: "workspace-write",
          approvalPolicy: "never",
        },
        {
          id: "full",
          label: permissionLabels.full,
          hint: "Runs everything without asking",
          sandbox: "danger-full-access",
          approvalPolicy: "never",
        },
      ]
    : (Object.keys(SANDBOX_LABEL) as SandboxMode[]).map((sandbox) => ({
        id: sandbox,
        label: SANDBOX_LABEL[sandbox],
        hint: SANDBOX_HINT[sandbox],
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
  return { isClaude, toolPermissions, options, selected }
}

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
  const { isClaude, toolPermissions, options, selected } = permissionOptions(selection)
  // Every harness lists its least guarded permission last; it stays visibly distinct when chosen.
  const riskiest = options[options.length - 1]!
  const fullPermissions = snapshot.settings.alwaysFullPermissions ?? false
  // Pi has no permission system; it runs its tools as it does on its own.
  const permissions = !fullPermissions && selection.provider.harness !== "pi"
  const modes = harnessModes(selection.provider.harness)
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

      {(permissions || modes.length > 0) && (
        <DropdownMenu
          trigger={
            <BaseButton
              render={<Pressable />}
              type="button"
              className={`motion-colors ${chipClasses} ${riskyChipClasses}`}
              data-risky={!fullPermissions && selected.id === riskiest.id}
              aria-label={
                fullPermissions
                  ? "Change mode"
                  : toolPermissions
                    ? `Change ${isClaude ? "Claude" : "Cursor"} mode and permissions`
                    : "Change sandbox access"
              }
            >
              {!fullPermissions && <SandboxIcon mode={selection.sandbox} />}
              <span
                className={`overflow-hidden text-ellipsis ${fullPermissions ? "" : "chip-label"}`}
              >
                {fullPermissions ? MODES[selection.mode].label : selected.label}
              </span>
              {!fullPermissions &&
                selection.mode !== "default" &&
                modes.includes(selection.mode) && (
                  <span className="chip-label flex-none [padding:1px_5px] rounded-[4px] bg-[var(--surface-active)] text-[var(--text-primary)] text-[10.5px] leading-[1.3]">
                    {MODES[selection.mode].label}
                  </span>
                )}
              <ChevronDown
                size={13}
                strokeWidth={1.75}
                className="chip-chevron flex-none text-[var(--text-tertiary)]"
              />
            </BaseButton>
          }
        >
          {modes.length > 0 && (
            <>
              <MenuRadioGroup
                value={selection.mode}
                onValueChange={(value) =>
                  onChangeSettings({ threadId, mode: String(value) as CollaborationMode })
                }
              >
                <MenuGroup label="Mode">
                  {modes.map((mode) => {
                    const { label, hint, icon: ModeIcon } = MODES[mode]
                    return (
                      <MenuChoice key={mode} value={mode} hint={hint}>
                        {label}
                        <span className="grid w-[14px] h-[14px] flex-[0_0_14px] ml-[auto] place-items-center text-[var(--text-secondary)]">
                          <ModeIcon size={14} strokeWidth={1.7} />
                        </span>
                      </MenuChoice>
                    )
                  })}
                </MenuGroup>
              </MenuRadioGroup>
              {!fullPermissions && <MenuSeparator />}
            </>
          )}
          {!fullPermissions && (
            <MenuRadioGroup
              value={selected.id}
              onValueChange={(value) => {
                const option = options.find((entry) => entry.id === value)
                if (option)
                  onChangeSettings({
                    threadId,
                    sandbox: option.sandbox,
                    ...(toolPermissions ? { approvalPolicy: option.approvalPolicy } : {}),
                  })
              }}
            >
              <MenuGroup label={toolPermissions ? "Tool permissions" : "Filesystem access"}>
                {options.map((option) => (
                  <Fragment key={option.id}>
                    {option === riskiest && <MenuSeparator />}
                    <MenuChoice
                      value={option.id}
                      hint={option.hint}
                      className={option === riskiest ? "text-[var(--color-modified)]!" : undefined}
                    >
                      {option.label}
                      <span
                        className={`grid w-[14px] h-[14px] flex-[0_0_14px] ml-[auto] place-items-center ${option === riskiest ? "text-inherit" : "text-[var(--text-secondary)]"}`}
                      >
                        <SandboxIcon mode={option.sandbox} />
                      </span>
                    </MenuChoice>
                  </Fragment>
                ))}
              </MenuGroup>
            </MenuRadioGroup>
          )}
        </DropdownMenu>
      )}
    </>
  )
}

const harnessName = (harness: string | undefined): string => {
  switch (harness) {
    case "cursor":
      return "Cursor"
    case "claude-code":
      return "Claude"
    case "pi":
      return "Pi"
    default:
      return "Codex"
  }
}

export function Composer({
  snapshot,
  threadId,
  draft,
  onDraftChange,
  tokens,
  onTokensChange,
  providerReady,
  providerDetail,
  onRecheckProvider,
  onChangeSettings,
  onSend,
  followUp,
  onFollowUpChange,
  onInterrupt,
  running,
  interrupting,
  sending,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onSchedule,
  accessory,
}: ComposerProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendButtonRef = useRef<HTMLSpanElement>(null)
  const reduced = useMotionPreference()
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [dictationError, setDictationError] = useState<string | null>(null)
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const attachmentReadsPending = useRef(0)
  const selection = resolveSelection(snapshot, threadId)
  const providerName = harnessName(selection?.provider.harness)
  const thread = snapshot.threads.find((candidate) => candidate.id === threadId)
  const completion = useComposerCompletion({
    draft,
    tokens,
    scope: thread === undefined ? undefined : workspaceScope(thread),
    harness: selection?.provider.harness,
    textareaRef,
    onDraftChange,
    onTokensChange,
  })
  const settingUp = thread?.worktree?.setup === "running"
  const canSend =
    !settingUp &&
    providerReady &&
    selection !== null &&
    (draft.trim().length > 0 || attachments.length > 0) &&
    !sending &&
    !loadingAttachments

  const send = (delivery: FollowUpDelivery = followUp): void => {
    const textarea = textareaRef.current
    if (textarea !== null && !reduced && draft.trim()) {
      // A queued prompt waits for its turn, so it joins the queue instead of the transcript.
      if (running && delivery === "queue" && sendButtonRef.current !== null)
        dropText(textarea, sendButtonRef.current)
      else launchFromText(`prompt:${threadId}`, textarea)
    }
    onSend(delivery)
  }

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

  // The first-run guide hands over to the new thread's composer.
  const focusRequested = useViewStore((state) => state.composerFocusThreadId === threadId)
  useEffect(() => {
    if (!focusRequested) return
    textareaRef.current?.focus()
    useViewStore.getState().focusComposer(null)
  }, [focusRequested])

  return (
    <div className="composer-zone [padding:0_var(--pane-gutter)_max(18px,_env(safe-area-inset-bottom))] [&_.notice]:max-w-[860px] [&_.notice]:mr-[auto] [&_.notice]:ml-[auto]">
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

      {accessory}
      <div className={`motion-colors motion-duration-200 ${composerClasses}`}>
        {completion.menu}
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
        {dictationError && (
          <div
            className="flex items-center gap-[7px] text-[var(--text-secondary)] text-[11.5px] [padding:6px_6px_2px_8px]"
            role="alert"
          >
            <MicOff
              size={12}
              strokeWidth={1.75}
              className="flex-none text-[var(--text-tertiary)]"
            />
            <span className="min-w-0 flex-1">{dictationError}</span>
            <IconButton
              unstyled
              className="motion-colors grid w-[20px] h-[20px] flex-none place-items-center rounded-full border-0 bg-transparent p-0 text-[var(--text-tertiary)] cursor-default [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
              label="Dismiss"
              onClick={() => setDictationError(null)}
            >
              <X size={11} strokeWidth={2} />
            </IconButton>
          </div>
        )}
        <div className="relative grid">
          {completion.highlight}
          <ContextMenu
            trigger={
              <textarea
                ref={textareaRef}
                value={draft}
                rows={2}
                placeholder={`Ask ${providerName} to work in this workspace…`}
                aria-label={`Message ${providerName}`}
                aria-keyshortcuts="Enter"
                {...completion.inputProps}
                onChange={(event) => {
                  onDraftChange(event.target.value)
                  completion.syncCaret(event)
                }}
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
                  if (completion.handleKeyDown(event)) {
                    event.preventDefault()
                    event.stopPropagation()
                    return
                  }
                  if (
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing &&
                    !event.shiftKey &&
                    !event.altKey &&
                    canSend &&
                    attachmentReadsPending.current === 0
                  ) {
                    event.preventDefault()
                    // Ctrl or Cmd picks the delivery Enter does not.
                    send(event.ctrlKey || event.metaKey ? otherDelivery(followUp) : followUp)
                  }
                }}
              />
            }
          >
            <ComposerTextActions
              input={textareaRef}
              disabled={loadingAttachments || sending}
              onAttach={() => void addAttachments(() => window.meldshell.selectAttachments())}
              onSchedule={onSchedule}
            />
          </ContextMenu>
        </div>

        <ContextMenu
          trigger={
            <div className={composerToolbarClasses}>
              <IconButton
                unstyled
                className={`motion-colors flex-none ${chipClasses}`}
                label="Attach image, file, or skill"
                disabled={loadingAttachments || sending}
                onClick={() => void addAttachments(() => window.meldshell.selectAttachments())}
              >
                <Paperclip size={13} strokeWidth={1.75} />
              </IconButton>
              <IconButton
                unstyled
                className={`motion-colors flex-none ${chipClasses}`}
                label="Schedule this prompt"
                disabled={sending}
                onClick={onSchedule}
              >
                <AlarmClock size={13} strokeWidth={1.75} />
              </IconButton>
              <ComposerSettings
                snapshot={snapshot}
                threadId={threadId}
                selection={selection}
                onChangeSettings={onChangeSettings}
              />

              <span className="flex-[1_1_auto] min-w-[8px]" />

              <div className="flex flex-none items-center gap-[6px] ml-[auto]">
                <DictationButton
                  threadId={threadId}
                  textareaRef={textareaRef}
                  draft={draft}
                  onDraftChange={onDraftChange}
                  onError={setDictationError}
                  disabled={sending}
                  model={snapshot.settings.dictationModel}
                />
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

                <span ref={sendButtonRef} className="inline-flex items-center">
                  <IconButton
                    unstyled
                    // Bounces once when there is first something to send.
                    className={`motion-colors ${sendButtonClasses} ${canSend ? "motion-ready" : ""}`}
                    disabled={!canSend}
                    aria-label={running ? FOLLOW_UP[followUp].label : "Send message"}
                    label={sendTitle({
                      sending,
                      providerReady,
                      providerName,
                      hasSelection: selection !== null,
                      loadingAttachments,
                      hasContent: draft.trim().length > 0 || attachments.length > 0,
                      running,
                      delivery: followUp,
                      settingUp,
                    })}
                    onClick={() => send()}
                  >
                    <Swap id={running ? followUp : "send"}>
                      {running ? (
                        <FollowUpIcon delivery={followUp} size={15} strokeWidth={2.25} />
                      ) : (
                        <ArrowUp size={16} strokeWidth={2.25} />
                      )}
                    </Swap>
                  </IconButton>
                </span>
                <PopPresence show={running}>
                  <DropdownMenu
                    align="end"
                    side="top"
                    trigger={
                      <BaseButton
                        render={<Pressable />}
                        type="button"
                        className="motion-colors grid w-[20px] h-[28px] flex-none p-0 border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-default place-items-center [&:hover]:text-[var(--text-primary)]"
                        aria-label="Choose how to send while the agent works"
                      >
                        <ChevronDown size={13} strokeWidth={2} />
                      </BaseButton>
                    }
                  >
                    <MenuGroup label="Send this message">
                      {DELIVERIES.map((delivery) => (
                        <MenuAction
                          key={delivery}
                          disabled={!canSend}
                          icon={<FollowUpIcon delivery={delivery} size={14} strokeWidth={1.75} />}
                          onClick={() => send(delivery)}
                        >
                          {FOLLOW_UP[delivery].label}
                        </MenuAction>
                      ))}
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuGroup label="Enter while working">
                      <MenuRadioGroup
                        value={followUp}
                        onValueChange={(value) =>
                          onFollowUpChange(value === "steer" ? "steer" : "queue")
                        }
                      >
                        {DELIVERIES.map((delivery) => (
                          <MenuChoice
                            key={delivery}
                            value={delivery}
                            detail={FOLLOW_UP[delivery].short}
                          >
                            {FOLLOW_UP[delivery].label}
                          </MenuChoice>
                        ))}
                      </MenuRadioGroup>
                      <div className="[padding:4px_9px_6px] text-[var(--text-tertiary)] text-[10.5px] leading-[1.4]">
                        {MODIFIER_KEY}+Enter does the other.
                      </div>
                    </MenuGroup>
                  </DropdownMenu>
                </PopPresence>
              </div>
            </div>
          }
        >
          <MenuAction
            disabled={loadingAttachments || sending}
            onClick={() => void addAttachments(() => window.meldshell.selectAttachments())}
          >
            Attach file or image…
          </MenuAction>
          <MenuAction disabled={sending} onClick={onSchedule}>
            Schedule this prompt…
          </MenuAction>
          <MenuAction disabled={!draft} onClick={() => onDraftChange("")}>
            Clear draft
          </MenuAction>
        </ContextMenu>
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
  "composer relative [container-type:inline-size] flex w-full max-w-[860px] [margin:0_auto] flex-col",
  // The composer sits in its own row. Keep its surface flat against the workbench,
  // including while typing, rather than giving it popup-style blur, shadow, or a halo.
  "border-[1px] border-[color:var(--line-subtle)] rounded-[var(--radius-xl)] bg-[var(--surface-composer)]",
  "[&:focus-within]:[border-color:var(--line)]",
  "[@media(prefers-reduced-transparency:_reduce)]:bg-[var(--surface-raised)]",
  "[@media(prefers-reduced-transparency:_reduce)]:[&:focus-within]:bg-[var(--surface-raised)]",
  "[&_textarea]:min-h-[72px] [&_textarea]:max-h-[210px] [&_textarea]:overflow-y-hidden",
  "[&_textarea]:[padding:15px_16px_10px] [&_textarea]:border-0 [&_textarea]:bg-transparent",
  "[&_textarea]:text-[14px] [&_textarea]:leading-[1.55] [&_textarea]:[scrollbar-gutter:stable]",
  // The highlight layer draws the text, so the textarea only shows its caret and selection.
  "[&_textarea]:text-transparent [&_textarea]:[caret-color:var(--text-primary)]",
  "[&_.composer-highlight]:[padding:15px_16px_10px] [&_.composer-highlight]:text-[14px]",
  "[&_.composer-highlight]:leading-[1.55] [&_.composer-highlight]:[scrollbar-gutter:stable]",
  "[&_textarea]:outline-none [&_textarea]:resize-none",
  "[&_textarea::placeholder]:text-[var(--text-tertiary)]",
].join(" ")

/**
 * Model, effort, and permission chips share one row. As it narrows they shrink and truncate, drop
 * their chevrons, then keep only their icons; each chip's label stays in its accessible name.
 */
const composerToolbarClasses = [
  "flex items-center flex-nowrap gap-[6px] [padding:2px_8px_8px]",
  "[&_.chip]:min-w-0 [&_.chip]:shrink",
  "[@container(max-width:_620px)]:gap-[4px] [@container(max-width:_620px)]:[&_.chip]:px-[6px]",
  "[@container(max-width:_520px)]:[&_.chip-chevron]:hidden",
  "[@container(max-width:_440px)]:[&_.chip-label]:hidden",
].join(" ")

const riskyChipClasses = [
  "[&[data-risky='true']]:text-[var(--color-modified)]",
  "[&[data-risky='true']]:[background:color-mix(in_srgb,_var(--color-modified)_9%,_transparent)]",
  "[&[data-risky='true']]:[border-color:color-mix(in_srgb,_var(--color-modified)_24%,_transparent)]",
  "[&[data-risky='true']:hover:not(:disabled)]:text-[var(--color-modified)]",
  "[&[data-risky='true']:hover:not(:disabled)]:[background:color-mix(in_srgb,_var(--color-modified)_14%,_transparent)]",
  "[&[data-risky='true']_svg]:text-inherit",
].join(" ")

const sendButtonClasses = [
  "[display:inline-grid] w-[30px] h-[30px] flex-[0_0_30px] border-0 rounded-[50%] bg-[var(--accent)]",
  "text-[var(--accent-foreground)] cursor-default place-items-center",
  "[&:disabled]:bg-[var(--surface-active)] [&:disabled]:text-[var(--text-tertiary)]",
  "[&:hover:not(:disabled)]:bg-[var(--accent-hover)]",
  "[&:hover:not(:disabled)]:[box-shadow:0_0_0_3px_var(--surface-active)]",
  "[&:active:not(:disabled)]:bg-[var(--text-secondary)]",
].join(" ")
