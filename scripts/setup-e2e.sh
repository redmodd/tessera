#!/usr/bin/env bash
# Bootstrap a fresh checkout to the point where `pnpm test:e2e` works.
#
# Idempotent: safe to re-run. Skips browser install if Playwright cache is hot.

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm not found. Install it (https://pnpm.io/) and re-run." >&2
  exit 1
fi

if ! node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 24 || (a === 24 && b >= 15) ? 0 : 1)'; then
  echo "error: Node 24.15+ required (found $(node -v))." >&2
  exit 1
fi

echo "==> pnpm install"
pnpm install --frozen-lockfile

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
