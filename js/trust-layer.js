/*
 * This local, contextual help layer explains the current
 * calculator only; it does not collect inputs or change calculations.
 */
(function () {
    'use strict';

    const LABELS = {
        official: 'Официальные данные',
        input: 'Ваши данные',
        scenario: 'Допущения сценария',
        result: 'Расчётный результат',
        limitation: 'Ограничения'
    };

    const CALCULATORS = {
        'car-vs-taxi.html': {
            purpose: 'Для одного и того же числа поездок считаем расходы на такси и машину. У машины учитываем топливо, страховку, обслуживание и потерю стоимости за год. Пробег зависит от числа и длины поездок.',
            official: 'Официальные данные не используются.',
            input: 'Поездки в месяц, средняя цена такси, цена машины и расходы на неё. Длина поездки — в детальных настройках. Пресеты даны для примера.',
            scenario: 'В отдельном сценарии для покупки за свои деньги можно указать ожидаемую доходность на год. Умножаем цену машины на этот процент и прибавляем полученный доход к расходам на авто только в сценарии.',
            result: 'Какой вариант дешевле и на сколько в месяц и за год. Ручной сценарий доходности и ответы в анкете не меняют основное сравнение.',
            limitation: 'Кредит, парковку, внеплановые ремонты и будущие тарифы отдельно не считаем. Разница в цене не отражает время в пути и удобство.'
        },
        'financial-freedom.html': {
            purpose: 'Для трёх бюджетов считаем остаток по месяцам. Добавляем проценты на остаток и включённый пассивный доход, вычитаем расходы с учётом роста цен.',
            official: 'Ключевая ставка Банка России и годовой ряд инфляции Росстата / ЕМИСС. Статус виден на странице. Без пригодной ставки или ряда расчёт останавливается.',
            input: 'Накопления, расходы и сокращения трат. Пассивный доход можно задать суммой в месяц или процентами по отдельному вкладу.',
            scenario: 'Доходность накоплений по умолчанию — ключевая ставка минус 2 процентных пункта, с округлением до целого процента. Её можно изменить. Расходы растут по средней исторической инфляции, а переключатели экономии уменьшают бюджет на фиксированные суммы.',
            result: 'Срок, примерный месяц исчерпания и график остатков. «Более 30 лет» значит, что за предел расчёта вы вышли с остатком.',
            limitation: 'Ставки и пассивный доход в сценарии постоянны. Налоги и разовые траты отдельно не учтены. Будущие цены и ваш бюджет могут меняться иначе.'
        },
        'genetic-wealth.html': {
            purpose: 'Складываем расходы от рождения до 18 лет. Для каждого из четырёх этапов берём его месячный бюджет и длительность.',
            official: 'Годовой ряд инфляции Росстата / ЕМИСС. Статус виден на странице. Без пригодного ряда итог не показываем.',
            input: 'Месячный бюджет каждого этапа и выбранные условия семьи. Можно начать с пресета и подстроить суммы под себя.',
            scenario: 'Частный сад, помощь бабушки и другие условия меняют бюджет этапа по фиксированным правилам. Со второго года расходы индексируются по среднему историческому темпу инфляции.',
            scenarioNoteId: 'inflation-val-text',
            result: 'Два итога за 18 лет — в сегодняшних и будущих ценах. Средняя сумма в месяц рассчитана из итога в будущих ценах. График сравнивает этапы.',
            limitation: 'Модель не предсказывает расходы конкретной семьи и не разбивает бюджет на категории. Сравнения с ценой машины или квартиры помогают представить масштаб суммы.'
        },
        'honest-credit.html': {
            purpose: 'показывает график платежей и полную стоимость кредита по введённым условиям.',
            official: 'Официальные данные не используются.',
            input: 'Сумма, срок, ставка, комиссии и дополнительные платежи.',
            scenario: 'Расчёт использует введённые вами условия и тип платежа.',
            result: 'Расчётные платежи, переплата и график для этого набора условий.',
            limitation: 'Не заменяет договор: банк может изменить ставку, комиссии и порядок платежей.'
        },
        'inflation-shredder.html': {
            purpose: 'Учитываем изменение цен за каждый год — с начала выбранного года до конца последнего года в официальном ряду.',
            official: 'Индекс потребительских цен Росстата / ЕМИСС за каждый год (декабрь к декабрю). Статус данных указан на странице. Если в ряду не хватает года, расчёт не выполняется.',
            input: 'Сумма и начальный год.',
            scenario: 'Сценарных ставок нет. Каждый год индекс применяется к ценам, уже изменившимся за предыдущие годы.',
            result: 'Эквивалент — сколько рублей в конце периода нужно для тех же покупок, что и в начале. Оставшаяся покупательная способность — сколько та же сумма в конце периода стоит в рублях начала периода. На графике для сравнения взяты 1 000 ₽.',
            limitation: 'Общий индекс не отражает вашу корзину или цену конкретного товара. Примеры покупок иллюстрируют масштаб. Расчёт не показывает изменения внутри года и не предсказывает будущие цены.'
        },
        'millionaire.html': {
            purpose: 'оценивает срок достижения финансовой цели при заданных накоплениях и взносах.',
            official: 'Ключевая ставка Банка России и годовой ряд инфляции Росстата / ЕМИСС. Обновляются после публикации источников; статус набора виден на странице.',
            input: 'Накопления, доход, расходы, цель и срок.',
            scenario: 'Если цель указана в ценах будущего периода, сумма фиксирована. Если цель указана в сегодняшних ценах, она растёт с исторической средней инфляцией, а график и капитал показываются в сегодняшних ценах.',
            result: 'Расчётный срок, взносы и траектория капитала в выбранной единице измерения.',
            limitation: 'Будущая доходность, инфляция и личный бюджет могут измениться.'
        },
        'mortgage.html': {
            purpose: 'строит график ипотечных платежей и сравнивает варианты условий.',
            official: 'Ключевая ставка Банка России. Обновляется после публикации источника; это ориентир, а не ставка банка по вашему договору.',
            input: 'Стоимость жилья, первоначальный взнос, срок, ставка, досрочные платежи и переключатель страховки.',
            scenario: 'Расчёт использует введённую ставку и условия; ключевая ставка не подменяет предложение банка. При включённой страховке модель добавляет около 1% от остатка долга в начале каждого года кредита, отдельно от процентов банку.',
            result: 'Переплата = проценты по ипотеке + учтённая страховка; сумма выплат = сумма кредита + переплата, без первоначального взноса. Ежемесячный платёж показан без страховки.',
            limitation: 'Страховка — приблизительный сценарий, а не предложение банка. Другие условия договора, комиссии и решение банка не учитываются.'
        },
        'rent-vs-mortgage.html': {
            purpose: 'сравнивает капитал и денежные потоки при аренде и покупке жилья.',
            official: 'Официальные данные не используются.',
            input: 'Стоимость жилья, аренда, взнос, ставка и выбранный горизонт анализа.',
            scenario: 'Рост цен, аренды, расходы и горизонт 5–40 лет — сценарные допущения. Инвестиционный доход выключен по умолчанию; при включении накопления растут по заданной ставке.',
            result: 'Сравнение двух сценариев, а не прогноз рынка или рекомендация.',
            limitation: 'Рынок, ликвидность, налоги и условия кредита могут отличаться от модели.'
        },
        'time-is-money.html': {
            purpose: 'переводит цену покупки в часы вашей работы с учётом дороги и переработок.',
            official: 'Официальные данные не используются.',
            input: 'Доход, рабочие часы, время на дорогу, переработки и цену покупки.',
            scenario: 'В месяце используется единое допущение о количестве рабочих недель.',
            result: 'Расчётная стоимость часа и время, необходимое для покупки.',
            limitation: 'Это не оценка ценности работы и не учитывает налоги, отпуск или нерегулярный доход.'
        },
        'wealth.html': {
            purpose: 'Сравниваем начисленную месячную зарплату с доступными ориентирами по России или выбранному региону.',
            official: 'Средняя и медианная зарплаты работников организаций — из Росстата. Прожиточный минимум трудоспособных — от Правительства России. В карточках указаны источники и периоды. Показатели без проверенных данных скрыты.',
            input: 'Регион и месячная зарплата: «на руки» или до НДФЛ.',
            scenario: 'Для перевода «на руки» в начисленную зарплату считаем месячный доход постоянным и применяем годовые ступени НДФЛ 13%, 15%, 18%, 20% и 22% для обычной зарплаты налогового резидента.',
            result: 'На сколько зарплата выше или ниже ориентира в рублях и процентах. По этой разнице нельзя определить своё место в распределении зарплат.',
            limitation: 'Сравнение не оценивает богатство, доход семьи, уровень жизни или социальный класс. Перевод «на руки» не учитывает вычеты, другие доходы и особые правила для военной службы, самозанятых, ИП и нерезидентов.'
        }
    };

    function item(kind, text) {
        return `<div class="webwisor-item"><dt>${LABELS[kind]}</dt><dd>${text}</dd></div>`;
    }

    function compactMethodology(config) {
        const scenarioNote = config.scenarioNoteId ? ` <span id="${config.scenarioNoteId}" hidden></span>` : '';
        return `
            <details class="yn-methodology" data-testid="webwisor-help">
                <summary class="yn-methodology-summary">Как устроен расчёт</summary>
                <div class="yn-methodology-body">
                    <div class="yn-methodology-group">
                        <h2>Что учитываем</h2>
                        <p>${config.purpose}</p>
                    </div>
                    <div class="yn-methodology-group">
                        <h2>Откуда берутся данные</h2>
                        <p><strong>${LABELS.input}.</strong> ${config.input}</p>
                        <p><strong>${LABELS.official}.</strong> ${config.official}</p>
                        <p><strong>${LABELS.scenario}.</strong> ${config.scenario}${scenarioNote}</p>
                    </div>
                    <div class="yn-methodology-group">
                        <h2>Что означает результат</h2>
                        <p>${config.result}</p>
                    </div>
                    <div class="yn-methodology-group">
                        <h2>Чего расчёт не учитывает</h2>
                        <p>${config.limitation}</p>
                    </div>
                </div>
            </details>`;
    }

    function render(container) {
        const config = (window.WebWisor && window.WebWisor[container.dataset.webwisor])
            || CALCULATORS[window.location.pathname.split('/').pop()];
        if (!config || container.dataset.webwisorRendered === 'true') return;

        container.dataset.webwisorRendered = 'true';
        if (container.dataset.webwisorVariant === 'compact') {
            container.innerHTML = compactMethodology(config);
            return;
        }

        container.innerHTML = `
            <details class="webwisor" data-testid="webwisor-help">
                <summary><strong>ℹ️ Как устроен расчёт</strong><span class="webwisor-chevron" aria-hidden="true">⌄</span></summary>
                <div class="webwisor-content">
                    <p class="webwisor-purpose"><b>Что рассчитывает:</b> ${config.purpose}</p>
                    <dl>
                        ${item('official', config.official)}
                        ${item('input', config.input)}
                        ${item('scenario', config.scenario)}
                        ${item('result', config.result)}
                        ${item('limitation', config.limitation)}
                    </dl>
                </div>
            </details>`;
    }

    function start() {
        document.querySelectorAll('[data-webwisor]').forEach(render);
    }

    const style = document.createElement('style');
    style.textContent = `
        .webwisor { margin-top: 2rem; border: 1px solid #e2e8f0; border-radius: 1rem; background: #fff; color: #334155; }
        .dark .webwisor { border-color: #334155; background: #0f172a; color: #cbd5e1; }
        .webwisor summary { display: flex; align-items: center; gap: .6rem; padding: 1rem 1.25rem; cursor: pointer; list-style: none; }
        .webwisor summary::-webkit-details-marker { display: none; }
        .webwisor summary strong { font-size: .875rem; color: #0f172a; }
        .dark .webwisor summary strong { color: #f8fafc; }
        .webwisor-chevron { margin-left: auto; font-size: 1.1rem; transition: transform .2s; }
        .webwisor[open] .webwisor-chevron { transform: rotate(180deg); }
        .webwisor-content { padding: 0 1.25rem 1.25rem; border-top: 1px solid #e2e8f0; }
        .dark .webwisor-content { border-color: #334155; }
        .webwisor-purpose { margin: 1rem 0; font-size: .875rem; line-height: 1.5; }
        .webwisor dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; margin: 0; }
        .webwisor-item { padding: .75rem; border-radius: .75rem; background: #f8fafc; }
        .dark .webwisor-item { background: #1e293b; }
        .webwisor-item dt { margin-bottom: .25rem; font-size: .65rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }
        .webwisor-item dd { margin: 0; font-size: .75rem; line-height: 1.45; }
        @media (max-width: 640px) { .webwisor dl { grid-template-columns: 1fr; } }

        [data-webwisor-variant="compact"] .yn-methodology-group { max-inline-size: 74ch; overflow-wrap: anywhere; }
        [data-webwisor-variant="compact"] .yn-methodology-group + .yn-methodology-group { margin-block-start: var(--yn-space-md); }
        [data-webwisor-variant="compact"] .yn-methodology-group h2 { margin: 0 0 var(--yn-space-xs); font: inherit; font-weight: var(--yn-weight-action); }
        [data-webwisor-variant="compact"] .yn-methodology-group p { margin: 0; color: var(--yn-color-muted); }
        [data-webwisor-variant="compact"] .yn-methodology-group p + p { margin-block-start: var(--yn-space-xs); }
        [data-webwisor-variant="compact"] .yn-methodology-group strong { color: var(--yn-color-text); font-weight: var(--yn-weight-action); }
        @media (max-width: 640px) {
            [data-webwisor-variant="compact"] :is(.yn-methodology-summary, .yn-methodology-body) { padding-inline: var(--yn-space-md); }
        }
    `;
    document.head.appendChild(style);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
}());
