import { app } from "electron"

// The installed app shares this package's name, and with it the user-data directory, single-instance
// lock, and database. Development keeps its own so it can run beside an installed MeldShell.
// Imported first: other modules read user data while loading.
if (!app.isPackaged) app.setPath("userData", `${app.getPath("userData")}-dev`)
