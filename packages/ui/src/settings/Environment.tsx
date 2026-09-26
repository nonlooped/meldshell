import { useEffect, useState } from "react"
import type { DesktopEnvironment, DesktopMode } from "@meldshell/contracts/ipc"
import { errorMessage } from "@meldshell/contracts"
import { Button, SelectField } from "../ui/controls"
import { SettingRow } from "./SettingRow"

export function Environment(): React.JSX.Element | null {
  const api = window.meldshell.desktop?.environment
  const [current, setCurrent] = useState<DesktopEnvironment | null>(null)
  const [mode, setMode] = useState<DesktopMode>("windows")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!api) return
    let disposed = false
    void api
      .get()
      .then((value) => {
        if (disposed) return
        setCurrent(value)
        setMode(value.mode)
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(errorMessage(cause))
      })
    return () => {
      disposed = true
    }
  }, [api])
  if (!api) return null
  const switchMode = async () => {
    setPending(true)
    setError(null)
    try {
      await api.switch(mode)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }
  return (
    <SettingRow
      label="Execution environment"
      controlId="execution-environment"
      description={
        <>
          {current
            ? `Currently running in ${current.mode === "windows" ? "Windows" : `WSL${current.distribution ? ` · ${current.distribution}` : ""}`}. `
            : "Loading environment. "}
          Windows runs agents, tools, and terminals directly on Windows. WSL runs them in Linux,
          with only the app on Windows. Switching restarts the app; each environment keeps its own
          threads, settings, and sign-ins.
          {error && (
            <span role="alert" className="block text-[var(--color-deleted)]">
              {error}
            </span>
          )}
        </>
      }
    >
      <div className="flex w-full flex-col gap-[8px]">
        <SelectField<DesktopMode>
          id="execution-environment"
          label="Execution environment"
          value={mode}
          disabled={pending || !current}
          options={[
            { value: "windows", label: "Windows (native)" },
            { value: "wsl", label: "WSL (Linux)" },
          ]}
          onValueChange={setMode}
        />
        {current && mode !== current.mode && (
          <Button disabled={pending} onClick={() => void switchMode()}>
            {pending ? "Switching…" : "Restart and switch"}
          </Button>
        )}
      </div>
    </SettingRow>
  )
}
