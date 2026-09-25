import { useMemo, type ReactNode } from "react"
import type { RootContent } from "hast"
import { sourceTokens } from "./syntax-highlighting"

function renderToken(node: RootContent, key: number): ReactNode {
  if (node.type === "text") return node.value
  if (node.type !== "element") return null
  const classes = node.properties.className
  return (
    <span key={key} className={Array.isArray(classes) ? classes.join(" ") : undefined}>
      {node.children.map(renderToken)}
    </span>
  )
}

export function SourceCode({
  path = "",
  text,
  language,
}: {
  path?: string
  text: string
  language?: string
}) {
  const tokens = useMemo(() => sourceTokens(text, path, language), [text, path, language])
  return <code>{tokens ? tokens.map(renderToken) : text}</code>
}
