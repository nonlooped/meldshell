# Website deployment

The Astro site targets `https://meldshell.vercel.app`. [vercel.json](../vercel.json) builds from the repository root with Node.js 24, installs only the site workspace, and skips install scripts so website builds do not download Electron or compile SQLite. Astro emits static files into `apps/site/dist`.

Connect the Vercel project named `meldshell` to `nonlooped/meldshell`, with the repository root as Root Directory and `main` as the production branch. Vercel's Git integration builds production on pushes to `main` and previews for pull requests. The ignore command compares against the previous successful deployment and skips builds when the site, workspace manifests, lockfile, and Vercel configuration have not changed. Missing deployment history triggers a build.

After `npx vercel login`, run `npx vercel link --project meldshell` from the repository root, connect with `npx vercel git connect https://github.com/nonlooped/meldshell.git`, and deploy with `npx vercel --prod`. The GitHub integration must have access to the private repository. Local `.vercel` credentials and project links are ignored by Git.

The project connection and hostname must be confirmed in Vercel before treating deployment as complete. No Vercel token is needed in GitHub Actions when using the Git integration.
