#!/bin/sh
# Vercel ignoreCommand: exit 0 skips the site deployment when none of its inputs changed since the
# last deployed commit, and exit 1 builds. vercel.json caps ignoreCommand at 256 characters, so the
# path list lives here. Vercel clones shallowly, so a previous commit outside the clone is fetched,
# and the site builds whenever the comparison cannot run; any other exit code fails the deployment.
previous="$VERCEL_GIT_PREVIOUS_SHA"
test -n "$previous" || exit 1
git cat-file -e "$previous^{commit}" 2>/dev/null ||
  git fetch --quiet --depth=1 origin "$previous" 2>/dev/null ||
  exit 1
git diff --quiet "$previous" HEAD -- \
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
  scripts/vercel-ignore.sh ||
  exit 1
