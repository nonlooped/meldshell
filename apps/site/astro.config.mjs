import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://meldshell.dev",
  vite: {
    plugins: [tailwindcss()],
  },
})
