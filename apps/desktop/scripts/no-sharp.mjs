/*
 * transformers.js imports sharp for image inputs. Dictation only reads audio, so builds alias sharp
 * to this module instead of shipping its native image library.
 */
export default function sharp() {
  throw new Error("MeldShell does not bundle image processing for local models.")
}
