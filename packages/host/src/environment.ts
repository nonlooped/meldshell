/**
 * This process's environment for a child it starts, without Electron's own switches: they would
 * change how a script's Node tools or an Electron-based editor start.
 */
export const childEnvironment = (
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && !key.startsWith("ELECTRON_")) env[key] = value
  return { ...env, ...extra }
}
