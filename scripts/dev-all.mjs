import concurrently from "concurrently"

console.info("Remote dashboard: http://localhost:4321/dashboard")
console.info("Press Ctrl+C to stop the desktop, account worker, and website.")

const { result } = concurrently(
  [
    { name: "desktop", command: "npm run dev" },
    { name: "control", command: "npm run control" },
    { name: "site", command: "npm run dev --workspace=@meldshell/site -- --port 4321" },
  ],
  { killOthersOn: ["success", "failure"], prefixColors: ["cyan", "magenta", "green"] },
)

try {
  await result
} catch {
  process.exitCode = 1
}
