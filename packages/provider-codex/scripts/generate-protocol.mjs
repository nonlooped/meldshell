import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { compileFromFile } from "json-schema-to-typescript"

const root = new URL("../", import.meta.url)
const schemas = [
  "ServerNotification",
  "ServerRequest",
  "v2/ThreadStartResponse",
  "v2/ThreadResumeResponse",
  "v2/TurnStartResponse",
  "v2/ModelListResponse",
]
const check = process.argv.includes("--check")
for (const name of schemas) {
  const target = new URL(`src/generated/${name}.d.ts`, root)
  const output = await compileFromFile(fileURLToPath(new URL(`schema/${name}.json`, root)), {
    bannerComment:
      "/* Generated from the checked-in Codex JSON Schema. Run npm run generate:protocol --workspace=@meldshell/provider-codex. */",
    unknownAny: true,
    style: { semi: false, printWidth: 100, trailingComma: "all" },
  })
  if (check) {
    if ((await readFile(target, "utf8")) !== output)
      throw new Error(`Stale generated protocol: ${name}`)
  } else {
    await mkdir(new URL("./", target), { recursive: true })
    await writeFile(target, output)
  }
}
