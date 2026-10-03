import type { Provider } from "@meldshell/contracts"
import anthropicIcon from "@iconify-icons/logos/claude-icon"
import cursorIcon from "@iconify-icons/simple-icons/cursor"
import githubIcon from "@iconify-icons/simple-icons/github"
import googleIcon from "@iconify-icons/logos/google-icon"
import openaiIcon from "@iconify-icons/simple-icons/openai"
import { Icon } from "@iconify/react"
import { Bot } from "lucide-react"

interface ProviderIconProps {
  readonly provider?: Provider
  readonly size: number
}

/**
 * Pi's mark, a 4×4 pixel grid in its fixed brand colours, as Pi draws it in its own terminal UI
 * (`pi-logo.ts` in pi-mono).
 */
const PI_PIXELS: ReadonlyArray<readonly [x: number, y: number, fill: string]> = [
  [0, 0, "#e48a7a"],
  [1, 0, "#e48a7a"],
  [2, 0, "#e48a7a"],
  [0, 1, "#4f8eb3"],
  [2, 1, "#e48a7a"],
  [0, 2, "#4f8eb3"],
  [1, 2, "#4f8eb3"],
  [3, 2, "#eab65d"],
  [0, 3, "#4f8eb3"],
  [3, 3, "#eab65d"],
]

function PiIcon({ size }: { readonly size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 4 4"
      className="shrink-0"
      shapeRendering="crispEdges"
      data-provider="pi"
      aria-hidden="true"
    >
      {PI_PIXELS.map(([x, y, fill]) => (
        <rect key={`${x}${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  )
}

export function ProviderIcon({ provider, size }: ProviderIconProps): React.JSX.Element {
  const providerIcons = {
    anthropic: anthropicIcon,
    cursor: cursorIcon,
    github: githubIcon,
    google: googleIcon,
    openai: openaiIcon,
  } as const
  const key = provider?.key.toLowerCase()
  if (key === "pi") return <PiIcon size={size} />
  const icon = key === undefined ? undefined : providerIcons[key as keyof typeof providerIcons]

  if (icon !== undefined) {
    return (
      <Icon
        icon={icon}
        width={size}
        height={size}
        className="shrink-0"
        data-provider={key}
        aria-hidden="true"
      />
    )
  }

  return (
    <Bot
      size={size}
      strokeWidth={1.8}
      className="shrink-0"
      data-provider={provider?.key ?? "unknown"}
      aria-hidden="true"
    />
  )
}
