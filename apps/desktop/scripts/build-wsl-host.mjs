import { createHash } from "node:crypto"
import { cp, readFile, readdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"

// Only the Windows app ships this payload; other platforms build it on request (CI, packaging).
if (process.platform !== "win32" && !process.env.MELDSHELL_BUILD_WSL_HOST) {
  console.info("Skipping the WSL host payload; set MELDSHELL_BUILD_WSL_HOST=1 to build it.")
  process.exit(0)
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const output = join(root, "apps/desktop/out/wsl-host")
const runtimeDependencies = JSON.parse(
  await readFile(join(root, "apps/host/runtime/package.json"), "utf8"),
).dependencies
const external = Object.keys(runtimeDependencies)
for (const name of external) {
  const installed = JSON.parse(
    await readFile(join(root, "node_modules", name, "package.json"), "utf8"),
  )
  if (installed.version !== runtimeDependencies[name])
    throw new Error(
      `Update apps/host/runtime/package.json and its lockfile to match ${name} ${installed.version}.`,
    )
}
await build({
  root,
  configFile: false,
  publicDir: false,
  ssr: { noExternal: true, external },
  build: {
    ssr: true,
    target: "node24",
    outDir: output,
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        desktop: join(root, "apps/host/src/desktop.ts"),
        worker: join(root, "apps/host/src/worker.ts"),
      },
      output: { format: "es", entryFileNames: "[name].js" },
    },
  },
})
for (const file of ["package.json", "package-lock.json"])
  await cp(join(root, "apps/host/runtime", file), join(output, file))
// The cache key tracks actual code and dependency contents, including same-version dev builds.
const digest = createHash("sha256")
digest.update(await readFile(join(root, "apps/desktop/src/main/runtime/wsl-bootstrap.ts")))
async function hashDirectory(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name)
    digest.update(entry.name)
    if (entry.isDirectory()) await hashDirectory(path)
    else digest.update(await readFile(path))
  }
}
await hashDirectory(output)
await writeFile(join(output, "digest"), digest.digest("hex"))
