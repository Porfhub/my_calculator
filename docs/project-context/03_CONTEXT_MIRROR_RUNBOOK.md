# Канонический контекст и зеркало Google Drive

Настройка для Windows-машины Porf, 30.10.2026. Источник истины — документы Git, не обратная копия из Drive.

## Точные пути и scope

- Репозиторий, проверенный через cwd/git remote: `C:\Users\Porf\Documents\GitHub\my_calculator`, origin `https://github.com/Porfhub/my_calculator.git`.
- Source: `C:\Users\Porf\Documents\GitHub\my_calculator\docs\project-context\`.
- В корне G: обнаружен **`Мой диск`**, а не предположенный англоязычный My Drive.
- Destination: **`G:\Мой диск\Ясномера - Project Context\`**.
- Копируются только верхнеуровневые `*.md` source-папки, включая этот runbook. Весь репозиторий, `.git`, credentials, deploy-output и прототипы не копируются.
- Удаления destination-файлов нет: новые/изменённые Markdown копируются только вперёд, с SHA-256 readback. Посторонние/старые файлы не удаляются; после намеренного переименования/удаления source-doc отдельно проверить старую копию **в этой выделенной папке**. Не использовать её как актуальный документ.

Редактирование одноимённого файла в Drive будет перезаписано источником при следующем sync. Вносить содержательные правки только в repo, фиксировать решения и дату; затем Git review/PR по обычным правилам. Файловый sync не делает git pull, не подтверждает merge/deploy и не обновляет содержание документов автоматически из кода.

## Скрипты и задача

- `dev_tools/sync-project-context.ps1`: проверка source/трёх обязательных документов, доступности G:, ограничение destination, отказ от reparse points, copy через свой временный файл, проверка SHA-256 всех файлов, success/failure logs.
- `dev_tools/register-project-context-mirror.ps1`: сначала реальный sync, затем создание задачи. Не перезаписывает молча существующую одноимённую задачу.
- Task name: **`Yasnomera Project Context Mirror`**, task path `\`.
- Триггеры: **при входе текущего пользователя** и **каждые 15 минут без даты окончания**; repetition trigger запускается через минуту после регистрации. Interactive principal, limited privileges: работает только при logged-in пользователе, пароль не сохраняется.
- Hidden PowerShell, `NoProfile/NonInteractive`; `ExecutionPolicy Bypass` относится к этому процессу, системная policy не меняется. IgnoreNew, StartWhenAvailable, разрешена батарея, лимит одной попытки 5 минут.
- G: при входе может ещё не смонтироваться. Попытка запишет failure, последующие 15-минутные попытки восстановят копирование. Ни источник, ни существующая Drive-копия при этом не удаляются.

Логи **на локальном C:, вне Drive и repo**: `%LOCALAPPDATA%\Yasnomera\ProjectContextMirror\sync.log` и `last-success.json`. Последний success хранится отдельно от последующих failures; временная недоступность G: не маскируется новым успешным временем. LogDirectory можно переопределить для ручной проверки. Лог append-only; при необходимости архивировать именно локальный log, не соседние Drive-файлы.

## Установка и проверка

Первичная установка уже выполнена этой задачей; **не регистрировать повторно** без просмотра существующей задачи. Для другой машины сначала заново обнаружить clone/My Drive и проверить destination.

```powershell
# Ручной sync; путь My Drive должен быть предварительно проверен.
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\dev_tools\sync-project-context.ps1 -MyDriveRoot 'G:\Мой диск'

# Только первичная установка, если задача отсутствует:
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\dev_tools\register-project-context-mirror.ps1 -MyDriveRoot 'G:\Мой диск'

Get-ScheduledTask -TaskName 'Yasnomera Project Context Mirror'
Get-ScheduledTaskInfo -TaskName 'Yasnomera Project Context Mirror'
Get-Content "$env:LOCALAPPDATA\Yasnomera\ProjectContextMirror\last-success.json"
Get-Content "$env:LOCALAPPDATA\Yasnomera\ProjectContextMirror\sync.log" -Tail 10
Get-ChildItem -LiteralPath 'G:\Мой диск\Ясномера - Project Context' -File
```

Успешность означает TaskScheduler LastTaskResult=0, новое `last_successful_sync_at`, наличие всех документов и равенство SHA-256 source/destination. Это проверка локальной копии на Drive for Desktop mount; завершение фоновой облачной загрузки и доступ подключённого ChatGPT Drive не следуют из одного только существования G:-файла.

Подтверждено 30.10.2026: создана задача с InteractiveToken текущего пользователя и ограниченными правами; прочитаны logon trigger и бессрочный `PT15M` trigger. Первый автоматический запуск в **18:59:49 МСК** завершился успешной проверкой четырёх документов; последующие ручные вызовы именно задачи также успешны. Все четыре source/destination SHA-256 совпали. Проверка лога выполнена также из собственного контекста Task Scheduler, а не только из процесса установки.

Проверены отказ при недоступном My Drive и запрет назначения в корень G:. Failure логируется, last-success не обновляется; список и SHA-256 существующих mirror-файлов после отказа остались неизменными. Никакие соседние Drive-файлы тесты не меняли.

## Использование в будущем ChatGPT-чате

1. Дождаться Google Drive for Desktop «всё синхронизировано» и проверить папку в web Drive, если нужна гарантия облачной доставки.
2. Вручную добавить эту Drive-папку/документы в Sources нужного ChatGPT проекта. Task Scheduler не меняет настройки ChatGPT и доступ к аккаунту.
3. Начать с `00_PROJECT_MASTER_STATUS.md`, затем decision/technical docs; проверить дату, PR/production и не считать prototype выпущенным.
4. После работы обновить канонические repo-docs. Если в checkout выбрана другая ветка без этой папки, вернуть актуальную ветку с docs; последняя успешная копия останется, failure будет виден в логе.

Для отключения выполнить `Disable-ScheduledTask -TaskName 'Yasnomera Project Context Mirror'`. Отключение не удаляет документы ни на C:, ни на G:. Не применять robocopy /MIR, /PURGE или рекурсивное удаление к My Drive.
