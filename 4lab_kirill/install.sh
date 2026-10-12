#!/usr/bin/env bash
# Скрипт установки утилиты netconfig в системный каталог /usr/local/bin (ЛР №4, вариант 6).
set -Eeuo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)
target_bin="/usr/local/bin/netconfig"

echo "=== Установка утилиты netconfig ==="

# Проверка прав суперпользователя
if [[ $EUID -ne 0 ]]; then
  echo "Ошибка: Для установки в /usr/local/bin требуются права суперпользователя (root)." >&2
  echo "Запустите скрипт через sudo: sudo bash install.sh" >&2
  exit 1
fi

# Проверка обязательных зависимостей
echo "Проверка системных зависимостей..."
for cmd in bash awk ip install mktemp cp chmod rm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Ошибка: Обязательная утилита '$cmd' не найдена в PATH." >&2
    exit 1
  fi
done

source_bin="${script_dir}/netconfig"
if [[ ! -f "$source_bin" ]]; then
  echo "Ошибка: Исходный файл '$source_bin' не найден." >&2
  exit 1
fi

echo "Копирование исполняемого файла в ${target_bin}..."
install -m 0755 "$source_bin" "$target_bin"

echo "Проверка работоспособности установленной утилиты..."
"$target_bin" --version

echo ""
echo "Установка успешно завершена!"
echo "Теперь утилита доступна глобально в системе по команде: netconfig"
echo "Для получения справки выполните: netconfig --help"
