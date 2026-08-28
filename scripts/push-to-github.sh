#!/usr/bin/env bash
# Push PreMove Scanner to GitHub (run after setting GITHUB_TOKEN)
set -euo pipefail

REPO_NAME="${1:-premove-scanner}"
GITHUB_USER="${2:-}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Error: Set GITHUB_TOKEN first."
  echo "Create one at: https://github.com/settings/tokens/new (repo scope)"
  exit 1
fi

cd "$(dirname "$0")"

if [ -z "$GITHUB_USER" ]; then
  GITHUB_USER=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | python3 -c "import sys,json; print(json.load(sys.stdin)['login'])")
fi

echo "Creating repo: $GITHUB_USER/$REPO_NAME"

curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"description\":\"Pre-move confluence scanner powered by Unusual Whales API\",\"private\":false}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('html_url', d.get('message','')))"

git remote remove origin 2>/dev/null || true
git remote add origin "https://$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git"
git push -u origin cursor/premove-scanner-quantdata-7d09:main

echo ""
echo "Done! Repo: https://github.com/$GITHUB_USER/$REPO_NAME"
