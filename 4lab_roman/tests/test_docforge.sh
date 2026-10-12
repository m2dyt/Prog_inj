#!/usr/bin/env bash
set -Eeuo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
utility="$script_dir/../docforge"
sandbox=$(mktemp -d)
trap 'rm -rf -- "$sandbox"' EXIT
mkdir "$sandbox/root" "$sandbox/outside"
run() { bash "$utility" --root "$sandbox/root" "$@"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
expect_fail() { if "$@" >/dev/null 2>&1; then fail 'Ожидался отказ'; fi; }
run create 'первый файл.txt' 'Супермаркет [36] & товары'
run create second.txt 'Касса'
run replace 'первый файл.txt' '[36]' '№36 & $1'
[[ $(cat "$sandbox/root/первый файл.txt") == 'Супермаркет №36 & $1 & товары' ]] || fail 'Буквальная замена'
run merge all.txt txt
grep -q 'Касса' "$sandbox/root/all.txt" || fail 'Объединение'
run --force merge all.txt txt
[[ $(grep -c -- '--- all.txt ---' "$sandbox/root/all.txt" || true) == 0 ]] || fail 'Результат попал в собственный ввод'
run --dry-run extension txt md
[[ -f "$sandbox/root/second.txt" && ! -e "$sandbox/root/second.md" ]] || fail 'dry-run изменил данные'
run create second.md 'Коллизия'
expect_fail run extension txt md
[[ -f "$sandbox/root/all.txt" ]] || fail 'Частичное переименование при коллизии'
trash_id=$(run delete second.md)
[[ ! -e "$sandbox/root/second.md" ]] || fail 'Удаление'
run restore "$trash_id" restored.md
run rename restored.md new.md
expect_fail run create '../outside/escape.txt' bad
ln -s "$sandbox/outside" "$sandbox/root/link"
if [[ -L "$sandbox/root/link" ]]; then
  expect_fail run create link/escape.txt bad
else
  printf 'SKIP: среда эмулирует symlink копированием; повторить тест на Linux\n' >&2
fi
expect_fail run create /tmp/escape.txt bad
expect_fail run replace new.md '' bad
expect_fail run create new.md overwrite
expect_fail run unknown
run extension txt markdown
[[ -f "$sandbox/root/первый файл.markdown" ]] || fail 'Расширение имени с пробелом/кириллицей'
run --dry-run delete new.md
[[ -f "$sandbox/root/new.md" ]] || fail 'dry-run удаления'
printf '\000binary' > "$sandbox/root/binary.txt"
expect_fail run replace binary.txt binary text
# A partial find result must never be treated as a complete successful scan.
mkdir "$sandbox/bin"
real_find=$(command -v find)
printf '#!/usr/bin/env bash\n"%s" "$@"\nexit 9\n' "$real_find" > "$sandbox/bin/find"
chmod +x "$sandbox/bin/find"
expect_fail env PATH="$sandbox/bin:$PATH" bash "$utility" --root "$sandbox/root" list
expect_fail env PATH="$sandbox/bin:$PATH" bash "$utility" --root "$sandbox/root" merge failed.md markdown
[[ ! -e "$sandbox/root/failed.md" ]] || fail 'Частичный результат find стал документом'
expect_fail env PATH="$sandbox/bin:$PATH" bash "$utility" --root "$sandbox/root" extension markdown log
[[ -f "$sandbox/root/all.markdown" && ! -e "$sandbox/root/all.log" ]] || fail 'Ошибка find изменила расширения'
bash "$utility" --help >/dev/null
printf 'PASS: создание, поиск, merge, буквальная замена, rename, extension, dry-run, корзина, восстановление, ограничения путей и бинарных файлов, отказ при неполном find\n'
