export function toolLanguage(text: string, command: boolean): string {
  if (command) {
    const executable = text.trim().match(/^(?:&\s*)?(?:"([^"]+)"|'([^']+)'|(\S+))/)
    const name = (executable?.[1] ?? executable?.[2] ?? executable?.[3] ?? "")
      .split(/[\\/]/)
      .pop()
      ?.toLowerCase()
      .replace(/\.exe$/, "")
    if (name === "pwsh" || name === "powershell") return "powershell"
    if (name === "bash" || name === "sh" || name === "zsh") return "bash"
    if (
      /^(?:Get|Set|New|Remove|Select|Write|Read|Invoke|Test|Start|Stop|Copy|Move|ConvertTo|ConvertFrom)-[A-Za-z]+\b/i.test(
        text.trim(),
      )
    )
      return "powershell"
    return "plain"
  }
  // Only structured JSON is distinctive enough to infer from arbitrary output.
  if (text.length <= 100_000 && /^\s*[[{]/.test(text)) {
    try {
      JSON.parse(text)
      return "json"
    } catch {
      return "plain"
    }
  }
  return "plain"
}
