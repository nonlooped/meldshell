import { errorMessage, type AppUpdateStatus } from "@meldshell/contracts"
import { useEffect, useState } from "react"
import { Button, Switch } from "../ui/controls"

const buttonLabel = (status: AppUpdateStatus | null): string => {
  if (status === null) return "Loading..."
  if (status.state === "checking") return "Checking..."
  if (status.state === "downloading") {
    return status.progressPercent === null
      ? "Downloading..."
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

  const setNightly = async (nightly: boolean): Promise<void> => {
    setActionError(null)
    try {
      setStatus(await window.meldshell.setUpdateChannel(nightly ? "nightly" : "stable"))
    } catch (cause) {
      setActionError(errorMessage(cause, "Could not change the update channel."))
    }
  }

  return (
    <>
      <div className="mt-[22px] flex items-start justify-between gap-[32px]">
        <div className="min-w-0">
          <h3 className="m-0 text-[13px] font-medium text-[var(--text-primary)]">Updates</h3>
          <p
            className="[margin:5px_0_0] text-[12px] text-[var(--text-tertiary)]"
            role={status?.state === "error" || actionError !== null ? "alert" : "status"}
          >
            {actionError ?? status?.message ?? "MeldShell checks GitHub Releases automatically."}
          </p>
          {status?.state === "downloading" && status.progressPercent !== null && (
            <progress
              className="mt-[10px] block h-[4px] w-[240px] max-w-full accent-[var(--accent)]"
              value={status.progressPercent}
              max={100}
              aria-label="Update download progress"
            />
          )}
        </div>
        <Button
          size="sm"
          variant={status?.state === "ready" ? "primary" : "default"}
          disabled={busy || unavailable}
          onClick={() => void runAction()}
        >
          {buttonLabel(status)}
        </Button>
      </div>
      {status !== null && !unavailable && (
        <div className="mt-[18px] flex items-start justify-between gap-[32px]">
          <div className="min-w-0">
            <h3 className="m-0 text-[13px] font-medium text-[var(--text-primary)]">
              Nightly builds
            </h3>
            <p className="[margin:5px_0_0] text-[12px] text-[var(--text-tertiary)]">
              Get an early build of new changes every hour. Nightlies are less tested than the daily
              stable releases. Turning this off returns to the latest stable release.
            </p>
          </div>
          <Switch
            label="Nightly builds"
            checked={status.channel === "nightly"}
            disabled={busy}
            onCheckedChange={(nightly) => void setNightly(nightly)}
          />
        </div>
      )}
    </>
  )
}
