import { useEffect, useState, type ReactNode } from "react"
import { Check, CircleAlert, Copy, TriangleAlert, X } from "lucide-react"
import { FadeDiv } from "./motion"
import { Button, IconButton } from "./controls"

const tones = {
  error: "var(--color-deleted)",
  warning: "var(--color-modified)",
} as const

/**
 * A tinted failure card. The message wraps instead of truncating because failure text carries exit
 * statuses and stderr that people paste into reports.
 */
export function Notice({
  tone = "error",
  title,
  message,
  children,
  className = "",
  role = "alert",
}: {
  tone?: keyof typeof tones
  title: string
  message?: string
  children?: ReactNode
  className?: string
  role?: "alert" | "status"
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])
  return (
    <FadeDiv
      duration={0.2}
      role={role}
      style={{ "--tone": tones[tone] } as React.CSSProperties}
      className={`notice relative grid gap-[4px] [padding:9px_36px_10px_12px] border-[1px] rounded-[var(--radius)] [border-color:color-mix(in_srgb,var(--tone)_22%,transparent)] [background:color-mix(in_srgb,var(--tone)_6%,transparent)] text-[12px] leading-[1.5] ${className}`}
    >
      <div className="flex items-center gap-[7px] font-medium text-[var(--tone)]">
        <TriangleAlert size={13} strokeWidth={2} className="flex-none" />
        <span>{title}</span>
      </div>
      {message && (
        <div className="text-[var(--text-secondary)] [overflow-wrap:anywhere] whitespace-pre-wrap select-text max-h-[160px] overflow-y-auto">
          {message}
        </div>
      )}
      {children && <div className="flex flex-wrap items-center gap-[8px] mt-[4px]">{children}</div>}
      {message && (
        <IconButton
          unstyled
          label={copied ? "Copied" : "Copy details"}
          className="absolute top-[6px] right-[6px] grid w-[22px] h-[22px] place-items-center border-0 rounded-[var(--radius-sm)] bg-transparent text-[var(--text-tertiary)] cursor-pointer [&:hover]:bg-[var(--surface-hover)] [&:hover]:text-[var(--text-primary)]"
          onClick={() => {
            void navigator.clipboard.writeText(message).then(() => setCopied(true))
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </IconButton>
      )}
    </FadeDiv>
  )
}

/** A floating failure from an action that has no control of its own to sit beside. */
export function ErrorToast({
  message,
  onDismiss,
}: {
  message: string
  onDismiss: () => void
}): React.JSX.Element {
  return (
    <FadeDiv
      duration={0.2}
      className="fixed z-[110] bottom-[16px] left-[50%] [transform:translateX(-50%)] flex items-start gap-[10px] [padding:10px_10px_10px_14px] w-max max-w-[min(560px,_80vw)] bg-[var(--surface-overlay)] [backdrop-filter:blur(24px)] text-[var(--text-primary)] border-[1px] border-[color:var(--line)] rounded-[var(--radius-lg)] text-[12px] leading-[1.5] [box-shadow:var(--shadow-popup),_inset_0_1px_0_var(--edge-highlight)] [@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]"
      role="alert"
    >
      <CircleAlert size={15} className="flex-none mt-[4px] text-[var(--color-deleted)]" />
      <span className="min-w-0 py-[3px] [overflow-wrap:anywhere] select-text">{message}</span>
      <Button size="sm" className="flex-none" onClick={onDismiss}>
        Dismiss
      </Button>
    </FadeDiv>
  )
}

/** How long an undoable action stays offered before its toast leaves. */
const ACTION_TOAST_MS = 6_000

/**
 * A floating confirmation of something just done, with a way to take it back. It leaves on its own
 * after a few seconds, but not while the pointer rests on it.
 */
export function ActionToast({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (hovered) return
    const timer = window.setTimeout(onDismiss, ACTION_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [hovered, onDismiss])
  return (
    <FadeDiv
      duration={0.2}
      className="fixed z-[110] bottom-[16px] left-[50%] [transform:translateX(-50%)] flex items-center gap-[8px] [padding:6px_6px_6px_14px] w-max max-w-[min(480px,_80vw)] bg-[var(--surface-overlay)] [backdrop-filter:blur(24px)] text-[var(--text-primary)] border-[1px] border-[color:var(--line)] rounded-[var(--radius-lg)] text-[12px] leading-[1.5] [box-shadow:var(--shadow-popup),_inset_0_1px_0_var(--edge-highlight)] [@media(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]"
      role="status"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{message}</span>
      <Button size="sm" className="flex-none" onClick={onAction}>
        {actionLabel}
      </Button>
      <IconButton
        label="Dismiss"
        className="w-[24px]! h-[24px]! flex-[0_0_24px]!"
        onClick={onDismiss}
      >
        <X size={13} />
      </IconButton>
    </FadeDiv>
  )
}
