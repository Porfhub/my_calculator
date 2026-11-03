# Ясномера · зеркало проектного контекста на Windows

Канон находится в GitHub main. После однократной установки задача `Yasnomera Project Context Mirror` периодически получает `refs/heads/main` из проверенного origin в отдельный bare-репозиторий `%LOCALAPPDATA%\Yasnomera\ProjectContextMirror\main.git`. Рабочий checkout пользователя не участвует в синхронизации. Скрипт доставки установлен локально под именем с SHA-256. Из main автоматически обновляются Markdown, а обновление кода самого скрипта требует осознанного повторного запуска установщика.

| Источник | Назначение |
| --- | --- |
| `docs/project-context/*.md` верхнего уровня | `G:\Мой диск\Ясномера - Project Context\` |
| `docs/pages/*.md` верхнего уровня | `G:\Мой диск\Ясномера - Project Context\pages\` |

Пути в GitHub-документах могут указывать на код или QA вне зеркала. Открывайте такие ссылки в репозитории. Зеркало не редактирует содержимое Markdown и не управляет ChatGPT Project Sources. [Инструкция по Sources](04_CHATGPT_PROJECT_SOURCES.md)

## Однократная установка после merge

Войдите в обычную Windows-сессию с работающим Google Drive for desktop и Git for Windows. Выполните из корня checkout, в котором уже есть принятые версии обоих скриптов. Как вариант, скачайте оба файла из одного подтверждённого коммита main в отдельную папку и запустите команду из неё, убрав префикс `dev_tools\`.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\dev_tools\register-project-context-mirror.ps1 -MyDriveRoot 'G:\Мой диск'
```

Установщик выводит конфигурацию найденной задачи и сверяет прежнюю команду, origin, владельца и тип входа. Затем выполняет один пробный прогон и заменяет только action распознанной задачи. Триггеры и параметры сохраняются. При отсутствии задачи установщик создаёт её с запуском при входе и примерно каждые 15 минут в интерактивной сессии. Неизвестная, отключённая или работающая задача блокирует миграцию до проверки. При отказе пробного прогона задача остаётся с прежней конфигурацией.

## Проверка на этом ПК

```powershell
$name = 'Yasnomera Project Context Mirror'
$local = Join-Path $env:LOCALAPPDATA 'Yasnomera\ProjectContextMirror'
Get-ScheduledTask -TaskName $name -TaskPath '\' | Select-Object State, Actions, Triggers
$before = (Get-ScheduledTaskInfo -TaskName $name -TaskPath '\').LastRunTime
Start-ScheduledTask -TaskName $name -TaskPath '\'
$deadline = (Get-Date).AddMinutes(5)
do {
    Start-Sleep -Seconds 2
    $info = Get-ScheduledTaskInfo -TaskName $name -TaskPath '\'
    $state = (Get-ScheduledTask -TaskName $name -TaskPath '\').State
} until (($info.LastRunTime -gt $before -and $state -ne 'Running') -or (Get-Date) -ge $deadline)
if ($info.LastRunTime -le $before -or $state -eq 'Running' -or $info.LastTaskResult -ne 0) {
    Get-Content -LiteralPath (Join-Path $local 'sync.log') -Tail 10
    throw 'Запуск задачи не завершился успешно.'
}
$receipt = Get-Content -Raw -LiteralPath (Join-Path $local 'last-success.json') | ConvertFrom-Json
$remote = git ls-remote https://github.com/Porfhub/my_calculator.git refs/heads/main
if ($LASTEXITCODE -ne 0 -or ($remote -split '\s+')[0] -ne $receipt.git_sha -or $receipt.verified_files -lt 17) {
    throw 'SHA или число проверенных документов не подтверждены. Если main обновился, запустите проверку повторно.'
}
$receipt
Get-ChildItem -LiteralPath 'G:\Мой диск\Ясномера - Project Context\pages' -File -Filter '*.md'
```

`sync.log` содержит UTC, Git SHA (или `-` до получения SHA), число проверенных файлов и причину отказа. `last-success.json` фиксирует последнюю полную проверку на G:. Сравните её время с запуском. Для подтверждения облачной доставки дождитесь статуса Google Drive for desktop и откройте один общий Markdown и один паспорт через веб-интерфейс Drive. Локальное перечитывание G: подтверждает локальную запись.

## Поведение при отказах

До записи на Drive скрипт проверяет origin, результат fetch, ветку, обязательные документы, режимы Git, идентичность blob и читаемый UTF-8. Используйте имена Markdown из латинских букв, цифр, дефиса и подчёркивания с расширением `.md`. Скрипт отказывается следовать по reparse points и сверяет SHA-256 staging и каждого опубликованного файла. Запись выполняется через временный файл в той же папке и переименование. Неизвестные имена и ранее зеркалированные файлы, удалённые из Git, автоматически не удаляются. Изменения следует вносить в GitHub.

При недоступном GitHub, G: или неполном кандидате последнее успешное состояние остаётся доступно. Если Drive отключится во время серии переименований, часть файлов уже может быть обновлена целиком, а отметка полной синхронизации сохраняет прежний SHA. Следующий успешный запуск сверяет весь комплект и доводит его до одного коммита. Файловый провайдер должен поддерживать переименование с заменой в одной папке. При отказе смотри `sync.log`. Для повреждённого Git-кэша останови запуск задачи и отложи только служебную папку `main.git` под другим именем после проверки пути. Следующий запуск создаст новый кэш. Содержимое рабочего checkout и Drive для восстановления не требуется перемещать.

[Синхронизация](../../dev_tools/sync-project-context.ps1) · [Установщик](../../dev_tools/register-project-context-mirror.ps1)
