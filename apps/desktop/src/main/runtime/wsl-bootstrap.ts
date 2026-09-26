/** Fixed shell program. Paths and distribution names are always separate argv values. */
export const WSL_BOOTSTRAP = String.raw`
set -eu
command -v node >/dev/null || { echo 'Install Linux Node.js 24 or newer and npm in this WSL distribution.' >&2; exit 1; }
node -e 'if(process.platform !== "linux" || +process.versions.node.split(".")[0] < 24) process.exit(1)' || { echo 'MeldShell requires Linux Node.js 24 or newer.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'Install npm in this WSL distribution.' >&2; exit 1; }
export PATH="$(node -e 'process.stdout.write(process.env.PATH.split(":").filter(p => p.startsWith("/") && !/^\/mnt\/[a-z](\/|$)/i.test(p)).join(":"))')"
source_dir="$(wslpath -a -u "$1")"
abi="$(node -p 'process.versions.modules + "-" + process.arch')"
cache_dir="$HOME/.cache/meldshell/hosts"
target="$cache_dir/$2-$abi"
mkdir -p "$cache_dir"
if [ ! -f "$target/.ready" ]; then
  stage="$(mktemp -d "$cache_dir/.install-XXXXXXXX")"
  trap 'rm -rf "$stage"' EXIT
  cp -R "$source_dir/." "$stage/"
  echo 'Preparing the Linux MeldShell host. First launch downloads dependencies and builds the terminal addon.' >&2
  npm ci --prefix "$stage" --ignore-scripts --omit=optional --no-audit --no-fund </dev/null
  npm rebuild --prefix "$stage" node-pty --ignore-scripts=false --no-audit --no-fund </dev/null || { echo 'The Linux terminal addon requires Python 3, make, and a C++ compiler. Install these in WSL, then retry.' >&2; exit 1; }
  node -e 'const load = require("node:module").createRequire(process.argv[1] + "/package.json"); load("node-pty"); load("better-sqlite3")' "$stage"
  touch "$stage/.ready"
  if [ -d "$target" ]; then rm -rf "$stage"; else mv "$stage" "$target"; fi
  trap - EXIT
  for old in "$cache_dir"/* "$cache_dir"/.install-*; do
    [ -e "$old" ] && [ "$old" != "$target" ] && rm -rf "$old"
  done
fi
cd "$HOME"
exec node "$target/desktop.js" 1>&3 3>&-
`

export const wslArguments = (distribution: string, payload: string, digest: string): string[] => [
  "--distribution",
  distribution,
  "--cd",
  "~",
  "--exec",
  "/bin/sh",
  "-c",
  // Startup-file chatter goes to diagnostics; only the host can write to the protocol pipe.
  'exec 3>&1; exec 1>&2; exec /bin/bash -lic "$1" meldshell "$2" "$3"',
  "meldshell",
  WSL_BOOTSTRAP,
  payload,
  digest,
]
