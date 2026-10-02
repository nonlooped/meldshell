import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { expect } from "e2e"
import { test } from "./desktop"

test.describe("Desktop journeys", { platforms: ["desktop"] }, () => {
  test("a returning user keeps renamed workspaces and threads after a full restart", async ({
    desktop,
  }) => {
    const workspace = await desktop.addWorkspace()
    const created = await desktop.call("createThread", {
      workspaceId: workspace.id,
      title: "Investigate login",
    })
    const thread = created.threads.find((item) => item.title === "Investigate login")!
    await desktop.call("renameWorkspace", { workspaceId: workspace.id, name: "Customer portal" })
    await desktop.call("renameThread", { threadId: thread.id, title: "Repair login" })
    await desktop.restart()
    const restored = await desktop.call("getSnapshot")
    expect(restored.workspaces.find((item) => item.id === workspace.id)?.name).toBe(
      "Customer portal",
    )
    expect(restored.threads.find((item) => item.id === thread.id)?.title).toBe("Repair login")
    // The restarted core client still routes replies and round-trips typed core errors.
    const rejection = await desktop.page.evaluate(async (threadId) => {
      try {
        await window.meldshell.submitTurn({ threadId, text: " " })
        return null
      } catch (error) {
        return String(error)
      }
    }, thread.id)
    expect(rejection).toContain("A turn needs text or an attachment.")
    await desktop.page
      .getByRole("button", { name: "Search threads and messages", exact: true })
      .click()
    await desktop.page
      .getByText("Customer portal", { exact: true })
      .first()
      .waitFor({ state: "visible" })
    await desktop.page
      .getByText("Repair login", { exact: true })
      .first()
      .waitFor({ state: "visible" })
  })

  test("archiving and deleting one thread preserves its active sibling", async ({ desktop }) => {
    const workspace = await desktop.addWorkspace()
    await desktop.call("createThread", { workspaceId: workspace.id, title: "Keep this work" })
    const created = await desktop.call("createThread", {
      workspaceId: workspace.id,
      title: "Finished work",
    })
    const archived = created.threads.find((item) => item.title === "Finished work")!
    const sibling = created.threads.find((item) => item.title === "Keep this work")!
    await desktop.call("setThreadStatus", { threadId: archived.id, status: "settled" })
    await desktop.restart()
    const restored = await desktop.call("getSnapshot")
    expect(restored.threads.find((item) => item.id === archived.id)?.status).toBe("settled")
    await desktop.call("deleteThread", archived.id)
    await desktop.restart()
    const remaining = await desktop.call("getSnapshot")
    expect(remaining.threads.some((item) => item.id === archived.id)).toBe(false)
    expect(remaining.threads.find((item) => item.id === sibling.id)?.status).toBe("active")
    await desktop.page
      .getByRole("button", { name: "Search threads and messages", exact: true })
      .click()
    await desktop.page
      .getByText("Keep this work", { exact: true })
      .first()
      .waitFor({ state: "visible" })
  })

  test("preferences changed through Settings survive restart and render the chosen theme", async ({
    desktop,
  }) => {
    await desktop.page.getByRole("button", { name: /^Settings/ }).click()
    const archived = desktop.page.getByRole("switch", {
      name: "Show archived threads",
      exact: true,
    })
    await archived.click()
    await desktop.page.getByRole("tab", { name: "Appearance", exact: true }).click()
    await desktop.page.getByRole("combobox", { name: "Theme", exact: true }).click()
    await desktop.page.getByRole("option", { name: "Light", exact: true }).click()
    await expect
      .poll(async () => {
        const snapshot = await desktop.call("getSnapshot")
        return { theme: snapshot.settings.theme, showSettled: snapshot.settings.showSettled }
      })
      .toEqual({ theme: "light", showSettled: false })
    await desktop.restart()
    const restored = await desktop.call("getSnapshot")
    expect(restored.settings.theme).toBe("light")
    expect(restored.settings.showSettled).toBe(false)
    await desktop.page.waitForFunction(() => document.documentElement.dataset.theme === "light")
  })

  test("workspace file operations round trip Unicode names and reject escaping the workspace", async ({
    desktop,
  }) => {
    const workspace = await desktop.addWorkspace()
    const scope = { workspaceId: workspace.id }
    await desktop.call("workspaceFileAction", {
      ...scope,
      path: "",
      action: "create-file",
      name: "notes café.md",
    })
    await writeFile(
      join(desktop.workspace, "notes café.md"),
      "# Résumé\nA real file, not a mock.\n",
    )
    expect(
      (await desktop.call("readWorkspaceFile", { ...scope, path: "notes café.md" })).content,
    ).toContain("A real file")
    await desktop.call("workspaceFileAction", {
      ...scope,
      path: "notes café.md",
      action: "rename",
      name: "résumé.md",
    })
    expect(
      (await desktop.call("listDirectory", { ...scope, path: "" })).some(
        (item) => item.name === "résumé.md",
      ),
    ).toBe(true)
    const outside = join(desktop.directory, "private.txt")
    await writeFile(outside, "outside workspace")
    const rejection = await desktop.page.evaluate(async (scope) => {
      try {
        await window.meldshell.workspaceFileAction({
          ...scope,
          path: "../private.txt",
          action: "delete",
        })
        return null
      } catch (error) {
        return String(error)
      }
    }, scope)
    expect(rejection).toContain("inside the workspace")
    expect(await readFile(outside, "utf8")).toBe("outside workspace")
    await desktop.call("workspaceFileAction", { ...scope, path: "résumé.md", action: "delete" })
    expect(
      (await desktop.call("listDirectory", { ...scope, path: "" })).some(
        (item) => item.name === "résumé.md",
      ),
    ).toBe(false)
  })

  test("an isolated thread edits its worktree without changing the shared checkout", async ({
    desktop,
  }) => {
    const workspace = await desktop.addWorkspace()
    const created = await desktop.call("createThread", {
      workspaceId: workspace.id,
      title: "Isolated repair",
      isolated: true,
    })
    const thread = created.threads.find((item) => item.title === "Isolated repair")!
    expect(thread.worktree !== null).toBe(true)
    const scope = { workspaceId: workspace.id, threadId: thread.id }
    await desktop.call("workspaceFileAction", {
      ...scope,
      path: "",
      action: "create-file",
      name: "isolated.txt",
    })
    expect(
      (await desktop.call("listDirectory", { ...scope, path: "" })).some(
        (item) => item.name === "isolated.txt",
      ),
    ).toBe(true)
    expect(
      (await desktop.call("listDirectory", { workspaceId: workspace.id, path: "" })).some(
        (item) => item.name === "isolated.txt",
      ),
    ).toBe(false)
    await desktop.restart()
    expect(
      (await desktop.call("getSnapshot")).threads.find((item) => item.id === thread.id)?.worktree
        ?.path,
    ).toBe(thread.worktree?.path)
    expect(
      (await desktop.call("listDirectory", { ...scope, path: "" })).some(
        (item) => item.name === "isolated.txt",
      ),
    ).toBe(true)
  })

  test("custom provider model edits persist and deletion leaves the rest of the catalog intact", async ({
    desktop,
  }) => {
    const initial = await desktop.call("getSnapshot")
    const provider = initial.providers.find((item) => item.harness === "codex")!
    const created = await desktop.call("upsertModel", {
      providerId: provider.id,
      slug: "e2e-local-model",
      displayName: "Offline test model",
      enabled: true,
    })
    const model = created.models.find((item) => item.slug === "e2e-local-model")!
    await desktop.call("upsertModel", {
      providerId: provider.id,
      modelId: model.id,
      displayName: "Renamed test model",
      enabled: false,
    })
    await desktop.restart()
    const restored = await desktop.call("getSnapshot")
    expect(restored.models.find((item) => item.id === model.id)?.displayName).toBe(
      "Renamed test model",
    )
    expect(restored.models.find((item) => item.id === model.id)?.enabled).toBe(false)
    await desktop.call("deleteModel", model.id)
    const final = await desktop.call("getSnapshot")
    expect(final.models.some((item) => item.id === model.id)).toBe(false)
    expect(
      final.models
        .filter((item) => item.providerId === provider.id)
        .map((item) => item.id)
        .sort(),
    ).toEqual(
      initial.models
        .filter((item) => item.providerId === provider.id)
        .map((item) => item.id)
        .sort(),
    )
  })
  test("a terminal runs a real command in its thread workspace and can be closed", async ({
    desktop,
  }) => {
    const workspace = await desktop.addWorkspace()
    const snapshot = await desktop.call("createThread", {
      workspaceId: workspace.id,
      title: "Terminal work",
    })
    const thread = snapshot.threads.find((item) => item.title === "Terminal work")!
    const session = await desktop.page.evaluate(
      async ({ workspaceId, threadId }) => {
        const terminal = window.meldshell.terminal
        if (!terminal) throw new Error("Desktop terminal API missing")
        const session = await terminal.open({
          id: "e2e-terminal",
          workspaceId,
          threadId,
          cols: 80,
          rows: 24,
        })
        terminal.resize("e2e-terminal", 100, 30)
        terminal.write(
          "e2e-terminal",
          `node -e "require('fs').writeFileSync('terminal-result.txt','host-process')"\r`,
        )
        return session
      },
      { workspaceId: workspace.id, threadId: thread.id },
    )
    try {
      expect(session.cwd).toBe(desktop.workspace)
      await expect
        .poll(
          async () => {
            try {
              return await readFile(join(desktop.workspace, "terminal-result.txt"), "utf8")
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
              throw error
            }
          },
          { timeout: 10_000 },
        )
        .toBe("host-process")
    } finally {
      await desktop.page.evaluate(() => window.meldshell.terminal?.close("e2e-terminal"))
    }
  })

  test("a paused schedule can be revised and resumed after restart without affecting another thread", async ({
    desktop,
  }) => {
    const workspace = await desktop.addWorkspace()
    const created = await desktop.call("createThread", {
      workspaceId: workspace.id,
      title: "Scheduled review",
    })
    const first = created.threads.find((item) => item.title === "Scheduled review")!
    const other = await desktop.call("createThread", {
      workspaceId: workspace.id,
      title: "Independent review",
    })
    const second = other.threads.find((item) => item.title === "Independent review")!
    const at = new Date(Date.now() + 365 * 86_400_000).toISOString()
    const cadence = { kind: "once" as const, at }
    const paused = await desktop.call("saveSchedule", {
      threadId: first.id,
      prompt: "Review the changes",
      cadence,
      enabled: false,
    })
    const sibling = await desktop.call("saveSchedule", {
      threadId: second.id,
      prompt: "Review independently",
      cadence,
      enabled: false,
    })
    expect(paused.nextRunAt).toBe(null)
    await desktop.restart()
    expect((await desktop.call("listSchedules", { threadId: first.id }))[0]?.id).toBe(paused.id)
    await desktop.call("saveSchedule", {
      id: paused.id,
      threadId: first.id,
      prompt: "Review the revised scope",
      cadence,
      enabled: true,
    })
    await desktop.restart()
    const resumed = (await desktop.call("listSchedules", { threadId: first.id }))[0]!
    expect(resumed.enabled).toBe(true)
    expect(resumed.nextRunAt).toBe(at)
    expect(resumed.prompt).toBe("Review the revised scope")
    await desktop.call("deleteSchedule", resumed.id)
    expect(await desktop.call("listSchedules", { threadId: first.id })).toEqual([])
    expect((await desktop.call("listSchedules", { threadId: second.id }))[0]?.id).toBe(sibling.id)
  })
})
