#!/usr/bin/env bash
set -Eeuo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  printf 'sudo bash install.sh\nУстанавливает docforge в /usr/local/bin/docforge без расширения .sh.\n'; exit 0
fi
[[ $# -eq 0 ]] || { printf 'Неизвестные аргументы\n' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { printf 'Запустите через sudo\n' >&2; exit 1; }
install -m 0755 -- "$script_dir/docforge" /usr/local/bin/docforge
/usr/local/bin/docforge --version
