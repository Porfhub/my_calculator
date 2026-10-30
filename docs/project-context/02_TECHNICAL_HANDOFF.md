# Ясномера — техническая передача

Проверено 30.10.2026 на базе main `bf9e387`, текущая repair-ветка `codex/repair-data-pipeline-project-context`. Статус выпуска отделён от локального результата в `00_PROJECT_MASTER_STATUS.md`.

## Карта репозитория

| Область | Файлы и назначение |
| --- | --- |
| Страницы | `index.html` + `mortgage.html`, `rent-vs-mortgage.html`, `honest-credit.html`, `millionaire.html`, `financial-freedom.html`, `inflation-shredder.html`, `wealth.html`, `car-vs-taxi.html`, `time-is-money.html`, `genetic-wealth.html` |
| Ипотека | `mortgage.html`: форма, состояние, расчёт, графики, таблица и обработчики в одном HTML; это действующий движок, не B+ prototype |
| Общие функции | `js/utils.js`, `js/ui-utils.js` (toast, goals, screenshot/share, accessibility), `js/theme.js`, `css/product-polish.css` |
| Состояния | `js/calculator-state.js`: LOADING, READY, INVALID_INPUT, CALCULATION_IMPOSSIBLE, DATA_UNAVAILABLE, ERROR; очистка старых результатов, защита от NaN/Infinity/undefined, разрешение экспорта |
| Модели/данные | `js/api.js` (fetch/normalization/status), `js/inflation-calculator.js`, `js/rent-vs-mortgage-model.js`, `js/income-comparison.js`, `js/ndfl.js`; часть прочих формул остаётся inline в HTML |
| Методология | `js/trust-layer.js`: единый поясняющий блок пользовательского ввода/официальных фактов/допущений/ограничений |
| Финансовые JSON | `rates.json`, `inflation.json`, `regions.json`; schema v2, разные допустимые статусы и payload |
| Backend-проверки | `schemas/*.schema.json`, `data_validation/policies.js`, `data_validation/validate.js`; Node CLI, Ajv 8.20.0, ajv-formats 3.0.1, lockfile |
| Updaters | `update_rates.js`, `update_inflation.js`; legacy `update_regions.js` не соответствует текущему безопасному региональному pipeline |
| CI/CD | `.github/workflows/rates.yml`, `data-validation.yml`, `deploy-yandex-object-storage.yml` |
| PWA/SEO | `sw.js` (cache `yasnomera-cache-v16`), `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `yasnomera-mark.svg`, `assets/yasnomera-og.png`; SEO metadata в страницах |
| Проверки | `tests/data-validation/*.test.js`, `tests/ui-state/*.test.js`, отдельные `dev_tools/verify_ui.py`, `verify_ui.js` |
| Контекст и зеркало | `docs/project-context/*.md`; `dev_tools/sync-project-context.ps1`, `register-project-context-mirror.ps1`; детали в runbook |

Без frontend-build. Для локального браузерного просмотра: `python -m http.server 8000` из корня. Не открывать HTML как file:// при проверке fetch/PWA. Зависимости CDN и npm — разные контуры: npm нужен для data-validation/tests, не для сборки сайта.

## Ипотечная архитектура и инварианты

`mortgage.html` хранит состояние ввода и рассчитывает базовый и досрочный помесячные графики. Модель различает новую/действующую ипотеку, договорный срок и результат погашения, срок/целевой платёж, регулярные/разовые досрочные и стратегии сокращения срока/платежа. Записи schedule содержат month, payment, interest, principal, prepayment, balance, insurance.

Обязательный платёж исключает страховку. Проценты банку отделены от моделируемой страховки; выплаты по новой ипотеке исключают первоначальный взнос. Предельный горизонт — 50 лет; экономически невозможные/невалидные состояния не становятся READY, старые итоги и экспорт очищаются. Нулевые/крайние значения обрабатываются явно. Исторический некорректный налоговый вычет отключён.

Отказ графика или вторичной отрисовки отделён от финансовой ошибки. `mortgage_diagnostic` дедуплицирует stage/kind и не содержит пользовательских денежных вводных. Изменения PR #89/#90 покрывают деградацию Chart.js, восстановление корректного ввода, numeric keyboards, keyboard viewport/sticky и стартовое значение комфортного платежа. В этой задаче `mortgage.html` не меняется.

При будущей реализации B+ переносить проверенный production-движок и контракты, а не demo-расчёт из прототипа. Не уменьшать функциональность четырьмя базовыми полями. Модель аренды отдельно различает срок кредита и горизонт сравнения, стоимость жилья и капитал после вычета долга; не терять эти исправления.

## Контур проверки данных

`parseJsonStrict` отклоняет duplicate keys и некорректный JSON. `validateDataset` последовательно проверяет schema → семантику/provenance/anomaly → freshness. `atomicWriteJson` валидирует значение и повторно сериализованный JSON, пишет/fsync временный файл, атомарно заменяет целевой и убирает свой temp.

`skipFreshness` применяется внутри оценки сохранённого snapshot для fail-closed fallback, а не как publish-обход. `buildFailureState` разрешает только валидный неизменённый snapshot внутри политики; иначе возвращает `unavailable` без финансового payload. Stale не может изменять последние проверенные числа/успешное происхождение. Новая успешная загрузка может восстановить ok после истёкшего старого snapshot; время успешного fetch не обновляется при неудаче.

| Набор | Действующие проверки |
| --- | --- |
| Ставка | Только CBR hosts/HTTPS, checksum payload и compatibility projection; 0–100%, до 4 знаков; soft TTL 72 ч, hard TTL 7 дней, clock skew 1 ч; откат effective date и скачки >5 п.п. или >50% требуют review |
| Инфляция | Fedstat/Rosstat hosts; РФ, все товары/услуги, annual December-to-December; последовательность с 2000, CPI−100=inflation, data_through=последний год; контроль 2024/2025, historical revision >0.5 п.п., inter-year jump >15 п.п. требуют review |
| Freshness инфляции | Publication grace до 31 января 23:59:59.999 UTC текущего года включительно; затем нужен предыдущий завершённый год. Недостающий год допускается как stale до 90 дней после deadline включительно, затем unavailable; зависит от покрытия, не от возраста fetch как у ставки |
| Регионы | Схема официальных ссылок/метрик, уникальный полный roster (РФ+89 субъектов), проверяемая source reference для чисел. Текущий partial допустим для publish, но отмечается health |

Важный отдельный технический долг: общий inflation deadline строится для текущего года, а freshness и fallback используют сходный код. В этом PR политика не пересматривалась. Если потребуется менять календарную методологию, нужны отдельные сценарии многолетней просрочки и перехода года; нельзя менять её только ради зелёного теста.

## Updater-ы

`update_rates.js`: CBR SOAP `DailyInfoWebServ/DailyInfo.asmx` / KeyRateXML с историей с 2013-09-01; контрольное сравнение с HTML `https://www.cbr.ru/hd_base/keyrate/`. Только официальный HTTPS, ручная проверка redirect hosts, максимум 3 redirect, timeout 15 с, ограничение ответа 2 MiB. Кандидат включает raw source checksum и canonical payload checksum. Даже неизменная ставка получает новый successful fetch после реального успешного получения и сверки.

`update_inflation.js`: читает Rosstat price landing, обнаруживает официальный XLSX, проверяет Content-Type/размер/HTTPS host/redirect, разбирает ZIP/XML, выбирает годовой ряд. Timeout 30 с, 2 MiB. Включён versioned Russian trust CA bundle: hostname и TLS-chain проверка сохраняются. Не отключать TLS ради доступности. При одинаковых официальных байтах и ok snapshot timestamp намеренно сохраняется, но freshness всё равно проверяется внутри try и ведёт к safe fallback. Это отличается от ставки, чья TTL привязана к fetch.

`update_regions.js` — старый Gemini-promпт с GEMINI_API_KEY и записью массива старого формата. **Не запускать его для обновления schema-v2 regions.json**. Замена на воспроизводимый официальный региональный pipeline — отдельный долг, не часть ремонта.

## Причина падения scheduled run и фикс

07.10 (`bf9e387`) Rosstat timeout перевёл root inflation в `stale`. Fixture-функция validation tests читала этот root файл и переопределяла лишь даты; статус/reason/годовые числа оставались изменяемыми. С фиксированным NOW=01.09 тесты были не детерминированы относительно production.

Точно воспроизведено на свежем main: **125 tests, 123 pass, 2 fail**. Ревизия stale payload правильно давала semantic_validation_failed («stale изменил ряд»), а ожидание missing-year ok failure не исполнялось, поскольку статус уже был stale.

Фикс: `tests/data-validation/fixtures/inflation.json` — полный test-owned ok snapshot с фиксированным временем; validator/updater и два клиентских inflation/state test-файла используют новые копии только его. README рядом объясняет модельную provenance timeline и запрет копирования fixture в production. Добавлены проверки UTC deadline и hard TTL ±1 ms, неизменной ставки после TTL и safe unavailable при отказе fetch. **Production валидатор, policies и workflows не менялись.**

Реальный локальный fetch обновил только provenance ставки/инфляции; ставка и исторические годовые числа остались прежними. До fetch `npm run validate:data` закономерно отклонял main из-за rates hard TTL. После fetch publish проходит; advisory health сигналит regions=partial.

## Actions и выпуск

1. **Update Mortgage Rates** — ежедневно/dispatch, Node24 + pinned npm ci + полный suite, реальные updater-ы, `npm run validate:data`, проверка scope только двух JSON, bot commit/push, advisory health `if: always()` с continue-on-error.
2. **Validate Financial Data** — path-filtered pull_request и push main; тесты и publish-валидация. Fixture не заменяет проверку текущих root JSON реальным временем. PR с тестами входит в filter; docs-only PR сам по себе этот workflow не включает.
3. **Deploy Yandex Object Storage Mirror** — push main, successful updater workflow_run/main, manual choice test/production. Checkout latest main; `git archive`, исключение dev/docs/test/tooling; точный allowlist 35 файлов, hashes и отсутствие symlinks; AWS CLI sync на Yandex endpoint, затем HTTP smoke ключевых URL. Секреты только в Actions.

Имена buckets/endpoints и guards перечислены в master-status. GitHub deployment workflow не выполняет повторно `npm test`/publish gate для любого произвольного push main: он проверяет пакет. Защиту merge/required branch checks в кабинете этой задачей не проверяли. Поэтому нельзя обходить review, независимый validation workflow и updater gate. Текущая задача не меняет эту инфраструктурную политику и не выполняет ручной выпуск.

## Analytics

Counter **110360838**, Metrika init/webvisor/clickmap/trackLinks в HTML; общий `reachGoal` в `js/ui-utils.js`. `mortgage.html` посылает calculate_success один раз после пользовательского валидного пересчёта и успешного обновления результата, не на начальном показе. `mortgage_diagnostic: {stage, kind}` через params — диагностика. Не превращать её в goals и не отправлять финансовые вводные.

`share_click` срабатывает при разрешённом начале share/PNG. На других калькуляторах критерии calculate_success неодинаковы; наличие имени в JS не доказывает настройку цели/приём событий в кабинете. Blank Chart.js canvas в Webvisor требует проверки реального браузера, не автоматического заключения о production bug.

## PNG/share contract

Все 10 калькуляторов сохраняют `takeScreenshot(...)` через html2canvas; есть `canExportCalculation` guards там, где страница их предоставляет. Общий код создаёт изолированную сцену/клон, убирает duplicate IDs, переносит Chart.js canvas в изображения, исключает controls, tooltips, scripts, iframe, video, sticky и `data-screenshot-exclude`, отключает анимации/transforms. Рендер: scale 2, useCORS false, allowTaint false, toBlob/object URL; cleanup в finally.

Ипотека экспортирует **`results-panel`**, ширина **560 px + 20 px поля сцены с каждой стороны**, портрет. Сначала основной итог, состав долга/процентов, экономия либо fallback-параметры; затем график. `data-screenshot-flush` снимает отрицательные отступы; `data-screenshot-fallback` раскрывает параметры только в export-клоне; `data-screenshot-exclude` убирает историю/управление. Не заменять целью один `screenshot-area`: потеряются hero и donut. Имя файла `yasnomera-mortgage-calculation.png`.

Share сохраняет сценарий через существующие page handlers/URL. PNG и share должны относиться к тому же READY-результату, который видит пользователь; не экспортировать прошлый корректный результат после неверного ввода.

## Проверки и ограничения подтверждения

```powershell
npm ci --ignore-scripts
npm test
npm run validate:data
node data_validation/validate.js --all --mode health
```

Результат ремонта: **128 passed, 0 failed, 0 skipped**. Есть pure math/model tests, VM/DOM contracts, state/invalid input/export/analytics/mortgage regressions и schema/updater tests с подменёнными loaders. Это не всеобъемлющий браузерный E2E. Реальные updater-ы дополнительно запущены локально 30.10, publish gate прошёл. Health exit1 из-за partial regions ожидаем и не должен маскироваться.

Дополнительно полный suite прошёл 128/128 с временно unavailable root inflation; реальный JSON восстановлен в finally. Это проверяет независимость unit-сценариев от допустимой production-деградации. Проверка актуального root JSON по реальному времени остаётся отдельным обязательным CLI-gate.

На этой Windows-сессии sandbox запрещал rename временных файлов в atomic-write tests (EPERM). Повтор с обычными пользовательскими filesystem permissions воспроизвёл именно два подтверждённых CI-сбоя, затем прошёл после фикса. Production atomic-write не ослаблялся ради sandbox. Изменений mortgage/UI нет, новый browser UX/PNG QA не проводился и этим PR не заявляется.

## Технический долг и предосторожности

- Большой inline mortgage engine/UI, неодинаковая строгость analytics в разных калькуляторах; выделение модулей — отдельная задача с contract tests.
- Partial regional data и legacy Gemini updater; не считать их полным актуальным официальным pipeline.
- Старые root/September docs противоречат более новой инфраструктуре. Канонический текущий статус — эта папка, с датами и раздельными production/PR/prototype.
- CDN-библиотеки частично не pinned; SW заранее кэширует внешние ресурсы и внутренние страницы. Внутренние URL network-first, прочие cache-first; учитывать cache version/list при изменении клиентских ресурсов. Offline-cache не доказывает свежесть финансового файла.
- `npm ci`/`npm audit` 30.10 выявили существующий high advisory для транзитивного `fast-uri` 3.1.6 (через Ajv). Lockfile в этой задаче не менялся; обновление зависимости и оценка advisory — отдельная maintenance-задача.
- Ручные mobile keyboard/safe-area/download проверки и доступность всех браузеров дополняют Node suite при будущем дизайне.
- Стабильный fixture намеренно не автоматом принимает новую методологию/год: root dataset проверяет CLI, изменение тестовых контролей требует review.
- Установленный mirror читает **текущий локальный checkout**, не выполняет fetch/merge. Если docs отсутствуют на другой ветке или G: недоступен — failure log и сохранение предыдущей копии. После merge держать этот checkout на актуальной ветке с docs.
