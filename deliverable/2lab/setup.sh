#!/usr/bin/env bash
set -Eeuo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
tmp_file=''
cleanup() { [[ -z "$tmp_file" ]] || rm -f -- "$tmp_file"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'printf "Ошибка в строке %s\n" "$LINENO" >&2' ERR
usage() {
  cat <<'EOF'
setup.sh [--check] [--with-redmine] [--help]
Подготавливает .env и запускает учебную среду ЛР №2.
--check          Проверить зависимости и Compose без запуска.
--with-redmine   Также запустить независимый стенд Redmine.
--help           Показать справку.
Требуются Bash 4+, Docker Engine, Compose v2, openssl.
Существующий .env и тома базы данных сохраняются. Пароли не выводятся.
EOF
}
check=0; redmine=0
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0;;
    --check) check=1;;
    --with-redmine) redmine=1;;
    *) printf 'Неизвестный аргумент: %s\n' "$1" >&2; exit 2;;
  esac
  shift
done
for command in docker openssl; do command -v "$command" >/dev/null || { printf 'Не найден %s\n' "$command" >&2; exit 1; }; done
docker compose version >/dev/null
docker info >/dev/null
if [[ ! -e "$script_dir/.env" ]]; then
  umask 077
  tmp_file=$(mktemp "$script_dir/.env.XXXXXX")
  printf 'POSTGRES_PASSWORD=%s\nHTTP_PORT=8082\nREDMINE_DB_PASSWORD=%s\nREDMINE_PORT=8085\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > "$tmp_file"
  mv -- "$tmp_file" "$script_dir/.env"; tmp_file=''
fi
for key in REDMINE_SECRET_KEY_BASE; do
  if ! grep -q "^${key}=" "$script_dir/.env"; then
    printf '%s=%s\n' "$key" "$(openssl rand -hex 32)" >> "$script_dir/.env"
  fi
done
compose=(docker compose --env-file "$script_dir/.env" -f "$script_dir/docker-compose.yml")
"${compose[@]}" config --quiet
if ((redmine)); then
  docker compose --env-file "$script_dir/.env" -f "$script_dir/redmine/docker-compose.yml" config --quiet
fi
if ((check)); then printf 'Окружение ЛР №2 проверено.\n'; exit 0; fi
"${compose[@]}" up -d --build --wait --wait-timeout 180
if ((redmine)); then
  docker compose --env-file "$script_dir/.env" -f "$script_dir/redmine/docker-compose.yml" up -d
fi
"${compose[@]}" ps
printf 'ЛР №2: среда подготовлена. Redmine настраивается по REDMINE.md через веб-интерфейс.\n'
