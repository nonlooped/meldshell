import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://meldshell.vercel.app",
  vite: {
    plugins: [tailwindcss()],
  },
})
