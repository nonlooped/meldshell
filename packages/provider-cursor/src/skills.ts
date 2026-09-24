import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ComposerCommand } from "@meldshell/contracts"

/** Project folders come first so a workspace skill shadows a user skill of the same name. */
const SKILL_ROOTS = [".cursor/skills", ".claude/skills", ".codex/skills"]

const frontmatterValue = (source: string, key: string): string | undefined => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1]
  const value = frontmatter
    ?.split(/\r?\n/)
    .find((line) => line.startsWith(`${key}:`))
    ?.slice(key.length + 1)
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
  return value || undefined
}

async function readSkill(directory: string, folder: string): Promise<ComposerCommand | null> {
  const path = join(directory, folder, "SKILL.md")
  const source = await readFile(path, "utf8").catch(() => null)
  if (source === null) return null
  return {
    kind: "skill",
    name: frontmatterValue(source, "name") ?? folder,
    description: frontmatterValue(source, "description") ?? "",
    path,
  }
}

/** Cursor advertises no skill list over ACP, so read SKILL.md folders from disk. */
export async function discoverCursorSkills(workspacePath: string): Promise<ComposerCommand[]> {
  const skills = new Map<string, ComposerCommand>()
  for (const directory of [workspacePath, homedir()].flatMap((base) =>
    SKILL_ROOTS.map((root) => join(base, root)),
  )) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      const skill = await readSkill(directory, entry.name)
      if (skill !== null && !skills.has(skill.name)) skills.set(skill.name, skill)
    }
  }
  return [...skills.values()]
}

/** Cursor labels skills in its command list, as in `Create Cursor rules. (builtin skill)`. */
const SKILL_LABEL = /\s*\((?:[\w-]+ )?skill\)$/i

/**
 * Cursor advertises skills among its commands, so its labels decide which entries are skills.
 * Skills found on disk supply their SKILL.md path, and fill in when Cursor advertises nothing.
 */
export function cursorCommands(
  advertised: ReadonlyArray<{ name: string; description: string; argumentHint?: string }>,
  discovered: readonly ComposerCommand[],
): ComposerCommand[] {
  const paths = new Map(discovered.map((skill) => [skill.name, skill.path]))
  const commands = advertised.map(({ name, description, argumentHint }): ComposerCommand => {
    if (!SKILL_LABEL.test(description))
      return { kind: "command", name, description, ...(argumentHint ? { argumentHint } : {}) }
    const path = paths.get(name)
    return {
      kind: "skill",
      name,
      description: description.replace(SKILL_LABEL, ""),
      ...(path ? { path } : {}),
    }
  })
  const advertisedNames = new Set(advertised.map((command) => command.name))
  return [...commands, ...discovered.filter((skill) => !advertisedNames.has(skill.name))]
}
