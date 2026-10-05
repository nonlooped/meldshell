# Remote access

Remote access lets you open the threads, files, terminals, and approvals of a computer running MeldShell from a browser on your phone or another computer. The agents keep running on the linked computer; the browser only drives them. This guide covers linking a computer, using it remotely, what the relay can see, headless hosts, and troubleshooting.

## Link a computer

On the computer where your workspaces live, open **Settings → Account & devices** and choose **Sign in with browser**. MeldShell opens your account page in your default browser and shows a confirmation code in Settings.

1. Sign in on the page with Google or Discord. Providers that share a verified email sign in to the same account.
2. Check that the page shows the same code as Settings, then choose **Connect this computer**. The code expires after fifteen minutes at most; **Cancel** in Settings abandons the sign-in so you can start another at once.
3. Settings switches to the linked view on its own and shows the computer as **Online** once it reaches the relay.

Linking stores a revocable device credential in `remote-credential.json` inside the data directory, next to a stable `device-id`. Provider logins never leave the computer. In the Windows app, Windows mode and WSL mode each have their own data directory and so their own link; see the [Windows and WSL guide](wsl.md).

## Open it from your phone

Once linked, Settings shows **Open on your phone**: a QR code for your devices page and the same link as text. Point your phone's camera at the code, sign in with the same account, and choose the computer. Any browser works the same way at the page's address; **Copy link** puts it on the clipboard and **Open devices page** opens it on the host.

The devices page lists every linked computer with whether it is online and when it was last seen. **Open** attaches the browser to an online computer. **Rename** gives a computer a name other than its hostname; the name shows on the devices page and in Settings on that computer the next time it signs in, and signing in again from the computer keeps it. **Remove** revokes the computer's credential, which disconnects every browser attached to it and shows the computer as **Removed** in its Settings until someone signs in again there.

## Working remotely

The browser shows the same renderer as the desktop. Its title bar names the computer where the desktop shows the MeldShell mark; the chip's dot reflects the connection, and its menu explains the state, goes back to the devices page, and, after access ends, tries connecting again.

While a browser is attached, the desktop's title bar shows a device icon with a green dot. Its tooltip says how many browsers are connected, and clicking it opens Account & devices, which lists the count beside the computer's status. Remote control is never invisible on the host.

What works remotely:

- Threads, prompts, approvals, queues, side questions, dictation (the host transcribes), attachments (images are sent as content), files, and Git.
- Browsing host folders to add workspaces, terminals and run scripts, checking and installing host updates, changing the update channel, restarting or shutting down the host, and switching between Windows and WSL on a Windows host. Each of these asks for confirmation in the browser.
- The browser preview on a desktop host, rendered on the host and streamed as images, so local development servers stay where they run.

What stays on the host: opening files in an editor or file manager, popping threads out into windows, and the agents' own browser tools. Transcript results larger than the relay's frame limit ask you to open a smaller window or view them on the host.

If the connection drops, a pill under the title bar says that MeldShell is reconnecting or that the computer is offline, and the transport reconnects on its own. Prompts and terminal input that were in flight when the connection dropped are never resent automatically; check the conversation before sending again. Terminals keep their processes for five minutes through a disconnect and replay what was printed meanwhile. If the computer is removed from the account or the browser's session ends, a dialog covers the window with the way back to the devices page.

## Headless hosts

A server without a screen runs the same host from the repository. Link it once as the user that owns the workspaces and provider logins, then start it:

```sh
npm run host -- link --control https://meldshell.nonlooped.xyz --data-dir /var/lib/meldshell
npm run host -- --data-dir /var/lib/meldshell --workspace /srv/project
```

`link` prints the page to open and the code to confirm, waits for the browser, and reports the account and name it linked under. Ctrl+C cancels a link that is still waiting. `unlink` removes the credential; the host stays listed on the devices page until you remove it there. The host logs whether it is linked when it starts. A headless host reports that its updates and lifecycle belong to its service manager, so the browser's update and host controls are unavailable for it.

## Privacy and security

Traffic between the browser and the computer passes through a relay run by the operator of the account service, who can read and send prompts, output, and file contents for linked computers. Provider credentials, the device credential, and your data stay on the linked computer; the relay persists only presence.

Each computer's credential is bound to one account and one device identity, and signing in again rotates it. Removing a computer on the devices page or signing out of a browser disconnects at once. Browsers connected to a computer are rechecked against their session and the computer's credential every minute, and browsers only connect from the account service's own origin.

## Troubleshooting

| What you see | What it means |
| --- | --- |
| **Offline** with **Retry now** in Settings | The host cannot reach the relay. It keeps retrying with backoff; Retry now reconnects immediately. Agents are unaffected. |
| **Removed** in Settings | The computer was removed on the devices page. Sign in again to relink it. |
| **Unavailable** in Settings | The saved credential could not be read. Sign out and sign in again to replace it. |
| "This code has expired or doesn't exist" on the confirm page | The code ran out. Cancel in Settings if it is still showing, then sign in again for a new one. |
| "Host offline" when opening a computer | MeldShell is not running there, or it has not reconnected yet. Open MeldShell on that computer; the page retries on its own. |
| "Update MeldShell on the host computer to use this remotely" | The browser is newer than the host. Install the current MeldShell on the host. |
| A browser you did not open appears in the viewer count | Remove the computer from the devices page, then sign in again on the host to issue a fresh credential. |
