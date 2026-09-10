#!/usr/bin/env bash
set -Eeuo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  printf 'setup.sh [--check]\nСоздаёт .env и запускает ЛР №3. Требуются Docker Compose v2 и openssl.\n'; exit 0
fi
[[ $# -eq 0 || ( $# -eq 1 && $1 == --check ) ]] || { printf 'Неверные аргументы\n' >&2; exit 2; }
for cmd in docker openssl; do command -v "$cmd" >/dev/null || { printf 'Не найден %s\n' "$cmd" >&2; exit 1; }; done
docker compose version >/dev/null; docker info >/dev/null
tmp_file=''
trap '[[ -z "$tmp_file" ]] || rm -f -- "$tmp_file"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ ! -e "$script_dir/.env" ]]; then
  umask 077; tmp_file=$(mktemp "$script_dir/.env.XXXXXX")
  for key in POSTGRES_PASSWORD APP_DB_PASSWORD ADMIN_DB_PASSWORD MANAGER_PASSWORD CASHIER_PASSWORD AUDITOR_PASSWORD; do
    printf '%s=%s\n' "$key" "$(openssl rand -hex 18)" >> "$tmp_file"
  done
  printf 'HTTP_PORT=8083\n' >> "$tmp_file"
  mv -- "$tmp_file" "$script_dir/.env"; tmp_file=''
fi
compose=(docker compose --env-file "$script_dir/.env" -f "$script_dir/docker-compose.yml")
"${compose[@]}" config --quiet
[[ ${1:-} != --check ]] || exit 0
"${compose[@]}" up -d --build --wait --wait-timeout 240
"${compose[@]}" ps
printf 'ЛР №3 запущена. Пароли находятся в .env; они не выводились в журнал.\n'
