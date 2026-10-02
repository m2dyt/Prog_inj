#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${1:-} != --help ]] || { printf 'sudo bash verify_git.sh\nАвтоматическая демонстрация Git Flow в новом временном каталоге.\n'; exit 0; }
[[ $# -eq 0 && $EUID -eq 0 ]] || { printf 'Нужен root без аргументов\n' >&2; exit 2; }
repo=/srv/supermarket36/repository.git
[[ -f "$repo/HEAD" ]] || { printf 'Сначала provision_users.sh\n' >&2; exit 1; }
# Do not invent personal commit authorship. All demonstration commits say automation.
export GIT_AUTHOR_NAME='Lab automation' GIT_AUTHOR_EMAIL='lab-automation@example.invalid'
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
run_dir=$(mktemp -d /tmp/supermarket36-git.XXXXXXXX)
chmod 755 "$run_dir"
for login in student_a student_b student_c; do
  if ! runuser -u "$login" -- git config --global --get-all safe.directory | grep -Fxq "$repo"; then
    runuser -u "$login" -- git config --global --add safe.directory "$repo"
  fi
  install -d -m 700 -o "$login" -g supermarket36 "$run_dir/$login"
  runuser -u "$login" -- git clone "$repo" "$run_dir/$login/work"
done
a="$run_dir/student_a/work"; b="$run_dir/student_b/work"; c="$run_dir/student_c/work"
gita() { runuser -u student_a -- git -C "$a" "$@"; }
gitb() { runuser -u student_b -- git -C "$b" "$@"; }
gitc() { runuser -u student_c -- git -C "$c" "$@"; }
if gita rev-parse --verify HEAD >/dev/null 2>&1; then
  printf 'Существующий репозиторий сохранён. Клонирование под 3 пользователями успешно.\n'
  gita log --graph --oneline --all
  exit 0
fi
printf '# Автоматическая демонстрация Git Flow\n\nСтатус: подготовка\n' > "$a/README.md"
chown student_a:supermarket36 "$a/README.md"
gita add README.md; gita commit -m 'docs: исходное состояние учебного примера'
gita push origin main; gita switch -c develop; gita push origin develop
gitb fetch origin; gitb switch -c codex/feature/SM-05-review origin/develop
gitc fetch origin; gitc switch -c codex/feature/SM-06-process origin/develop
printf '# Автоматическая демонстрация Git Flow\n\nСтатус: проверка требований\n' > "$b/README.md"
chown student_b:supermarket36 "$b/README.md"
gitb add README.md; gitb commit -m 'docs: ветка проверки требований'; gitb push origin HEAD
printf '# Автоматическая демонстрация Git Flow\n\nСтатус: настройка процесса\n' > "$c/README.md"
chown student_c:supermarket36 "$c/README.md"
gitc add README.md; gitc commit -m 'docs: ветка настройки процесса'; gitc push origin HEAD
gita fetch origin
gita merge --no-ff origin/codex/feature/SM-05-review -m 'merge: результат проверки'
if gita merge --no-ff origin/codex/feature/SM-06-process -m 'merge: настройка процесса'; then
  printf 'Ожидался учебный конфликт\n' >&2; exit 1
fi
[[ $(gita diff --name-only --diff-filter=U) == README.md ]] || exit 1
printf '# Автоматическая демонстрация Git Flow\n\nСтатус: требования проверены, процесс настроен\n' > "$a/README.md"
gita add README.md; gita commit -m 'merge: согласованное разрешение учебного конфликта'
gita switch -c codex/release/1.0.0
gita switch main; gita merge --no-ff codex/release/1.0.0 -m 'release: учебный выпуск'
gita tag -a v1.0.0 -m 'Автоматическая демонстрация Git Flow'
gita switch develop; gita merge --no-ff codex/release/1.0.0 -m 'merge: выпуск в develop'
gita push origin main develop codex/release/1.0.0 --tags
gitb fetch origin; gitc fetch origin
gita diff --check; gita log --graph --oneline --decorate --all
printf 'PASS: 3 clone/push, feature/develop/release/main, merge conflict, tag; автор Lab automation\n'
printf 'Демонстрационные клоны сохранены в %s\n' "$run_dir"
