export function downloadPlatform(userAgent: string) {
  if (/Android|iPhone|iPad|iPod|CrOS|Mobile|aarch64|arm64/i.test(userAgent)) return null
  if (/Windows NT/i.test(userAgent)) return { name: "Windows", extension: ".exe" }
  if (/Linux/i.test(userAgent)) return { name: "Linux", extension: ".AppImage" }
  return null
}
