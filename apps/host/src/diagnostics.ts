import { Console } from "node:console"

/** Also redirects libraries, such as Effect, that captured the console before host startup. */
export function routeDiagnosticsToStderr(): void {
  Object.assign(globalThis.console, new Console(process.stderr, process.stderr))
}
