import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { IconButton } from "./controls"
import { Swap } from "./motion"

export type CopyState = "idle" | "copied" | "failed"

/** Copies text to the clipboard and reports the outcome for a moment afterwards. */
export function useCopy(resetMs = 2000): [CopyState, (text: string) => Promise<void>] {
  const [state, setState] = useState<CopyState>("idle")
  useEffect(() => {
    if (state === "idle") return
    const timer = window.setTimeout(() => setState("idle"), resetMs)
    return () => window.clearTimeout(timer)
  }, [state, resetMs])
  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
    } catch {
      setState("failed")
    }
  }
  return [state, copy]
}

/** The words a status region shows for a copy outcome. */
export const copyStatusText = (state: CopyState): string =>
  state === "failed" ? "Copy failed. Try again." : state === "copied" ? "Copied" : ""

/** An unstyled icon button whose glyph swaps to a tick once the copy lands. */
export function CopyIconButton({
  label,
  state,
  onClick,
}: {
  readonly label: string
  readonly state: CopyState
  readonly onClick: () => void
}): React.JSX.Element {
  const copied = state === "copied"
  return (
    <IconButton unstyled label={label} onClick={onClick}>
      <Swap id={copied ? "copied" : "copy"}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </Swap>
    </IconButton>
  )
}
