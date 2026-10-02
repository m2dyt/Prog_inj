# Лабораторная работа №4 — генерация документов

Индивидуальная работа: Кочетков Роман. Вариант 12.

Индивидуальное выполнение. Вариант **12** выбран пользователем отдельно от варианта 36 первых трёх работ. Основание — методичка ЛР №4, с. 9–15, строка 12 таблицы на с. 18, требования к защите на с. 20.

Результат — утилита `docforge` на Bash. Она использует GNU find и стандартные команды для создания, поиска, объединения, удаления, переименования и редактирования текстовых файлов, включая изменение расширений. Это отдельный инструмент; запуск не требует React, FastAPI, Docker, PostgreSQL или материалов предыдущих работ.

## Установка

В Linux VM:

```bash
sudo apt update
sudo apt install -y bash coreutils findutils gawk
sudo bash install.sh
docforge --help
docforge --version
```

Финальный путь — `/usr/local/bin/docforge`, имя без `.sh`, режим 0755. Для запуска из исходников установка не нужна: `bash ./docforge --help`. `install.sh` требует sudo только для копирования утилиты в системный каталог; обычные команды работают без root. Установленная утилита не обращается к соседним файлам и не зависит от текущего каталога.

## Пример выполнения по предметной области

```bash
mkdir -p demo
docforge --root demo create catalog.txt 'Супермаркет: каталог товаров'
docforge --root demo create receipts.txt 'Супермаркет: перечень чеков'
docforge --root demo list txt
docforge --root demo merge report.txt txt
docforge --root demo replace report.txt 'перечень чеков' 'журнал продаж'
docforge --root demo rename report.txt report-final.txt
docforge --root demo --dry-run extension txt md
docforge --root demo extension txt md
TRASH_ID=$(docforge --root demo delete receipts.md)
docforge --root demo restore "$TRASH_ID" receipts-restored.md
```

`demo` — отдельный рабочий каталог; не использовать корень диска или каталог проекта с важными материалами. Переименование расширения меняет имя, но не преобразует формат: `.txt` → `.md` допустим для текста, `.txt` → `.docx` не создаёт Word-документ. Под «генерацией документов» в задании понимается обработка файлов сценарными средствами, а не офисный формат.

Подробная справка, функции, ограничения и тесты описаны в `REPORT.md`. Проверка: `bash tests/test_docforge.sh`. Тест сам создаёт временный каталог и не меняет пользовательские документы. На Windows Git Bash часть поведения ссылок отличается; полный профиль выполняется в Linux VM.

## Выполненная установка

В Ubuntu на этом компьютере команда установлена и протестирована: `wsl -d Ubuntu -- docforge --help`. Полный Linux-профиль прошёл без SKIP, включая symlink и сбой find. Использование из файлов остаётся независимым от установки.
