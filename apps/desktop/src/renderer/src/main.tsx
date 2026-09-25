import { mount } from "@meldshell/ui"
import desktopPackage from "../../../package.json"

mount({ version: desktopPackage.version, electronVersion: desktopPackage.devDependencies.electron })
