# Ясномера — техническая передача

Обновлено 02.11.2026. Исходная база реализации fd292a727ce7cace1f785dfcdcf6aaf7bb46cf45. Main/production и PR разделены в master status.

## Архитектура и scope

Статический сайт без сборки. mortgage.html содержит форму, проверенный помесячный движок, состояние, адаптеры и mortgage-scoped CSS. Общие js/calculator-state.js, js/theme.js, js/api.js и css/product-polish.css не изменены. Другие HTML-калькуляторы не менялись.

Публикация по прежнему allowlist из 35 файлов. Новых runtime-зависимостей/файлов нет; dev_tools/tests/docs в payload не попадают. sw.js — только cache v17 вместо v16, без изменения precache/network-first поведения. Validate Financial Data теперь запускается и при ипотечном/UI/SW PR; steps/gates не ослаблены.

## Production-модель и адаптеры B+

simulateMortgage сохранён; единственное расширение входа — termYears * 12 + termMonths для новой ипотеки. Округление/проценты/страховка/досрочная стратегия/50-летний горизонт прежние. Для действующей ипотеки прежняя remaining-month модель сохранена.

simulateMortgageRegularOnly вызывает тот же production simulator с временно пустой customPrepayments и восстанавливает исходный объект в finally. Все эффекты сравниваются с simulateMortgage(false). Диаграмма/полная сумма/schedule/export используют simulateMortgage(true), то есть совокупный сценарий. Страховка отдельно от процентов; обязательный платёж без страховки; новая ипотека без взноса в общих кредитных выплатах.

С 02.11 renderMortgageBenefits обновляет одну live comparison card через presentation-only mortgageComparisonMarkup(base, combined), базовый срок hero и прежний компактный export summary. Regular-only helper сохранён для совместимости/проверок, отдельного live результата больше нет. Общая стратегия radio управляет прежним state.prepaymentStrategy. Добавление/удаление из формы и редактирование schedule используют один state.customPrepayments. Пустое значение schedule теперь действительно удаляет доплату.

Раскладка live uses CSS grid + display:contents для results-panel и screenshot-area: desktop форма слева, hero/состав/действия справа, затем две самостоятельные формы доплат в одном ряду, единая карточка сравнения, динамика/schedule. На узком экране формы располагаются последовательно. На mobile hero перед формой. С 01.11 export-clone заменяется компактным export-only отчётом из того же READY-результата. Картинки интерфейса из reference в runtime не встраиваются.

## Состояния, экспорт и диагностика

Сохранён CalculatorState с LOADING/READY/INVALID_INPUT/CALCULATION_IMPOSSIBLE/DATA_UNAVAILABLE/ERROR. Невалидный ввод очищает текст/диаграммы/эффекты/расписание. primary_render exception теперь переводит в ERROR и очищает старый результат; экспорт закрыт до восстановления.

window.canExportCalculation требует READY и совпадения JSON signature текущего state/tab с успешно показанным результатом. Нельзя экспортировать ещё не отрисованную мутацию. Отказ Chart.js отдельно диагностируется и допускает финансовый результат без диаграммы, как в прежнем контракте.

PNG: прежний takeScreenshot('results-panel', 'yasnomera-mortgage-calculation.png'), width 560 + поля 20, clone-based export и cleanup finally. С 01.11 optional preparation hook заменяет содержимое изолированного клона компактным export-only отчётом. Цифры/условия формируются из текущего READY-результата; дубли и пустая экономия убраны. Длинный список сводится к количеству/плановой сумме только в PNG, share сохраняет все записи. График рендерится в отдельный 520×230 canvas из snapshot series тех же base/combined schedules (не из live pixels); events/tooltip/animation выключены, point/hover radii нулевые, Chart уничтожается в finally. Даже отказ отрисовки live Chart не подставляет старые series. Общий exporter имеет 3-строчный optional hook; у других калькуляторов он отсутствует.

Share: buildMortgageShareURL/restoreMortgageShareURL сериализуют все числовые state-входы, tab/mode/strategy/booleans/custom map. Legacy plain URL открывает пример, unrelated UTM сохраняются. Отсутствующий/запрещённый clipboard открывает native dialog с выделяемой ссылкой. Восстановление ссылки не создаёт calculate_success.

Метрика: counter 110360838; прежняя once-per-page дедупликация calculate_success после валидного изменения/успешной детализации. Тема обновляет цвета Chart.js напрямую без пересчёта/goal. mortgage_diagnostic — categorical params stage/kind, без сумм. share_click остаётся началом действия.

## Mobile и доступность

Числовые поля первичны; desktop sliders непосредственно под числами. Mobile sliders скрыты как в PR #90. Один sticky с платежом/возвратом, safe-area padding. IntersectionObserver скрывает sticky у hero, прежний visualViewport handler — при открытой клавиатуре. Сам по себе input focus sticky больше не скрывает; blur при scroll не вызывается.

Native radio/fieldset, details/summary и year-header button с aria-expanded/controls поддерживают клавиатуру. Первый год раскрыт при входе в schedule; переход не фокусирует input. Денежные поля/месяцы имеют labels; видимые selected/focus states. Monthly cards на mobile, полноценные колонки на desktop; годовые агрегаты подписаны.

## Воспроизведение проверки

- npm test; npm run validate:data.
- node dev_tools/compare-mortgage-engine.cjs — исходная функция из git show fd292a7:mortgage.html против текущей; 66 сценариев, полное сравнение каждой строки, JSON-результат в docs/qa.
- node dev_tools/mortgage-browser-qa.cjs — локальный HTTP server + headless Chrome; PLAYWRIGHT_MODULE или установленный playwright; QA_BROWSER для browser channel. Нет публикации, запросы Метрики блокируются.
- --baseline у browser QA получает исходный HTML из git; пути runtime остаются корневыми.
- tests/ui-state/mortgage-engine-baseline.test.js сверяет результаты и ключевые месяцы с зафиксированным baseline с допуском 0.00001 ₽.

Windows sandbox не разрешает rename в atomic-write tests; полный suite запускался с обычными правами. Продакшен-валидатор не ослаблялся. PR #92 открыт; implementation 37f52d5 прошёл GitHub validation run 41217203209 и Vercel. Preview ограничен существующим Vercel login; защита не менялась. Детальные результаты, реальные файлы и ручной mobile QA — [REPORT.md](../qa/mortgage-redesign/REPORT.md).

## Финансовые данные и инфраструктурный долг

PR #91 уже merged. Deterministic inflation fixture и TTL/grace regressions сохранены. JSON/схемы/validator/updaters не изменялись. rates TTL 72ч/7дней, provenance/anomaly controls и fail-closed неизменны; реальное обновление 31.10 подтверждено workflow #155. Regions partial/legacy update_regions.js — прежний отдельный долг.

Yandex workflow #49 успешно выполнил allowlist/hash/sync/HTTP smoke для fd292a7. Эта реализация не опубликована. Branch-protection API недоступен integration (403), поэтому actual required-check policy не утверждается. Не обходить review/CI и не делать production dispatch.

Прежний транзитивный fast-uri advisory через Ajv, разная строгость analytics других калькуляторов и большой inline mortgage остаются отдельным долгом. Общего рефакторинга/обновления зависимостей в этом PR нет.

## Контекст и зеркало

docs/project-context — канон. Runbook 03_CONTEXT_MIRROR_RUNBOOK.md не меняется. Установленная задача копирует Markdown из текущего checkout в выделенную Drive-папку; она не делает git pull/merge и не подтверждает облачную загрузку. В этом поручении нет ручной правки Drive/перерегистрации задачи.

## Сравнение выплат 02.11

mortgageComparisonMarkup читает проверенные base/combined schedules и state; не меняет модель. Итог — principal + округлённые interest + insurance, согласован с существующим составом выплат/PNG. Обычная месячная нагрузка — первый scheduled payment + регулярная доплата, ограниченная оставшимся телом; разовые месяцы показывают payment + фактический prepayment своей строки. Страховка отдельно. При уменьшении платежа подпись «Нагрузка в первый месяц». До пяти разовых месяцев в раскрытии, остальные доступны в полном графике/share.

DOM: #mortgage-comparison после .prepayment-inputs, #comparison-content aria-live polite. Прежних #regular-result/#one-time-result нет. onClear скрывает карточку и очищает содержимое; при READY восстанавливает. Стили scoped к mortgage; новый runtime ресурс не добавлен. Export preparation, share codec и общие JS не менялись. Обновлены regression assertions в mortgage-browser-qa.cjs, но полный прежний browser runner в этой сессии не запускался: выполнена целевая CUA/Chrome проверка. [Актуальные доказательства и ограничения](../qa/mortgage-redesign/comparison-2026-11-02/README.md).
