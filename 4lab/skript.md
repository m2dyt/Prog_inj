Установленная команда: /usr/local/bin/docforge. Это копия исходника, чтобы запускать docforge из любого каталога. Ubuntu находит её через системный список путей PATH.
sudo bash install.sh

stdout — основной результат программы, например список файлов или ID из корзины;
stderr — сообщения о ходе работы и ошибки.

-----------------------------

.docforge-trash — корзина. Команда delete помещает туда удалённый файл, чтобы его можно было восстановить командой restore. Там хранятся сами удалённые данные и сведения, нужные для восстановления.
.docforge-tmp — рабочее место для временных данных во время операции, например при подготовке результата объединения файлов. Для запуска создаётся папка run.*; при штатном завершении cleanup() её удаляет.

----------------------------------------------

--force разрешает перезаписать уже существующий файл результата.
--dry-run включает пробный запуск: утилита проверяет и показывает, что собирается сделать, но не применяет изменения к файлам

-------------------------------

mkdir -p ~/Prog_inj/4lab/demo

docforge --root ~/Prog_inj/4lab/demo create milk.txt "Молоко 3.2%"
docforge --root ~/Prog_inj/4lab/demo create bread.txt "Хлеб"
docforge --root ~/Prog_inj/4lab/demo list txt
docforge --root ~/Prog_inj/4lab/demo merge catalog.txt txt
docforge --root ~/Prog_inj/4lab/demo replace catalog.txt "Молоко" "Молоко Пискарёвское"
docforge --root ~/Prog_inj/4lab/demo extension txt md
docforge --root ~/Prog_inj/4lab/demo rename catalog.md catalog-final.md
docforge --root ~/Prog_inj/4lab/demo delete milk.md
docforge --root ~/Prog_inj/4lab/demo restore item.HJERx8DF milk.md

---------------------------------------

docforge --help
docforge -h
docforge --version

----------------------------------------

