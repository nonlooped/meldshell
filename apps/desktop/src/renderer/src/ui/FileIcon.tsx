import folderIcon from "@iconify-icons/material-icon-theme/folder-base"
import folderOpenIcon from "@iconify-icons/material-icon-theme/folder-base-open"
import { Icon, type IconifyIcon } from "@iconify/react"
import documentIcon from "@iconify-icons/material-icon-theme/document"
import typescriptIcon from "@iconify-icons/material-icon-theme/typescript"
import reactIcon from "@iconify-icons/material-icon-theme/react"
import javascriptIcon from "@iconify-icons/material-icon-theme/javascript"
import jsonIcon from "@iconify-icons/material-icon-theme/json"
import markdownIcon from "@iconify-icons/material-icon-theme/markdown"
import pythonIcon from "@iconify-icons/material-icon-theme/python"
import rustIcon from "@iconify-icons/material-icon-theme/rust"
import cppIcon from "@iconify-icons/material-icon-theme/cpp"
import csharpIcon from "@iconify-icons/material-icon-theme/csharp"
import consoleIcon from "@iconify-icons/material-icon-theme/console"
import powershellIcon from "@iconify-icons/material-icon-theme/powershell"
import imageIcon from "@iconify-icons/material-icon-theme/image"
import pdfIcon from "@iconify-icons/material-icon-theme/pdf"
import gitIcon from "@iconify-icons/material-icon-theme/git"
import dockerIcon from "@iconify-icons/material-icon-theme/docker"
import htmlIcon from "@iconify-icons/material-icon-theme/html"
import cssIcon from "@iconify-icons/material-icon-theme/css"
import yamlIcon from "@iconify-icons/material-icon-theme/yaml"
import javaIcon from "@iconify-icons/material-icon-theme/java"
import goIcon from "@iconify-icons/material-icon-theme/go"
import xmlIcon from "@iconify-icons/material-icon-theme/xml"
import zipIcon from "@iconify-icons/material-icon-theme/zip"
import databaseIcon from "@iconify-icons/material-icon-theme/database"
import settingsIcon from "@iconify-icons/material-icon-theme/settings"
import nodejsIcon from "@iconify-icons/material-icon-theme/nodejs"
import vueIcon from "@iconify-icons/material-icon-theme/vue"
import svelteIcon from "@iconify-icons/material-icon-theme/svelte"
import tsconfigIcon from "@iconify-icons/material-icon-theme/tsconfig"
import typescriptDefIcon from "@iconify-icons/material-icon-theme/typescript-def"
import eslintIcon from "@iconify-icons/material-icon-theme/eslint"
import lockIcon from "@iconify-icons/material-icon-theme/lock"
import bunIcon from "@iconify-icons/material-icon-theme/bun"
import viteIcon from "@iconify-icons/material-icon-theme/vite"
import tailwindIcon from "@iconify-icons/material-icon-theme/tailwindcss"
import postcssIcon from "@iconify-icons/material-icon-theme/postcss"
import prettierIcon from "@iconify-icons/material-icon-theme/prettier"
import readmeIcon from "@iconify-icons/material-icon-theme/readme"
import licenseIcon from "@iconify-icons/material-icon-theme/license"
import biomeIcon from "@iconify-icons/material-icon-theme/biome"
import npmIcon from "@iconify-icons/material-icon-theme/npm"
import editorconfigIcon from "@iconify-icons/material-icon-theme/editorconfig"
import tuneIcon from "@iconify-icons/material-icon-theme/tune"
import tomlIcon from "@iconify-icons/material-icon-theme/toml"
import nextIcon from "@iconify-icons/material-icon-theme/next"

const extensions: Readonly<Record<string, IconifyIcon>> = {
  ts: typescriptIcon,
  mts: typescriptIcon,
  cts: typescriptIcon,
  tsx: reactIcon,
  jsx: reactIcon,
  js: javascriptIcon,
  mjs: javascriptIcon,
  cjs: javascriptIcon,
  json: jsonIcon,
  jsonc: jsonIcon,
  md: markdownIcon,
  mdx: markdownIcon,
  py: pythonIcon,
  pyw: pythonIcon,
  rs: rustIcon,
  c: cppIcon,
  h: cppIcon,
  cpp: cppIcon,
  hpp: cppIcon,
  cs: csharpIcon,
  sh: consoleIcon,
  bash: consoleIcon,
  zsh: consoleIcon,
  ps1: powershellIcon,
  png: imageIcon,
  jpg: imageIcon,
  jpeg: imageIcon,
  gif: imageIcon,
  webp: imageIcon,
  svg: imageIcon,
  ico: imageIcon,
  pdf: pdfIcon,
  html: htmlIcon,
  css: cssIcon,
  scss: cssIcon,
  yml: yamlIcon,
  yaml: yamlIcon,
  java: javaIcon,
  go: goIcon,
  xml: xmlIcon,
  zip: zipIcon,
  gz: zipIcon,
  tar: zipIcon,
  sql: databaseIcon,
  sqlite: databaseIcon,
  toml: tomlIcon,
  ini: settingsIcon,
  env: tuneIcon,
  lock: lockIcon,
  lockb: lockIcon,
  tsbuildinfo: tsconfigIcon,
  vue: vueIcon,
  svelte: svelteIcon,
}
const filenames: Readonly<Record<string, IconifyIcon>> = {
  "package.json": nodejsIcon,
  "package-lock.json": nodejsIcon,
  ".gitignore": gitIcon,
  ".gitattributes": gitIcon,
  ".gitmodules": gitIcon,
  dockerfile: dockerIcon,
  "docker-compose.yml": dockerIcon,
  "compose.yaml": dockerIcon,
  "compose.yml": dockerIcon,
  "docker-compose.yaml": dockerIcon,
  "bun.lock": bunIcon,
  "bun.lockb": bunIcon,
  "bunfig.toml": bunIcon,
  ".npmrc": npmIcon,
  ".editorconfig": editorconfigIcon,
  ".prettierrc": prettierIcon,
  "biome.json": biomeIcon,
  "biome.jsonc": biomeIcon,
  "readme.md": readmeIcon,
  license: licenseIcon,
  "license.md": licenseIcon,
  "license.txt": licenseIcon,
}

// Tool configuration files share a stem across extensions, such as `vite.config.ts` or `.mjs`.
const configStems: ReadonlyArray<readonly [string, IconifyIcon]> = [
  ["tsconfig", tsconfigIcon],
  ["jsconfig", tsconfigIcon],
  ["eslint.config.", eslintIcon],
  [".eslintrc", eslintIcon],
  ["vite.config.", viteIcon],
  ["vitest.config.", viteIcon],
  ["tailwind.config.", tailwindIcon],
  ["postcss.config.", postcssIcon],
  ["prettier.config.", prettierIcon],
  [".prettierrc", prettierIcon],
  ["next.config.", nextIcon],
]

export function FileIcon({
  path,
  size = 16,
  directory = false,
  expanded = false,
}: {
  readonly directory?: boolean
  readonly expanded?: boolean
  readonly path: string
  readonly size?: number
}): React.JSX.Element {
  const name = path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? ""
  const icon =
    filenames[name] ??
    configStems.find(([stem]) => name.startsWith(stem))?.[1] ??
    (name.startsWith(".env") ? tuneIcon : undefined) ??
    (name.endsWith(".d.ts") ? typescriptDefIcon : undefined) ??
    extensions[name.split(".").pop() ?? ""] ??
    documentIcon
  return (
    <Icon
      icon={directory ? (expanded ? folderOpenIcon : folderIcon) : icon}
      width={size}
      height={size}
      className="file-icon shrink-0"
      aria-hidden="true"
    />
  )
}
