#!/usr/bin/env bash
# Bootstrap a fresh checkout to the point where `pnpm test:e2e` works.
#
# Idempotent — safe to re-run. Skips browser install if Playwright cache is hot.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found. Install it (https://pnpm.io/) and re-run." >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "error: Node 24+ required (found $(node -v))." >&2
  exit 1
fi

echo "==> pnpm install"
pnpm install --no-frozen-lockfile

echo "==> Building packages (tessera-learn plugin must be built before fixtures resolve it)"
pnpm build

echo "==> Installing Playwright chromium + system deps"
pnpm exec playwright install --with-deps chromium

cat <<'EOF'

Done. To run tests:
  pnpm test            # unit tests (both packages)
  pnpm test:e2e        # end-to-end (Playwright)

See TESTING.md for single-test runs, debugging, and the variant pre-build.
EOF
