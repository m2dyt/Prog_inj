#!/usr/bin/env bash
# Автоматический набор тестов для утилиты netconfig (ЛР №4, вариант 6).
set -Eeuo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)
netcfg="${script_dir}/../netconfig"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NOFORMAT='\033[0m'

test_count=0
fail_count=0

pass() {
  local name=$1
  echo -e "  [${GREEN}PASS${NOFORMAT}] ${name}"
}

fail() {
  local name=$1
  local reason=${2:-""}
  echo -e "  [${RED}FAIL${NOFORMAT}] ${name} - ${reason}"
  (( ++fail_count ))
}

run_test() {
  local name=$1
  shift
  (( ++test_count ))
  if "$@"; then
    pass "$name"
  else
    fail "$name" "Command returned non-zero exit code"
  fi
}

echo -e "${CYAN}=== Запуск тестов для утилиты netconfig ===${NOFORMAT}"

test_dir=$(mktemp -d "/tmp/netconfig-test.XXXXXX")
cleanup() {
  rm -rf "$test_dir"
}
trap cleanup EXIT

test_config="${test_dir}/interfaces"

# 1. Проверка справки и версии
test_help_version() {
  bash "$netcfg" --help >/dev/null
  bash "$netcfg" --version >/dev/null
}
run_test "Проверка --help и --version" test_help_version

# 2. Проверка обработки ошибок аргументов
test_invalid_args() {
  if bash "$netcfg" 2>/dev/null; then return 1; fi
  if bash "$netcfg" unknown-cmd 2>/dev/null; then return 1; fi
  if bash "$netcfg" --config "$test_config" set-iface eth0 2>/dev/null; then return 1; fi
  if bash "$netcfg" --config "$test_config" set-iface eth0 --ip 999.1.1.1 --netmask 255.255.255.0 2>/dev/null; then return 1; fi
  if bash "$netcfg" --config "$test_config" set-iface eth0 --ip 192.168.1.10 --netmask 255.255.255.123 2>/dev/null; then return 1; fi
  return 0
}
run_test "Проверка обработки некорректных аргументов и IP" test_invalid_args

# 3. Настройка статического сетевого интерфейса (IP, маска, шлюз)
test_set_iface_static() {
  bash "$netcfg" --config "$test_config" set-iface eth0 \
    --ip 192.168.10.50 \
    --netmask 255.255.255.0 \
    --gateway 192.168.10.1

  grep -q "auto eth0" "$test_config" || return 1
  grep -q "iface eth0 inet static" "$test_config" || return 1
  grep -q "address 192.168.10.50" "$test_config" || return 1
  grep -q "netmask 255.255.255.0" "$test_config" || return 1
  grep -q "gateway 192.168.10.1" "$test_config" || return 1
  return 0
}
run_test "Настройка статического интерфейса eth0 (IP, маска, шлюз)" test_set_iface_static

# 4. Настройка интерфейса через нотацию CIDR
test_set_iface_cidr() {
  bash "$netcfg" --config "$test_config" set-iface eth1 \
    --ip 10.0.5.100/24

  grep -q "auto eth1" "$test_config" || return 1
  grep -q "iface eth1 inet static" "$test_config" || return 1
  grep -q "address 10.0.5.100" "$test_config" || return 1
  grep -q "netmask 255.255.255.0" "$test_config" || return 1
  return 0
}
run_test "Настройка интерфейса eth1 через CIDR (10.0.5.100/24)" test_set_iface_cidr

# 5. Идемпотентность обновления конфигурации интерфейса
test_iface_update_idempotent() {
  bash "$netcfg" --config "$test_config" set-iface eth0 \
    --ip 192.168.10.60 \
    --netmask 255.255.255.0 \
    --gateway 192.168.10.254

  local count
  count=$(grep -c "iface eth0 inet static" "$test_config")
  [[ $count -eq 1 ]] || return 1
  grep -q "address 192.168.10.60" "$test_config" || return 1
  grep -q "gateway 192.168.10.254" "$test_config" || return 1
  return 0
}
run_test "Идемпотентное обновление настроек интерфейса eth0" test_iface_update_idempotent

# 6. Добавление персистентного статического маршрута
test_add_route() {
  bash "$netcfg" --config "$test_config" add-route eth0 \
    --network 172.16.0.0/16 \
    --via 192.168.10.254

  grep -q "up ip route add 172.16.0.0/16 via 192.168.10.254 dev eth0 || true" "$test_config" || return 1
  grep -q "down ip route del 172.16.0.0/16 via 192.168.10.254 dev eth0 || true" "$test_config" || return 1
  return 0
}
run_test "Добавление персистентного маршрута (172.16.0.0/16 via 192.168.10.254)" test_add_route

# 7. Проверка исключения дублирования маршрута
test_route_no_duplicate() {
  bash "$netcfg" --config "$test_config" add-route eth0 \
    --network 172.16.0.0/16 \
    --via 192.168.10.254

  local count
  count=$(grep -c "up ip route add 172.16.0.0/16 via 192.168.10.254" "$test_config")
  [[ $count -eq 1 ]] || return 1
  return 0
}
run_test "Защита от дублирования идентичного маршрута" test_route_no_duplicate

# 8. Создание сетевого моста (bridge) с привязкой интерфейсов
test_create_bridge() {
  bash "$netcfg" --config "$test_config" create-bridge br0 \
    --ports eth1,eth2 \
    --ip 192.168.100.1/24 \
    --stp off \
    --fd 0

  grep -q "auto br0" "$test_config" || return 1
  grep -q "iface br0 inet static" "$test_config" || return 1
  grep -q "address 192.168.100.1" "$test_config" || return 1
  grep -q "bridge_ports eth1 eth2" "$test_config" || return 1
  grep -q "bridge_stp off" "$test_config" || return 1
  grep -q "bridge_fd 0" "$test_config" || return 1
  return 0
}
run_test "Создание сетевого моста br0 с подчиненными портами eth1 eth2" test_create_bridge

# 9. Удаление статического маршрута
test_del_route() {
  bash "$netcfg" --config "$test_config" del-route eth0 \
    --network 172.16.0.0/16

  if grep -q "172.16.0.0/16" "$test_config"; then
    return 1
  fi
  return 0
}
run_test "Удаление статического маршрута из конфигурации eth0" test_del_route

# 10. Удаление интерфейса / моста
test_del_iface() {
  bash "$netcfg" --config "$test_config" del-iface eth1
  if grep -q "iface eth1" "$test_config"; then
    return 1
  fi
  return 0
}
run_test "Удаление интерфейса eth1 из файла конфигурации" test_del_iface

# 11. Проверка синтаксиса (validate)
test_validate() {
  bash "$netcfg" --config "$test_config" validate >/dev/null
}
run_test "Валидация синтаксиса и структуры конфигурации (validate)" test_validate

# 12. Проверка отображения (show)
test_show() {
  local out
  out=$(bash "$netcfg" --config "$test_config" show)
  echo "$out" | grep -q "eth0" || return 1
  echo "$out" | grep -q "br0" || return 1
  return 0
}
run_test "Отображение состояния интерфейсов и мостов (show)" test_show

# 13. Проверка режима dry-run (без изменения файла)
test_dry_run() {
  local mtime_before
  mtime_before=$(stat -c %Y "$test_config")
  sleep 1
  bash "$netcfg" --config "$test_config" --dry-run set-iface eth99 --ip 1.2.3.4/24 >/dev/null
  local mtime_after
  mtime_after=$(stat -c %Y "$test_config")
  [[ "$mtime_before" == "$mtime_after" ]] || return 1
  if grep -q "eth99" "$test_config"; then return 1; fi
  return 0
}
run_test "Проверка режима предпросмотра (--dry-run)" test_dry_run

# 14. Проверка включения и отключения в режиме dry-run (up / down)
test_up_down_dry_run() {
  bash "$netcfg" --dry-run up br0 >/dev/null
  bash "$netcfg" --dry-run down br0 >/dev/null
}
run_test "Проверка команд up и down (--dry-run)" test_up_down_dry_run

# 15. Проверка автоматического создания резервной копии (.bak)
test_backup_created() {
  local bak_count
  bak_count=$(ls -1 "${test_config}".bak.* 2>/dev/null | wc -l)
  (( bak_count >= 1 )) || return 1
  return 0
}
run_test "Создание резервных копий конфигурационного файла (*.bak.*)" test_backup_created

echo "------------------------------------------------------------"
echo -e "Итог тестов: ${CYAN}${test_count}${NOFORMAT} выполнено, ${GREEN}$(( test_count - fail_count ))${NOFORMAT} успешно, ${RED}${fail_count}${NOFORMAT} ошибок."

if (( fail_count > 0 )); then
  exit 1
fi
exit 0
