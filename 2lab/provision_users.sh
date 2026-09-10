#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${1:-} != --help ]] || { printf 'sudo bash provision_users.sh\nСоздать 3 учебные учётные записи, техническую запись Git и общий bare-репозиторий.\n'; exit 0; }
[[ $# -eq 0 && $EUID -eq 0 ]] || { printf 'Нужен запуск от root без аргументов\n' >&2; exit 2; }
getent group supermarket36 >/dev/null || groupadd supermarket36
for login in student_a student_b student_c gitservice; do
  if ! id "$login" >/dev/null 2>&1; then
    case "$login" in
      student_a) full_name='Кочетков Роман';;
      student_b) full_name='Энгельгард Кирилл';;
      student_c) full_name='Прохоров Максим';;
      gitservice) full_name='Учебный Git сервис';;
    esac
    useradd --create-home --shell /bin/bash --comment "$full_name" "$login"
    usermod --append --groups supermarket36 "$login"
  elif ! id -nG "$login" | tr ' ' '\n' | grep -qx supermarket36; then
    printf 'Существующий %s не относится к стенду; остановка без изменения записи\n' "$login" >&2
    exit 1
  fi
done
repo=/srv/supermarket36/repository.git
if [[ ! -e "$repo" ]]; then
  install -d -m 2770 -o gitservice -g supermarket36 /srv/supermarket36
  runuser -u gitservice -- git init --bare --shared=group --initial-branch=main "$repo"
  chgrp -R supermarket36 "$repo"
elif [[ ! -f "$repo/HEAD" || $(stat -c %U "$repo") != gitservice ]]; then
  printf 'Путь репозитория занят посторонними данными\n' >&2; exit 1
fi
printf 'Готово: 3 участника, gitservice, %s\n' "$repo"
printf 'Новые пароли не заданы: интерактивный вход закрыт; root может выполнять учебные проверки через runuser.\n'
printf 'Для личного входа установите passwd student_a (аналогично b/c) или собственные SSH-ключи.\n'
getent group supermarket36
