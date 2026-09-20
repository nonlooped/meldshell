# Website build and deployment

Use this document for the Astro site in `apps/site`. [vercel.json](../vercel.json) defines the site-only install/build commands and `apps/site/dist` output. Install scripts are skipped so a website deployment does not download Electron or compile SQLite.

## Git deployment

The recorded Vercel project is `fscyts-projects/meldshell`, connected to `nonlooped/meldshell`, with the repository root as Root Directory and `main` as production branch. Its deployment at [meldshell.vercel.app](https://meldshell.vercel.app) was reported verified on September 19, 2026; this documentation rewrite did not recheck the remote configuration.

The Git integration produces main-branch deployments and pull-request previews. The ignore command compares site files, root manifests, lockfile, and deployment configuration with the previous successful deployment. Missing history triggers a build. Keep `/.git` in the [`.vercelignore`](../.vercelignore) allowlist because Vercel applies that filter before running the ignore command.

The integration needs repository access. It does not require a Vercel token in GitHub Actions. Check the live project before changing connections or settings.

## CLI deployment

For an authorized setup or deployment, authenticate and link from the repository root:

```sh
npx vercel login
npx vercel link --project meldshell
npx vercel git connect https://github.com/nonlooped/meldshell.git
npx vercel --prod
```

Use the connection steps only when needed; an already-linked project does not need relinking for each deploy. Local `.vercel` credentials and project links are Git-ignored.

[.vercelignore](../.vercelignore) limits uploads to the site and root build manifests, excluding installers and local build output. Confirm the intended project, build result, and deployment URL when reporting a deployment.
