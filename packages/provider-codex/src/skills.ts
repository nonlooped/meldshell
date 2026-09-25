import { asRecord, asRecords, type ComposerCommand } from "@meldshell/contracts"

const filled = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined

/** Codex has no slash-command API; its enabled skills are sent as skill inputs. */
export const codexSkillCommands = (response: unknown): ComposerCommand[] => {
  const commands = new Map<string, ComposerCommand>()
  for (const entry of asRecords(asRecord(response).data)) {
    for (const skill of asRecords(entry.skills)) {
      const name = filled(skill.name)
      const path = filled(skill.path)
      if (!name || !path || skill.enabled === false || commands.has(name)) continue
      commands.set(name, {
        kind: "skill",
        name,
        description:
          filled(asRecord(skill.interface).shortDescription) ??
          filled(skill.shortDescription) ??
          filled(skill.description) ??
          "",
        path,
      })
    }
  }
  return [...commands.values()]
}
