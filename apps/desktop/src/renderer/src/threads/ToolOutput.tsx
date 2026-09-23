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
    <section className={toolOutputClasses} aria-label={label} data-error={error || undefined}>
      <div className={toolOutputHeaderClasses}>
        <span className="tool-output-label mr-[auto] font-medium">{label}</span>
        <SelectField
          className="tool-output-language [&:focus-visible]:[outline:1px_solid_var(--accent)] [&:focus-visible]:[outline-offset:-2px]"
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
        <span className="text-[11px]" role="status">
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
        className={
          "[&_>_code]:[font:inherit] [&:focus-visible]:[outline:1px_solid_var(--accent)] [&:focus-visible]:[outline-offset:-2px] max-h-[240px] m-0 p-[12px] overflow-auto text-[var(--text-primary)] [font:12px_/_1.65_var(--font-mono)] whitespace-pre-wrap [overflow-wrap:anywhere] [tab-size:2] [&[data-expanded]]:max-h-none overflow-y-auto [scrollbar-gutter:stable]"
        }
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

const toolOutputClasses = [
  "[&_.token.comment]:text-[var(--text-tertiary)] [&_.token.prolog]:text-[var(--text-tertiary)]",
  "[&_.token.doctype]:text-[var(--text-tertiary)] [&_.token.keyword]:text-[var(--color-renamed)]",
  "[&_.token.tag]:text-[var(--color-renamed)] [&_.token.boolean]:text-[var(--color-renamed)]",
  "[&_.token.string]:text-[var(--color-added)] [&_.token.attr-value]:text-[var(--color-added)]",
  "[&_.token.number]:text-[var(--color-modified)] [&_.token.function]:text-[var(--color-modified)]",
  "[&_.token.class-name]:text-[var(--color-modified)] [&_.token.property]:text-[var(--color-info)]",
  "[&_.token.attr-name]:text-[var(--color-info)] min-w-0 overflow-hidden border-[1px] border-[color:var(--line)]",
  "rounded-[var(--radius)] [&[data-error]]:[border-color:color-mix(in_srgb,var(--color-deleted)_45%,transparent)]",
  "[&[data-error]_.tool-output-label]:text-[var(--color-deleted)]",
].join(" ")

const toolOutputHeaderClasses = [
  "flex items-center gap-[8px] min-h-[32px] [padding:3px_8px_3px_12px]",
  "border-b-[1px] border-b-[color:var(--line-subtle)] bg-[var(--surface-hover)] text-[var(--text-secondary)] text-[11px]",
  "[[data-error]_>_&]:[background:color-mix(in_srgb,var(--color-deleted)_7%,transparent)]",
  "[&_.tool-output-language]:min-w-0 [&_.tool-output-language]:max-w-[150px]",
  "[&_.tool-output-language]:min-h-[26px] [&_.tool-output-language]:border-[1px] [&_.tool-output-language]:border-[color:var(--line)]",
  "[&_.tool-output-language]:rounded-[var(--radius-sm)] [&_.tool-output-language]:bg-transparent",
  "[&_.tool-output-language]:text-[var(--text-secondary)] [&_.tool-output-language]:[font:inherit]",
  "[&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_button]:min-w-[26px]",
  "[&_button]:min-h-[26px] [&_button]:[padding:3px_6px] [&_button]:border-0",
  "[&_button]:rounded-[var(--radius-sm)] [&_button]:bg-transparent",
  "[&_button]:text-[var(--text-secondary)] [&_button]:[font:inherit] [&_button]:cursor-pointer",
  "[&_button:hover]:bg-[var(--surface-hover)] [&_button:hover]:text-[var(--text-primary)]",
  "[&_button:focus-visible]:[outline:1px_solid_var(--accent)]",
  "[&_button:focus-visible]:[outline-offset:-2px]",
].join(" ")
