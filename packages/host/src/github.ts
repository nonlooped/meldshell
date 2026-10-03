import { execFile } from "node:child_process"

export class GitHubUnavailable extends Error {}

/** Runs the GitHub CLI without prompts; `input` is written to its standard input. */
export function gh(cwd: string, args: string[], input?: string, timeout = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "gh",
      args,
      {
        cwd,
        windowsHide: true,
        timeout,
        maxBuffer: 4 * 1024 * 1024,
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: "1",
          GH_NO_UPDATE_NOTIFIER: "1",
          GIT_TERMINAL_PROMPT: "0",
          NO_COLOR: "1",
        },
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        const detail = stderr.trim()
        if (error.code === "ENOENT")
          reject(
            new GitHubUnavailable(
              "Install the GitHub CLI (gh) on this computer to work with GitHub issues and pull requests.",
            ),
          )
        else if (/gh auth login|not logged in|authentication/i.test(detail))
          reject(
            new GitHubUnavailable(
              "Sign in to GitHub by running gh auth login on this computer, then refresh.",
            ),
          )
        else if (/known GitHub host|no git remotes/i.test(detail))
          reject(new GitHubUnavailable("This repository has no GitHub remote."))
        else reject(new Error(detail || "The GitHub CLI could not finish. Try again."))
      },
    )
    if (input !== undefined) child.stdin?.end(input)
  })
}
