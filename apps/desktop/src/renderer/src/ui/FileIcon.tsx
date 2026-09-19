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
  toml: settingsIcon,
  ini: settingsIcon,
  env: settingsIcon,
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
}

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
    (name.startsWith(".env.") ? settingsIcon : extensions[name.split(".").pop() ?? ""]) ??
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
