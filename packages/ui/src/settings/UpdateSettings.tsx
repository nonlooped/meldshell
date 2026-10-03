import { errorMessage, type AppUpdateStatus } from "@meldshell/contracts"
import { useEffect, useState } from "react"
import { Button, SelectField } from "../ui/controls"
import { SettingRow } from "./SettingRow"

const buttonLabel = (status: AppUpdateStatus | null): string => {
  if (status === null) return "Loading…"
  if (status.state === "checking") return "Checking…"
  if (status.state === "downloading") {
    return status.progressPercent === null
      ? "Downloading…"
      : `Downloading ${Math.round(status.progressPercent)}%`
  }
  if (status.state === "ready") return "Restart and update"
  return "Check for updates"
}

export function UpdateSettings(): React.JSX.Element {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const unsubscribe = window.meldshell.onUpdateStatus((next) => {
      if (active) setStatus(next)
    })
    void window.meldshell
      .getUpdateStatus()
      .then((next) => {
        if (active) setStatus(next)
      })
      .catch((cause: unknown) => {
        if (active) {
          setActionError(errorMessage(cause, "Could not read update status."))
        }
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const busy = status === null || status.state === "checking" || status.state === "downloading"
  const unavailable = status?.state === "unavailable"

  const runAction = async (): Promise<void> => {
    setActionError(null)
    try {
      if (status?.state === "ready") {
        await window.meldshell.installUpdate()
      } else {
        setStatus(await window.meldshell.checkForUpdates())
      }
    } catch (cause) {
      setActionError(errorMessage(cause, "The update action failed."))
    }
  }

  const setChannel = async (channel: "stable" | "nightly"): Promise<void> => {
    setActionError(null)
    try {
      setStatus(await window.meldshell.setUpdateChannel(channel))
    } catch (cause) {
      setActionError(errorMessage(cause, "Could not change the update channel."))
    }
  }

  const failed = status?.state === "error" || actionError !== null
  return (
    <>
      <SettingRow
        label="MeldShell updates"
        description={
          <span className="flex flex-col gap-[8px]">
            <span
              role={failed ? "alert" : "status"}
              className={failed ? "text-[var(--color-deleted)]" : undefined}
            >
              {actionError ?? status?.message ?? "MeldShell checks GitHub Releases automatically."}
            </span>
            {status?.state === "downloading" && status.progressPercent !== null && (
              <span
                className="block w-[240px] max-w-full h-[4px] overflow-hidden rounded-full bg-[var(--surface-active)]"
                role="progressbar"
                aria-label="Update download progress"
                aria-valuenow={Math.round(status.progressPercent)}
              >
                <span
                  className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                  style={{ width: `${status.progressPercent}%` }}
                />
              </span>
            )}
          </span>
        }
      >
        <Button
          variant={status?.state === "ready" ? "primary" : "default"}
          disabled={busy || unavailable}
          onClick={() => void runAction()}
        >
          {buttonLabel(status)}
        </Button>
      </SettingRow>
      {status !== null && !unavailable && (
        <SettingRow
          label="Release channel"
          description="Stable releases arrive daily. Nightly builds include new changes every hour and are less tested. Choosing Stable returns to the latest stable release."
        >
          <SelectField
            label="Release channel"
            value={status.channel}
            options={[
              { value: "stable", label: "Stable" },
              { value: "nightly", label: "Nightly" },
            ]}
            disabled={busy}
            onValueChange={(channel) => void setChannel(channel)}
          />
        </SettingRow>
      )}
    </>
  )
}
