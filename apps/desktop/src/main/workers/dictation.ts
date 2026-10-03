import { runDictationWorker } from "@meldshell/host/dictation-worker"

const parentPort = process.parentPort
if (parentPort === undefined) throw new Error("Dictation must run as an Electron utility process.")
const cacheDir = process.env.MELDSHELL_DICTATION_CACHE
if (!cacheDir) throw new Error("Missing the speech model folder.")
runDictationWorker(parentPort, cacheDir)
