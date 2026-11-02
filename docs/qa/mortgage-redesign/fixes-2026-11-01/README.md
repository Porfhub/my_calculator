# Исправления перед выпуском — 01.11.2026

Продолжение [PR #92](https://github.com/Porfhub/my_calculator/pull/92), база замечаний **3a9cf442d2c3bb893f4ea0459841d8cbd6dba949**. Основатель сообщил об успешной проверке основных расчётов, досрочных и ошибок на ноутбуке и Samsung. Здесь закрыты только три замечания; новый аудит/редизайн не проводился.

## Что изменено

1. **Страховка.** Label остаётся областью нажатия >=44×44 px, но дорожка теперь position:relative и сама содержит thumb. Thumb центрируется top:50% / translateY(-50%), checked перемещает его внутри дорожки. Native checkbox, прежнее accessible name, Space и видимый focus сохранены.
2. **Sticky.** Удалены безусловное CSS-скрытие и класс mortgage-input-focused. Решение принимают прежние hero visibility + visualViewport keyboard detector. После восстановления высоты viewport sticky доступен при сохранённом input focus. Обычный scroll не вызывает blur. Safe-area и остальная логика visualViewport не менялись.
3. **PNG.** Полноценная компактная export-only сводка: бренд/платёж → один состав выплат → условия → досрочные при наличии → график на ширину 520 CSS px с короткой легендой. Нет повторных итогов/«Досрочного капитала»/пустой экономии. Для >3 разовых — количество и общая плановая сумма; в share по-прежнему полный список. Процентная и страховая экономия подписаны отдельно.

Export использует клон текущего READY-отчёта. Общий takeScreenshot сохраняет guard, share_click и cleanup; в него добавлен optional preparation hook (3 строки), определённый только mortgage.html. В hook создаётся **отдельный Chart.js canvas из копии тех же series**: events=[], tooltip disabled, animation=false, point/hover radii=0, фиксированная ширина. Готовый растр заменяет canvas; изолированный Chart уничтожается в finally. Состояние живого Chart не меняется. Остальные калькуляторы не определяют hook и идут прежним путём.

Математика/округления/страховые правила, share codec, финансовые JSON/схемы/источники и смысл аналитики не менялись. Merge/deploy не выполнялись.

## Проверки

- **140/140 npm tests**, 0 failed/skipped; publish validation всех трёх JSON проходит.
- Повторный compare-mortgage-engine: **66 сценариев совпали построчно** с исходным production-движком.
- [results.json](results.json): **51 browser checks**, Chrome, desktop 1440×900 и mobile 390×844/360×844; responsive/touch/visualViewport emulation.
- 8 сочетаний on/off × light/dark × desktop/mobile: геометрия track/thumb, >=44px hit area, keyboard Space, focus, checked и model insurance совпадают.
- Android Back смоделирован resize visualViewport 500→844 **без blur**: input остаётся активным; scroll вниз показывает sticky; первое нажатие возвращает к hero и скрывает sticky. Это не аппаратная проверка Android.
- 8 вариантов PNG: desktop/mobile × light/dark × base/combined. Платёж, выплаты, проценты, страховка, экономии и фактический срок сверены с DOM и production-результатом того же READY-state.
- Для каждого варианта скачан PNG с активной подсказкой после реального browser click/touch. **Растр экспортного графика побайтно совпал с чистым растром до hover/touch.** Во время подготовки пиксели/tooltip/active indices живого графика не меняются; после экспорта два исходных Chart instances остаются, stage удалён.
- Реальные сбои clean-chart toDataURL и html2canvas: no download, stage/изолированный chart очищены, живой Chart сохранён. INVALID_INPUT не допускает даже подготовки PNG.
- 120 разовых: компактная плановая сумма/количество в PNG, все 120 записей сохраняются в share.
- [other-pages.json](other-pages.json): реальные PNG скачаны из honest-credit и rent-vs-mortgage; mortgage hook отсутствует, cleanup успешен.
- PNG и снимки переключателя визуально просмотрены. Новый размер: **1200×1710** без досрочных, **1200×2058** с regular+one-time; длинный список также 1200×2058. Старый приложенный к PR export-light имел 1200×3578.

Воспроизведение: node dev_tools/mortgage-browser-qa.cjs --release-fixes; отдельно --release-fixes-other-pages. Запросы Метрики блокируются; кабинеты не проверяются.

## Новые снимки переключателя

| Устройство/тема | Выключен | Включён |
| --- | --- | --- |
| Desktop light | [off](insurance-desktop-light-off.png) | [on](insurance-desktop-light-on.png) |
| Desktop dark | [off](insurance-desktop-dark-off.png) | [on](insurance-desktop-dark-on.png) |
| Mobile light | [off](insurance-mobile-light-off.png) | [on](insurance-mobile-light-on.png) |
| Mobile dark | [off](insurance-mobile-dark-off.png) | [on](insurance-mobile-dark-on.png) |

## Реальные исправленные PNG

| Вид | Без досрочных | Regular + one-time | Combined после tooltip/touch |
| --- | --- | --- | --- |
| Desktop light | [PNG](png-desktop-light-base.png) | [PNG](png-desktop-light-combined.png) | [PNG после касания](png-desktop-light-combined-after-touch.png) |
| Desktop dark | [PNG](png-desktop-dark-base.png) | [PNG](png-desktop-dark-combined.png) | [PNG после касания](png-desktop-dark-combined-after-touch.png) |
| Mobile light | [PNG](png-mobile-light-base.png) | [PNG](png-mobile-light-combined.png) | [PNG после касания](png-mobile-light-combined-after-touch.png) |
| Mobile dark | [PNG](png-mobile-dark-base.png) | [PNG](png-mobile-dark-combined.png) | [PNG после касания](png-mobile-dark-combined-after-touch.png) |

[120 разовых платежей](png-mobile-long-list.png) · [живой график с tooltip перед mobile PNG](tooltip-mobile-dark-combined.png) · [sticky после закрытия клавиатуры, фокус сохранён, 390px](sticky-390-closed-focused.png) · [360px](sticky-360-closed-focused.png).

## Что осталось на физическом Samsung

1. На обновлённом preview ввести сумму → закрыть клавиатуру кнопкой **«Назад»**, не снимая фокуса → прокрутить вниз → нажать «К результату» один раз. Проверить также safe-area/отсутствие перекрытия.
2. Проверить страховку пальцем on/off в обеих темах.
3. Коснуться точки графика, оставить tooltip, сохранить PNG и открыть скачанный файл: tooltip/большая точка отсутствуют, условия и цифры текущие.

Предыдущая проверка основателя на Samsung учтена как его сообщение; эти новые действия на физическом устройстве агентом не выполнялись. Существующие ограничения Vercel login и offline Tailwind precache не пересматривались. Следующий шаг — приёмка этих трёх правок; merge/deploy остаются отдельным решением.
