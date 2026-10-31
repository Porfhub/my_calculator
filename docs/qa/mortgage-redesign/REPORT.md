# Ипотечный редизайн — реализация и QA

Дата: 31.10.2026. Ветка **codex/mortgage-hybrid-redesign**. Исходный main **fd292a727ce7cace1f785dfcdcf6aaf7bb46cf45**. [PR #92](https://github.com/Porfhub/my_calculator/pull/92) **open, ready for review, не merged**. Implementation SHA **37f52d5516c87f720ef6d0987f1cb877cd07175a**; итоговый SHA документирующего commit доступен в PR.

## Результат и границы

Реализован утверждённый hybrid visual direction с UX B+ на production-движке. Платёж главный, базовый срок отделён от закрытия с досрочными. Mobile hero перед формой; спокойный состав выплат; графитовая тема; регулярные/разовые отдельно с общей стратегией и явно подписанными эффектами. Есть месяцы, discoverable schedule с первым открытым годом, точечное добавление/изменение/удаление, один sticky, видимые PNG/share.

Новая/действующая ипотека, история, комфортный/известный платёж, страховка, обе стратегии и сочетания доплат сохранены. Production simulateMortgage расширен только termMonths для нового кредита. Демонстрационные формулы/PNG прототипа не перенесены. Налоговый вычет не возвращался.

Сохранены fail-closed, все CalculatorState states, независимые финансовая/графическая диагностика, 50-летний предел, округления и страховые правила, counter 110360838/semantics goals. Primary-render error теперь очищает старый результат и закрывает экспорт; signature guard требует соответствия текущего state показанному READY-результату. Очистка поля доплаты в schedule теперь удаляет её из модели.

В старом production JS share копировал текущий URL без сериализации state. Добавлено полноценное сохранение/восстановление параметров/доплат в mortgage URL и dialog fallback при отказе clipboard. Обычные ранее скопированные URL открывают прежний пример. Открытие share не создаёт conversion.

Общий clone-based exporter не менялся: results-panel, canvas→img, 560px + поля, полный состав/условия/эффект/график, guards и cleanup. Реальные PNG обеих тем просмотрены; ошибка наложения закрытого details устранена export-only разбивкой.

Другие калькуляторы/общие стили/общий exporter/JSON/schema/updaters не изменялись. Новых runtime-файлов нет, allowlist остаётся 35. SW — v17 с прежними URL/политикой; validation PR path-filter включает mortgage/UI tests/SW. Merge/deploy/реклама не выполнялись.

## Исходная база и CI

- До изменений: npm test **128 passed**, publish gate rates/inflation/regions успешен.
- Первый sandbox-прогон дал пять EPERM rename в atomic-write tests; повтор с обычными правами прошёл. Проверки/валидатор не ослаблялись.
- PR #91 merged 30.10, SHA 25c233d196d63589ebfdba63cf437c89f2ba67ca.
- Scheduled [updater #155](https://github.com/Porfhub/my_calculator/actions/runs/41187044974) и [Yandex deploy #49](https://github.com/Porfhub/my_calculator/actions/runs/41187072248) успешны на исходной базе. У deploy через API подтверждены verify/sync/website smoke. Это выпуск старого UI, не этого редизайна.
- Финальный npm test **134 passed, 0 failed/skipped**; npm run validate:data — все три набора проходят.
- Branch-protection API возвращает 403 integration; обязательность checks в настройках не подтверждена. [Validation run 41217203209](https://github.com/Porfhub/my_calculator/actions/runs/41217203209) на implementation SHA 37f52d5 прошёл: npm tests и publishable datasets success; Vercel success. Последующее обновление только QA helper/документов повторяет checks; [актуальный статус](https://github.com/Porfhub/my_calculator/pull/92/checks).

## Числа до/после

[engine-comparison.json](engine-comparison.json): **66 сценариев, полное совпадение каждой строки schedule**, платежей, процентов, страховки, totalPaid и realTerm. Обе стратегии, новая/действующая, term/payment, страховка ±, none/regular/once/combined, нулевая ставка и 50-летний предел. Для фиксированных ключевых месяцев добавлена независимая regression-проверка в npm test.

В таблице округлены отображаемые рубли; JSON хранит точные значения. До и после значения одинаковы.

| Сценарий | Платёж, ₽ | Проценты, ₽ | Страховка, ₽ | Выплаты, ₽ | Месяцы |
| --- | ---: | ---: | ---: | ---: | ---: |
| Новая, 5 650 000 ₽ / 12% / 15 лет, без доплат | 67 809 | 6 555 709 | 0 | 12 205 709 | 180 |
| Те же условия, 20 000/мес. + разово 150 000 (м1), 200 000 (м12), уменьшать срок | 67 809 | 2 926 526 | 0 | 8 576 526 | 94 |
| Действующая, остаток 5 300 000, известный платёж 85 000, combined, уменьшать платёж, страховка | 85 000 | 2 340 837 | 219 488 | 7 860 325 | 96 |
| Нулевая ставка, минимальный кредит 1 ₽ / 12 мес. | 0,08333 | 0 | 0 | 1 | 12 |

Дополнительная проверка нового месячного ввода: 8 100 000 − 2 450 000, 12%, **15 лет 6 мес. → 67 032 ₽/мес.** Регулярные 20 000: экономия 3 305 720 ₽, закрытие 8 лет 10 мес.; + разово 150 000 в месяц 1: экономия **3 571 132 ₽**, закрытие 8 лет 5 мес. Hero остаётся «15 лет 6 мес.». Экономии не складываются.

## Браузерная матрица и доказательства

[browser-results.json](browser-results.json) — **55 пройденных браузерных проверок** локального HTTP-сайта в headless Chrome 156.0.8078.48. Внешние запросы Метрики блокируются, проверяются вызовы stub; денежные вводные в analytics не передаются. Это responsive emulation, не Android/iOS hardware QA.

Проверены: обе темы 1440×900 / 390×844 / 360×844, initial/scrolled/focused viewport/sticky, отсутствие horizontal overflow и наличие формы на первом экране; regular-only/one-time-only/combined, обе стратегии; add/edit/clear/remove из формы/schedule; term/comfort/existing-known и восстановление share; страховка; недопустимый взнос/невозможный платёж/восстановление; CBR ok/stale/unavailable без изменения snapshot; Chart.js failure; isolated primary-render/model exceptions и восстановление; реальные PNG desktop/mobile; clipboard success/fallback, labels/focus/selected states, native radio/summary/button; smoke honest-credit/rent-vs-mortgage.

Скриншоты реализации, не reference:

| Вид | Светлая | Графитовая |
| --- | --- | --- |
| Desktop 1440×900 | [desktop-light](desktop-light.png) | [desktop-dark](desktop-dark.png) |
| Mobile 390×844 | [mobile-light](mobile-390-light.png) | [mobile-dark](mobile-390-dark.png) |
| Mobile 360×844 | [360-light](mobile-360-light.png) | [360-dark](mobile-360-dark.png) |
| Доплаты вместе | [desktop](desktop-combined.png), [mobile](mobile-390-combined-light.png) | [mobile](mobile-390-combined-dark.png) |
| Помесячный график | [desktop](desktop-schedule.png) | [mobile](mobile-390-schedule-dark.png) |
| Реальный полный PNG | [export-light](export-light.png) | [export-dark](export-dark.png) |

Дополнительно: [исходный desktop](baseline-desktop.png), [исходный mobile](baseline-mobile.png), [длинный список](mobile-360-long-list.png), [focus + уменьшенный viewport](mobile-390-focused-viewport.png), [ошибка ввода](desktop-invalid.png), [Chart.js unavailable](chart-unavailable.png), [PNG исходного примера](export-example.png), [PNG при mobile viewport](export-mobile.png). Все экспорты реально скачаны через Blob/download. Scene cleanup проверен.

## Точные ограничения

**Offline:** [offline-precache.json](offline-precache.json). Унаследованный unversioned https://cdn.tailwindcss.com загружается как script, но CORS Cache.add для него в этой среде падает Failed to fetch; существующий SW addAll из-за этого не устанавливается. Precache URL и стратегия сверены с исходным main; изменён только cache v16→v17. Полноценный offline reload не объявляется пройденным. Общий ремонт CDN/SW не включён в ипотечный редизайн и не замаскирован обходом.

[Vercel preview](https://my-calculator-git-codex-mortgage-hybrid-redesign-porf.vercel.app/mortgage.html) собран, но anonymous Chrome перенаправлен на Login – Vercel; [диагностика](preview-smoke.json). Настройки доступа не менялись. Preview не выдаётся за пройденный внешний UI smoke; реальные implementation captures выше сняты с локального HTTP-сайта.

Нет физических Android/iOS, экранной клавиатуры, реального safe-area/PWA standalone, аппаратного clipboard/download, проверки кабинета Метрики и фактического приёма goals. Скриншот уменьшенного viewport не является аппаратной клавиатурной проверкой. Прямой новый read домена через web tool не удался; факт прежнего deploy подтверждён Actions и его website smoke, не предположением из merge.

## Короткий ручной QA владельца

На preview PR, прежде всего Samsung S25+:

1. Изменить цену/взнос, открыть месяцы, ввести дробную ставку. Проверить цифровую/decimal клавиатуру, скролл, safe-area и скрытие sticky; закрыть клавиатуру и вернуться «К результату».
2. Ввести 20 000 регулярно и 150 000 разово, переключить общую стратегию. Открыть график, изменить и очистить доплату месяца; проверить итог/список.
3. Сохранить PNG и открыть файл; поделиться ссылкой и открыть в новой вкладке. Проверить воспроизведение условий. При наличии iOS повторить download/clipboard.
4. Ввести недопустимый взнос, убедиться, что старый результат/экспорт недоступны; исправить. Проверить обе темы.

Далее: review → отдельный согласованный merge/штатный deploy → фактический production smoke/cache/Метрика → отдельное решение о повторном Direct с прежней кампанией/историей.
