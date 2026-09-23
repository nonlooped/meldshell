import tailwindcss from "@tailwindcss/vite"
import sitemap from "@astrojs/sitemap"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://meldshell.nonlooped.xyz",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // Matches production, where Pages forwards /api to the account worker on the same origin.
    server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } } },
  },
})
