#!/bin/bash
# ------------------------------------------------------------------
# Publishes this folder (the master copy on Google Drive) to GitHub Pages.
#
#   ./publish.sh "Short description of the change"
#
# It keeps a working copy of the GitHub repository outside Google Drive,
# copies this folder into it, shows what changed and asks before pushing.
# Anything on GitHub that isn't in this folder is removed, so make every
# change here (not in GitHub's web editor).
# Needs: git and the GitHub CLI (gh), logged in with `gh auth login`.
# ------------------------------------------------------------------
set -euo pipefail

REPO="${DV_REPO:-Beyond-Fossil-Fuels/data-visuals}"
MESSAGE="${1:-Update data visuals}"
SRC="$(cd "$(dirname "$0")" && pwd)"
WORK="$HOME/.bff-data-visuals-publish"

if [ ! -d "$WORK/.git" ]; then
  echo "First run: cloning $REPO into $WORK"
  gh repo clone "$REPO" "$WORK"
fi
git -C "$WORK" pull --ff-only --quiet

rsync -a --delete \
  --exclude ".git" --exclude ".DS_Store" --exclude "*.gsheet" --exclude ".claude" --exclude "Icon?" \
  "$SRC/" "$WORK/"

git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "Nothing to publish: GitHub already matches this folder."
  exit 0
fi

echo "Changes to publish to $REPO:"
git -C "$WORK" diff --cached --stat
if [ "${DV_YES:-}" != "1" ]; then
  read -r -p "Publish these changes? [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || { git -C "$WORK" reset --quiet; echo "Cancelled."; exit 1; }
fi

git -C "$WORK" commit --quiet -m "$MESSAGE"
git -C "$WORK" push --quiet
echo "Published. GitHub Pages updates in about a minute."
