# P0.10 — инженерная спецификация валидации финансовых данных

## Статус документа

- Тип изменения: design-only, без runtime-реализации.
- Дата аудита текущего состояния: 2026-08-31.
- Цель будущей реализации: не допустить публикацию неполных, синтетических, устаревших сверх допустимого срока или семантически неверных финансовых данных.
- Критерий безопасности: отсутствие данных должно быть явно представлено как `unavailable`; оно безопаснее правдоподобного, но непроверенного числа.

## Краткое решение

Для каждого финансового JSON вводится отдельная версированная JSON Schema. Общие metadata и provenance-поля переиспользуются через `$defs`, но предметные правила остаются отдельными: ключевая ставка, инфляция и региональная статистика имеют разные периоды, диапазоны и критерии актуальности.

Публикация строится как транзакция:

1. Загрузить официальный источник во временный candidate.
2. Проверить транспорт, схему, provenance, предметные ограничения, даты, freshness и изменение относительно последнего доверенного snapshot.
3. При полном успехе атомарно заменить JSON.
4. При ошибке отклонить candidate целиком; сохранить последний валидный snapshot как `stale` либо опубликовать типизированное `unavailable`, если доверенного snapshot нет.
5. Перед `git add` и `git push` независимо повторно проверить все три JSON общим CI-validator. Любая ошибка запрещает публикацию.

JSON Schema является проверкой формы, а не единственной линией защиты. Межполевые зависимости, временные правила, допустимые скачки и проверка полного набора записей выполняются детерминированными предметными validators.

## Текущее состояние и проблемы

В проекте три JSON с финансовыми данными:

| Файл | Текущий updater | Текущее состояние | Основной риск |
| --- | --- | --- | --- |
| `rates.json` | `update_rates.js` | Есть официальный SOAP-источник Банка России и `ok/stale/unavailable`, но нет `schema_version`, checksum, общего schema-gate и атомарной записи. | Структурно допустимый, но неверный ответ может быть записан; stale не имеет предельного срока использования. |
| `inflation.json` | `update_inflation.js` | Уже использует schema v2, официальный Росстат, checksum, содержательные проверки и атомарную запись. | Схема не формализована отдельным JSON Schema; проверка сохраненного snapshot неполная; нет независимого CI-gate и общей freshness-политики. |
| `regions.json` | `update_regions.js` | Неверсионированный массив без metadata. Числа генерируются Gemini с web search и подтверждаются вторым LLM-вызовом. | Невоспроизводимые значения без точных источников, периодов и checksum могут напрямую заменить весь файл. Ошибки сети проглатываются. |

Дополнительные проблемы `regions.json`:

- поле `mrot` запрашивается updater как прожиточный минимум трудоспособного населения, но UI подписывает его как МРОТ; это разные показатели;
- `popOffset` является модельной эвристикой, но хранится рядом с официальными показателями без маркировки и методологии;
- `median`, `avg` и `p90` могут относиться к разным обследованиям и периодам, однако период и охват не фиксируются;
- custom-коды регионов не связаны с официальным классификатором;
- нет проверки полноты, уникальности, порядка квантилей и согласованности регионального состава.

## 1. JSON-файлы, которым обязательна схема

Обязательная схема требуется для всех JSON, числовые значения которых участвуют в финансовом расчете или в заявлении об актуальности данных:

1. `rates.json` — целевая `rates.schema.json`, schema v2.
2. `inflation.json` — `inflation.schema.json`, формализующая существующий контракт schema v2. Если реализация добавит или переименует обязательные поля, версия должна стать v3.
3. `regions.json` — целевая `regions.schema.json`, schema v2.

Схемы должны использовать JSON Schema Draft 2020-12, содержать `$id`, запрещать неизвестные поля через `additionalProperties: false` на контролируемых объектах и определять все nullable-поля явно. Версия схемы данных и версия кода validator должны быть независимы: изменение логики anomaly-check без изменения JSON-формы не требует автоматически повышать `schema_version`.

Статические настройки интерфейса не входят в P0.10, пока они не выдаются пользователю как актуальные внешние финансовые данные.

## 2. Обязательные поля

### 2.1. Общий metadata-контракт

Все три набора должны иметь верхнеуровневый объект `metadata` со следующими полями:

| Поле | Тип | Правило |
| --- | --- | --- |
| `schema_version` | integer | Положительное целое; поддерживаемая версия должна точно совпадать с выбранной схемой. |
| `dataset_id` | string enum | `key_rate`, `inflation_annual` или `regional_income`. |
| `status` | string enum | Только `ok`, `stale`, `unavailable`. |
| `status_reason` | string/null | `null` только при `ok`; иначе код из закрытого enum. |
| `source_name` | non-empty string | Человекочитаемое имя официального поставщика. Для composite-набора — имя основной системы и `sources[]`. |
| `source_url` | HTTPS URL | Стабильная официальная страница показателя; hostname входит в allowlist набора. |
| `source_export_url` | HTTPS URL/null | Точный фактически загруженный ресурс последнего успеха. `null` допустим только при `unavailable`. |
| `source_checksum_sha256` | 64 hex/null | SHA-256 байтов фактически загруженного источника. `null` допустим только при `unavailable`. |
| `payload_checksum_sha256` | 64 hex/null | SHA-256 канонизированного предметного payload. Защищает локальный snapshot от незаметного изменения. |
| `source_published_at` | ISO date/null | Дата публикации источника, если она предоставляется официальным набором. |
| `last_successful_fetch_at` | ISO-8601 UTC/null | Момент последней успешной загрузки и полной проверки. |
| `last_attempt_at` | ISO-8601 UTC | Момент последней попытки обновления, включая неуспешную. |

Разрешенные начальные значения `status_reason`:

- `fetch_failed`;
- `timeout`;
- `http_error`;
- `tls_error`;
- `source_format_changed`;
- `schema_validation_failed`;
- `semantic_validation_failed`;
- `freshness_exceeded`;
- `jump_requires_review`;
- `partial_dataset`;
- `no_saved_dataset`.

Текст исключения, stack trace, токены и URL с секретными query-параметрами в публичный JSON не записываются. Они остаются только в CI-логе с маскированием секретов.

### 2.2. Descriptor каждого источника

Если набор составлен из нескольких официальных файлов, `metadata.sources[]` обязателен. Каждый descriptor содержит:

- `source_id` — стабильный внутренний идентификатор;
- `source_name`;
- `source_url` — официальная landing page;
- `source_export_url` — точный загруженный файл;
- `source_published_at`;
- `fetched_at` — ISO-8601 UTC;
- `source_checksum_sha256`;
- `content_type`;
- `metrics` — закрытый список полей, полученных из этого источника;
- `period_from` и `period_to` либо один `reference_period`;
- `geography` и `coverage`.

Один источник не может молча подтверждать метрику, которой нет в его `metrics`. Redirect обязан повторно пройти hostname-allowlist.

### 2.3. `rates.json`

Целевая форма:

```json
{
  "metadata": {
    "schema_version": 2,
    "dataset_id": "key_rate",
    "status": "ok",
    "status_reason": null,
    "source_name": "Банк России",
    "source_url": "https://www.cbr.ru/hd_base/keyrate/",
    "source_export_url": "https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx",
    "source_checksum_sha256": "<sha256 SOAP response>",
    "payload_checksum_sha256": "<sha256 canonical data>",
    "source_published_at": null,
    "last_successful_fetch_at": "2026-08-31T03:00:00Z",
    "last_attempt_at": "2026-08-31T03:00:00Z"
  },
  "key_rate": {
    "value_percent": 14.0,
    "effective_from": "2026-07-27"
  }
}
```

Обязательные предметные поля:

- `key_rate.value_percent` — конечное число;
- `key_rate.effective_from` — реальная календарная дата ISO;
- единица фиксирована схемой как процент годовых и не угадывается потребителем.

Официальные контрольные страницы: [веб-сервис Банка России](https://www.cbr.ru/development/dws/) и [история ключевой ставки](https://www.cbr.ru/hd_base/keyrate/).

### 2.4. `inflation.json`

Сохраняется предметная структура schema v2:

- `metadata.indicator_id`, `showcase_indicator_id`, `indicator_name`;
- `geography`, `coverage`, `measure`, `unit`, `frequency`;
- `data_through`;
- `annual[]` с обязательными `year`, `cpi_index`, `inflation_percent`.

К общему контракту добавляются `dataset_id` и `payload_checksum_sha256` только при повышении версии схемы. До миграции central validator обязан уметь проверять действующую schema v2 без неявного изменения файла.

Источник истины: [Росстат — цены и инфляция](https://rosstat.gov.ru/statistics/price), показатель ЕМИСС `31074`, срез «Российская Федерация / все товары и услуги / декабрь к декабрю предыдущего года».

### 2.5. `regions.json`

Целевая структура — объект, а не голый массив:

```json
{
  "metadata": {
    "schema_version": 2,
    "dataset_id": "regional_income",
    "status": "ok",
    "status_reason": null,
    "source_name": "Росстат",
    "source_url": "https://rosstat.gov.ru/labor_market_employment_salaries",
    "sources": [],
    "last_successful_fetch_at": "2026-08-31T03:00:00Z",
    "last_attempt_at": "2026-08-31T03:00:00Z",
    "payload_checksum_sha256": "<sha256 canonical regions>"
  },
  "regions": []
}
```

Каждая запись региона содержит:

- `region_id` — официальный код Росстата/ОКТМО, а не придуманный abbreviation;
- `name` — официальное наименование;
- `metrics.average_salary`;
- `metrics.median_salary`;
- `metrics.salary_p90`;
- `metrics.working_age_subsistence_minimum`;
- при необходимости `derived.population_percentile_offset`.

Каждая sourced-метрика содержит:

- `value`;
- `unit: "RUB_per_month"`;
- `reference_period`;
- `source_id`;
- `coverage` — например, полный круг организаций либо обследование без малого бизнеса;
- `method` — `published` или `derived_from_official_distribution`.

`mrot` должен быть удален или переименован. МРОТ и прожиточный минимум нельзя взаимозаменять. Если UI действительно нужен МРОТ, он добавляется отдельной метрикой с отдельным официальным источником.

`population_percentile_offset` допустим только как derived-метрика с полями `methodology_version`, `input_metric_ids` и воспроизводимой формулой. Значение «по умолчанию, если не уверены» запрещено. Если формула не утверждена, поле и зависящий от него результат должны быть недоступны.

Основные официальные разделы для будущего deterministic updater:

- [Росстат — рынок труда и заработная плата](https://rosstat.gov.ru/labor_market_employment_salaries);
- [Росстат — неравенство, медиана и распределение оплаты труда](https://rosstat.gov.ru/folder/13723);
- [Росстат — прожиточный минимум](https://rosstat.gov.ru/vpm/).

LLM, поисковая выдача и второй LLM-«аудитор» не являются источником или валидатором числовых значений. Они могут использоваться только вручную для discovery официального набора, но не в автоматической цепочке публикации.

## 3. Проверки перед сохранением

Проверки выполняются в указанном порядке. Candidate не считается доверенным до завершения всех этапов.

### 3.1. Transport и provenance

- только HTTPS с обычной проверкой TLS;
- hostname входит в allowlist конкретного набора;
- каждый redirect проверяется повторно, максимум три redirect;
- timeout, максимальный размер ответа и допустимый `Content-Type` заданы явно;
- пустой, HTML-error вместо файла, truncated ZIP/XML/JSON и неожиданный charset отклоняются;
- сохраняется SHA-256 исходных байтов;
- URL с API key не попадает в metadata или лог;
- источник должен быть официальным и заранее зарегистрированным в policy, а не найденным динамически во время production-run.

### 3.2. Синтаксис и JSON Schema

- JSON должен парситься без duplicate keys;
- schema выбирается только по паре `dataset_id + schema_version`;
- обязательные поля присутствуют;
- типы, enum, pattern, format и nullable-состояния совпадают;
- неизвестные поля запрещены;
- `NaN`, `Infinity`, numeric strings вместо чисел и невалидные даты запрещены;
- `status` согласован с nullable/payload-правилами.

### 3.3. Межполевые invariants

Общие:

- при `ok`: `status_reason === null`, payload непустой, source/checksum/last-success обязательны;
- при `stale`: payload идентичен последнему валидному snapshot, `status_reason !== null`, `last_successful_fetch_at` не меняется;
- при `unavailable`: финансовые значения отсутствуют, source-export/checksum/last-success равны `null`, `status_reason !== null`;
- `last_attempt_at >= last_successful_fetch_at`;
- `source_published_at <= last_successful_fetch_at <= now + clock_skew`;
- recomputed `payload_checksum_sha256` совпадает с metadata.

### 3.4. Диапазоны и предметные проверки

Диапазоны делятся на hard-invalid и anomaly-review. Hard-invalid означает невозможное/некорректное значение. Anomaly не объявляется ложным автоматически, но блокирует автоматическую публикацию до второй официальной проверки или ручного approval.

#### Ключевая ставка

- hard range: `0 <= value_percent <= 100`;
- точность: не более четырех знаков после запятой;
- `effective_from` не в будущем более чем на допустимый clock skew;
- дата не старше последней записи официальной истории и не откатывается относительно сохраненного snapshot;
- в истории нет дубликатов даты с разными ставками;
- текущая ставка совпадает в SOAP `KeyRate` и на независимой официальной контрольной странице/втором endpoint;
- изменение до 5 процентных пунктов включительно может пройти автоматически;
- изменение более 5 п.п. либо более 50% относительно прошлого значения получает `jump_requires_review` и не публикуется автоматически;
- threshold является quarantine-порогом, а не утверждением, что официальный резкий шаг невозможен.

#### Инфляция

- годы уникальны, строго возрастают и без пропусков от `MIN_YEAR` до `data_through`;
- `data_through` равен последнему году и не включает незавершенный календарный год;
- hard range: `0 < cpi_index <= 1000`, `-100 < inflation_percent <= 900`;
- `inflation_percent === cpi_index - 100` с допуском представления не более `1e-6`;
- срез, территория, охват и единица совпадают с зафиксированными metadata;
- изменение исторической записи более чем на 0.5 п.п. относительно последнего snapshot требует review и ссылки на официальную ревизию;
- межгодовое изменение инфляции более чем на 15 п.п. требует второй официальной проверки, но не считается автоматически ошибочным;
- контрольные значения должны включать официальные `109.52 -> 9.52%` за 2024 и `105.59 -> 5.59%` за 2025.

#### Региональная статистика

- набор содержит утвержденный полный roster регионов и федеральный aggregate; частичный набор не публикуется;
- `region_id` и `name` уникальны и совпадают с официальным справочником;
- все required metrics присутствуют для каждого региона либо весь dataset получает `stale/unavailable`;
- hard range зарплат: `1..10_000_000 RUB_per_month`;
- hard range прожиточного минимума/МРОТ: `1..1_000_000 RUB_per_month`;
- `salary_p90 >= median_salary` для одинакового охвата и периода;
- сравнение `median`, `average` и `p90` разрешено только при совместимом coverage; несовместимые обследования явно маркируются и не используются в одной percentile-формуле;
- reference period не в будущем и соответствует периоду официального файла;
- отрицательное изменение зарплаты более 10%, рост более 35%, снижение прожиточного минимума или его рост более 30% переводят candidate в `jump_requires_review`;
- переход на новую методологию требует новой `methodology_version` и не сравнивается как обычный скачок;
- числа нельзя извлекать из LLM-текста, snippet поисковика или неофициальной публикации.

### 3.5. Freshness

Freshness вычисляется validator по policy, а не по времени изменения файла в Git.

Для каждого набора задаются два горизонта:

- soft TTL: данные становятся `stale`, но последний валидный payload еще может использоваться с предупреждением;
- hard TTL: payload больше не используется; статус становится `unavailable`.

Начальная policy:

| Набор | Soft TTL | Hard TTL | Basis |
| --- | --- | --- | --- |
| Ключевая ставка | 72 часа без успешной официальной проверки | 7 суток | `last_successful_fetch_at`; возраст `effective_from` сам по себе не означает stale, если ставка официально не менялась. |
| Годовая инфляция | После официального deadline отсутствует завершенный предыдущий год | 90 суток после deadline | `data_through` и официальный календарь публикаций Росстата. |
| Средняя зарплата | 120 суток от последнего доступного официального месяца | 180 суток | `reference_period` и календарь Росстата. |
| Прожиточный минимум | Нет значения на текущий календарный год после publication grace | 90 суток после начала года | `reference_period`. |
| Медиана/p90 | Следующий выпуск просрочен более чем на 90 суток | Один полный цикл публикации плюс 12 месяцев | Официальная периодичность конкретного обследования. |

Точные publication deadlines и cadence должны храниться в version-controlled policy и подтверждаться официальным календарем перед реализацией. Изменение policy проходит code review.

## 4. Поведение при validation error

1. Candidate помещается только во временную директорию runner и не копируется в repository JSON.
2. В лог записываются dataset, validator stage, безопасный reason code и краткая диагностическая информация.
3. Последний сохраненный snapshot повторно проверяется своей версией schema и semantic-validator.
4. Если snapshot валиден и не перешел hard TTL, публикуется тот же payload со статусом `stale`; финансовые значения и `last_successful_fetch_at` не меняются.
5. Если валидного snapshot нет или hard TTL истек, публикуется schema-valid `unavailable` без числового payload.
6. Candidate с anomaly не «исправляется», не clamp-ится и не заменяется средним/предыдущим числом под статусом `ok`.
7. Workflow создает alert и сохраняет diagnostic artifact; для `jump_requires_review` требуется явное approval на основе второго официального подтверждения.

## 5. Поведение при `stale`

- используется только ранее полностью проверенный официальный payload;
- source URL, checksum, reference period и `last_successful_fetch_at` относятся к этому payload и сохраняются;
- обновляются только `status`, `status_reason` и `last_attempt_at`;
- потребитель показывает год/дату актуальности и предупреждение;
- stale не может автоматически стать `ok` без новой успешной загрузки и полной проверки;
- после hard TTL тот же payload перестает участвовать в расчетах и состояние становится `unavailable`;
- частично обновлять один регион, год или метрику внутри stale snapshot запрещено.

## 6. Поведение при network failure

Network failure включает DNS, timeout, TLS, connection reset, HTTP не-2xx, redirect вне allowlist и превышение размера ответа.

Алгоритм тот же, что для validation error, но `status_reason` отражает transport-причину. Повторные попытки ограничены, используют exponential backoff с jitter и не превышают общее время job. Нельзя отключать TLS verification или переключаться на неофициальный mirror.

Недоступность одного обязательного источника composite `regions.json` делает весь candidate неполным. Предыдущий snapshot остается атомарно целым; смешивать новые данные одного источника со старыми данными другого без отдельной согласованной версии запрещено.

## 7. Fail-closed публикация

### 7.1. Двухфазная запись

Updater формирует candidate в памяти/temporary file. До публикации выполняются:

1. schema validation;
2. semantic validation;
3. comparison/anomaly validation;
4. canonical serialization;
5. повторная проверка serialized bytes;
6. `fsync` temporary file и atomic rename в пределах одного filesystem.

При crash до rename существующий JSON остается неизменным. Temporary files удаляются в `finally` и не попадают в Git.

### 7.2. Независимый CI-gate

Перед commit workflow запускает `validate_financial_data.js --all --mode publish`. Gate:

- проверяет все три JSON независимо от того, какой updater работал;
- запрещает `git add` при любой schema/semantic/checksum ошибке;
- проверяет, что diff не содержит неожиданных financial JSON;
- проверяет согласованность consumer-supported schema versions;
- не оборачивается в `|| true` и не маскирует exit code;
- запускается также на pull request, изменяющий updater, schema, policy, consumer или financial JSON;
- использует concurrency lock, чтобы два scheduled run не публиковали snapshots поверх друг друга.

Handled `stale/unavailable` является schema-valid безопасным результатом и может быть committed, чтобы UI честно отразил состояние. После безопасного commit отдельный шаг завершает job warning/failure для alerting, если хотя бы один dataset не `ok`.

### 7.3. Defense in depth у потребителя

`js/api.js` повторно проверяет поддерживаемые `schema_version`, status и минимальные invariants. При неизвестной версии, просроченном hard TTL, checksum/schema mismatch или `unavailable` числовые данные не возвращаются. UI не использует `0`, среднее, hardcoded fallback или cached legacy schema.

Service worker меняет cache version при каждой breaking schema migration. Runtime validation не заменяет CI-gate: пользователь не должен первым обнаруживать плохой JSON.

## 8. Файлы будущей реализации

### Новые файлы

- `schemas/common-metadata.schema.json`;
- `schemas/rates.schema.json`;
- `schemas/inflation.schema.json`;
- `schemas/regions.schema.json`;
- `data_validation/policies.js` — allowlists, TTL, диапазоны и quarantine thresholds;
- `data_validation/validate.js` — schema dispatch, semantic validation и publish CLI;
- `tests/data-validation/` — fixtures и тесты.

Если выбран Ajv, потребуются `package.json` и lock-файл с зафиксированной major/minor-версией. Код не должен загружать schema или зависимости из сети во время scheduled run.

### Существующие updater/data/workflow

- `update_rates.js`;
- `update_inflation.js`;
- `update_regions.js`;
- `rates.json`;
- `inflation.json` — только если formal schema требует миграции;
- `regions.json`;
- `.github/workflows/rates.yml` либо новый единый `data-validation.yml`;
- `sw.js` при breaking schema migration.

### Потребители, которым потребуется schema-aware migration

- `js/api.js`;
- `index.html`;
- `mortgage.html`;
- `car-vs-taxi.html`;
- `millionaire.html`;
- `financial-freedom.html`;
- `inflation-shredder.html`;
- `genetic-wealth.html`;
- `wealth.html`.

Реализация должна быть разбита минимум на три PR: validation framework/CI, deterministic updaters и consumer migration. Breaking JSON не публикуется до готовности всех его потребителей и обновления service worker.

## 9. Необходимые тесты

### Schema tests

- валидный fixture для каждого статуса и версии;
- отсутствие каждого обязательного поля;
- неверные типы, enum, date/time, URL, checksum и неизвестные поля;
- legacy schema без явной migration отвергается;
- duplicate JSON keys отвергаются до обычного `JSON.parse` либо отдельным strict parser.

### Semantic unit tests

- границы hard ranges и значения сразу за границей;
- все межполевые зависимости статусов;
- CPI/inflation equality;
- пропуск, duplicate и reorder годов;
- duplicate регионов и несовместимый coverage;
- `p90 < median`;
- путаница МРОТ/прожиточного минимума;
- canonical payload checksum;
- даты из будущего, несуществующая дата, timezone и clock skew.

### Freshness и state transitions

- `ok -> ok`, `ok -> stale`, `stale -> ok`, `stale -> unavailable` после hard TTL;
- failure без snapshot -> `unavailable`;
- stale payload байт-в-байт совпадает с последним успешным payload;
- frozen clock на границах каждого TTL;
- старый `effective_from` при ежедневно подтвержденной неизменной ставке остается `ok`.

### Updater integration tests

- успешные официальные fixtures;
- timeout, DNS/TLS/HTTP failure, redirect loop/off-allowlist;
- неправильный Content-Type, oversized/truncated response;
- пустой, частичный и изменившийся формат источника;
- legitimate unchanged source не меняет финансовый payload;
- crash до/после temporary write подтверждает atomicity;
- секрет API не появляется в JSON, diff или логах.

### Anomaly/quarantine tests

- изменение ровно на threshold проходит;
- изменение выше threshold дает `jump_requires_review` и не публикуется;
- approved official revision проходит только с явным fixture/approval record;
- смена methodology не сравнивается как обычный ряд.

### Workflow tests

- invalid candidate не достигает `git add`/push;
- один невалидный dataset блокирует публикацию всего batch;
- safe `stale/unavailable` публикуется и одновременно создает alert;
- два параллельных run сериализуются;
- PR gate запускается при изменении updater/schema/policy/JSON/consumer;
- `git diff --name-only` содержит только ожидаемые data-файлы.

### Consumer smoke/e2e

- каждый потребитель открывается с `ok`, `stale`, `unavailable`, unknown schema и hard-expired snapshot;
- нет `NaN`, `undefined`, нулевых или hardcoded fallback;
- stale показывает актуальность;
- unavailable блокирует только расчеты, которым нужен отсутствующий показатель;
- cache migration не возвращает legacy JSON.

## 10. Риски и меры снижения

| Риск | Последствие | Мера снижения |
| --- | --- | --- |
| JSON Schema создает ложное ощущение полной проверки | Формально правильное, но экономически неверное число проходит | Отдельные semantic, temporal, provenance и anomaly validators. |
| Legitimate резкий шаг попадает в quarantine | Временная задержка обновления | Порог означает review, а не «невозможно»; второе официальное подтверждение и ручной approval. |
| Слишком широкий hard range пропускает ошибку | Правдоподобное неверное число | Сравнение с предыдущим snapshot, независимый официальный cross-check и coverage invariants. |
| Слишком узкий range блокирует кризисные значения | Ложный `stale` | Hard range оставлять только для невозможных значений; operational threshold делать reviewable policy. |
| Формат официального XLSX/XML меняется | Updater перестает обновляться | Semantic headers, fixtures нескольких версий, `source_format_changed`, сохранение stale. |
| Региональные источники имеют разные периоды | Смешанный snapshot вводит в заблуждение | Dataset-level atomic publish, period/coverage на каждой метрике, запрет partial merge. |
| Медиана/p90 публикуются реже средней зарплаты | Dataset часто stale | Metric-specific cadence; UI показывает период каждой метрики; не экстраполировать без утвержденной модели. |
| Текущий LLM updater выглядит убедительно, но невоспроизводим | Публикация вымышленных региональных чисел | Полностью исключить LLM из production data path. |
| Переименование `mrot` ломает `wealth.html` | Runtime regression | Версированная migration и атомарное обновление consumer + JSON + SW. |
| Stale используется бесконечно | Старое число выглядит актуальным | Soft и hard TTL; после hard TTL только unavailable. |
| Timestamp вызывает ежедневные commits | Шумная история | Коммитить verification metadata по policy; финансовый payload сравнивать отдельно; не жертвовать наблюдаемостью ради отсутствия diff. |
| Local JSON изменен вручную после updater | Source checksum не обнаружит подмену payload | Отдельный canonical `payload_checksum_sha256` и повторная CI-проверка. |
| Два scheduled run конфликтуют | Потеря более нового snapshot | Workflow concurrency и проверка base SHA перед push. |
| Clock/timezone runner неверны | Ложный stale/future-date | UTC, injected clock в тестах, допустимый небольшой skew, NTP-hosted runner. |
| Breaking schema попадает в старый cache | Потребители читают неверную форму | Версия SW cache и consumer compatibility gate до публикации. |

## Почему эта архитектура предпочтительнее альтернатив

### Против ad-hoc проверок внутри каждого updater

Локальные `if` неизбежно расходятся: сейчас три набора уже имеют три разных failure-mode. Общий publish-validator создает единственную обязательную точку контроля, а предметные modules сохраняют нужную специфику.

### Против «только JSON Schema»

JSON Schema хорошо проверяет форму, но не доказывает, что `p90 >= median`, CPI согласован с инфляцией, период завершен, ряд полный, источник официальный или скачок требует review. Поэтому schema — первый, а не последний этап.

### Против одной универсальной финансовой схемы

У ставки одна дата вступления в силу, у инфляции последовательный годовой ряд, у регионов несколько источников и периодов. Универсальный payload скроет эти различия и ослабит типизацию. Общими остаются metadata/provenance/state-machine; предметные payload и invariants раздельны.

### Против LLM-аудитора

LLM-ответ недетерминирован, не является первичным источником и не дает воспроизводимого checksum/периода/охвата. Deterministic parser плюс официальный файл позволяет повторить результат и объяснить каждое число.

### Против полного отказа при любой сетевой ошибке

Последний проверенный официальный snapshot остается истинным историческим фактом в пределах hard TTL. Состояние `stale` сохраняет доступность без притворства, что обновление прошло. Полный отказ оправдан только при отсутствии доверенного snapshot или превышении hard TTL.

### Против бесконечного fallback на последнее число

Soft/hard TTL не позволяют временной доступности превратиться в вечное молчаливое устаревание. После hard TTL числовой расчет прекращается.

### Против проверки только в браузере

Runtime guard защищает пользователя, но не предотвращает попадание плохого файла в Git, cache и другие потребители. Candidate-validation, atomic write и CI-gate блокируют проблему до публикации; browser validation остается defense in depth.

## Что не входит в P0.10

- изменение формул финансовых калькуляторов, не связанное с состоянием входных данных;
- новый backend или база данных;
- прогнозирование отсутствующих значений;
- автоматическое «исправление» anomalies;
- использование неофициальных mirrors;
- утверждение конкретной формулы `population_percentile_offset` без отдельной продуктовой и статистической методологии;
- изменение дизайна страниц, кроме необходимого отображения `stale/unavailable` в будущей реализации.

## Критерии приемки будущей реализации

- Ни один financial JSON не может быть committed без schema + semantic + provenance + freshness validation.
- Каждое опубликованное число воспроизводимо из официального source artifact и связано с периодом/охватом.
- Невалидный candidate никогда не заменяет последний доверенный payload.
- `stale` ограничен hard TTL; `unavailable` не содержит числовых fallback.
- LLM отсутствует в production data path региональной статистики.
- Workflow, updater и browser consumer независимо отвергают неизвестную/поврежденную схему.
- Breaking migration выполняется атомарно для JSON, consumers и service-worker cache.
