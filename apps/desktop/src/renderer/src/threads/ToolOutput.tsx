import { useEffect, useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Toggle } from "@base-ui-components/react/toggle"
import { IconButton, SelectField } from "../ui/controls"
import { SourceCode } from "../ui/SourceCode"
import { toolLanguage } from "./tool-language"

export function ToolOutput({
  label,
  text,
  error = false,
  command = false,
}: {
  readonly label: string
  readonly text: string
  readonly error?: boolean
  readonly command?: boolean
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [copyState, setCopyState] = useState("idle")
  const [language, setLanguage] = useState("auto")
  const detectedLanguage = useMemo(() => toolLanguage(text, command), [text, command])
  const long = text.length > 1200 || text.split("\n").length > 12

  useEffect(() => {
    if (copyState === "idle") return
    const timer = window.setTimeout(() => setCopyState("idle"), 2000)
    return () => window.clearTimeout(timer)
  }, [copyState])

  return (
    <section className="tool-output" aria-label={label} data-error={error || undefined}>
      <div className="tool-output-header">
        <span className="tool-output-label">{label}</span>
        <SelectField
          className="tool-output-language"
          label={`${label} syntax language`}
          value={language}
          onValueChange={setLanguage}
          options={[
            {
              value: "auto",
              label: `Auto · ${
                detectedLanguage === "plain"
                  ? "Plain text"
                  : detectedLanguage === "powershell"
                    ? "PowerShell"
                    : detectedLanguage === "bash"
                      ? "Bash"
                      : "JSON"
              }`,
            },
            { value: "plain", label: "Plain text" },
            { value: "bash", label: "Bash" },
            { value: "powershell", label: "PowerShell" },
            { value: "json", label: "JSON" },
            { value: "markdown", label: "Markdown" },
            { value: "yaml", label: "YAML" },
            { value: "javascript", label: "JavaScript" },
            { value: "typescript", label: "TypeScript" },
            { value: "python", label: "Python" },
            { value: "diff", label: "Diff" },
          ]}
        />
        <span className="tool-copy-status" role="status">
          {copyState === "failed"
            ? "Copy failed. Try again."
            : copyState === "copied"
              ? "Copied"
              : ""}
        </span>
        {long && (
          <Toggle pressed={expanded} onPressedChange={setExpanded} aria-label="Expand output">
            {expanded ? "Collapse" : "Expand"}
          </Toggle>
        )}
        <IconButton
          unstyled
          label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopyState("copied")
            } catch {
              setCopyState("failed")
            }
          }}
        >
          {copyState === "copied" ? <Check size={13} /> : <Copy size={13} />}
        </IconButton>
      </div>
      <pre
        className="tool-output-content scrollable"
        data-expanded={expanded || undefined}
        tabIndex={0}
        aria-label={`${label} content`}
        role={error ? "alert" : undefined}
      >
        <SourceCode text={text} language={language === "auto" ? detectedLanguage : language} />
      </pre>
    </section>
  )
}
