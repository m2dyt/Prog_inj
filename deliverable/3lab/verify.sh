#!/usr/bin/env bash
set -Eeuo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
[[ ${1:-} != --help ]] || { printf 'verify.sh\nПроверить API на отдельной временной PostgreSQL в Docker. Сначала setup.sh --check.\n'; exit 0; }
[[ $# -eq 0 ]] || exit 2
[[ -f "$script_dir/.env" ]] || { printf 'Сначала bash setup.sh --check\n' >&2; exit 1; }
project="supermarket-check-$(date +%s)-$$"
compose=(docker compose --env-file "$script_dir/.env" -p "$project" -f "$script_dir/compose.test.yml")
# Only this invocation's test project is removed; application volumes are separate.
trap '"${compose[@]}" down --volumes --remove-orphans >/dev/null' EXIT
"${compose[@]}" config --quiet
"${compose[@]}" up --build --abort-on-container-exit --exit-code-from tests
