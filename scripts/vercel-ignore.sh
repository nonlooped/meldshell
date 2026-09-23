#!/bin/sh
# Vercel ignoreCommand: exit 0 skips the site deployment when none of its inputs changed since the
# last deployed commit. vercel.json caps ignoreCommand at 256 characters, so the path list lives here.
test -n "$VERCEL_GIT_PREVIOUS_SHA" && git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \
  apps/site \
  apps/desktop/src/renderer \
  apps/desktop/package.json \
  packages/contracts \
  packages/projection \
  tsconfig.base.json \
  package.json \
  package-lock.json \
  vercel.json \
  .vercelignore \
  scripts/vercel-ignore.sh
