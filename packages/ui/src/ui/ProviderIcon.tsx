import type { Provider } from "@meldshell/contracts"
import anthropicIcon from "@iconify-icons/logos/claude-icon"
import cursorIcon from "@iconify-icons/simple-icons/cursor"
import githubIcon from "@iconify-icons/simple-icons/github"
import googleIcon from "@iconify-icons/logos/google-icon"
import openaiIcon from "@iconify-icons/simple-icons/openai"
import { Icon } from "@iconify/react"
import { Bot } from "lucide-react"
import piLogo from "./assets/pi-logo.svg"

interface ProviderIconProps {
  /** Only the vendor key picks the icon, so a harness's vendor stands in for a configured provider. */
  readonly provider?: Pick<Provider, "key">
  readonly size: number
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
  if (key === "pi")
    return (
      <img
        src={piLogo}
        width={size}
        height={size}
        alt=""
        className="shrink-0 [image-rendering:pixelated]"
        data-provider="pi"
        aria-hidden="true"
      />
    )
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
