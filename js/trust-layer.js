/*
 * WebWisor is a local, contextual help layer. It explains the current
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
            purpose: 'сравнивает расчётные расходы на личный автомобиль и такси.',
            official: 'Официальные данные не используются.',
            input: 'Цена автомобиля, пробег, тариф такси и расходы, которые вы вводите.',
            scenario: 'Пресеты и параметры эксплуатации — сценарные значения, их можно изменить.',
            result: 'Оценка расходов в выбранном сценарии, а не рекомендация.',
            limitation: 'Фактические цены, пробег, ремонты и тарифы могут отличаться.'
        },
        'financial-freedom.html': {
            purpose: 'оценивает, на какой срок накоплений хватит при заданных расходах.',
            official: 'Ключевая ставка Банка России и годовой ряд инфляции Росстата / ЕМИСС. Обновляются после публикации источников; статус набора виден на странице.',
            input: 'Накопления, расходы и выбранный уровень жизни.',
            scenario: 'Доходность вклада рассчитывается от ключевой ставки; будущие расходы моделируются по исторической инфляции.',
            result: 'Расчётный срок и динамика капитала в этом сценарии.',
            limitation: 'Будущая доходность, инфляция и ваши расходы не гарантированы.'
        },
        'genetic-wealth.html': {
            purpose: 'оценивает расходы на ребёнка по возрастным этапам.',
            official: 'Годовой ряд инфляции Росстата / ЕМИСС. Он обновляется после публикации источника; статус набора виден на странице.',
            input: 'Город, возраст ребёнка и выбранный уровень расходов.',
            scenario: 'Структура расходов по этапам и будущая индексация — сценарная модель.',
            result: 'Оценка суммарных и ежемесячных расходов в заданном сценарии.',
            limitation: 'Семейные обстоятельства, цены и состав расходов могут отличаться.'
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
            purpose: 'показывает, как изменилась покупательная способность суммы за выбранный период.',
            official: 'Годовой ИПЦ Росстата / ЕМИСС (декабрь к декабрю). Ряд обновляется после публикации Росстата; статус набора виден на странице.',
            input: 'Сумма и начальный год.',
            scenario: 'Дополнительных сценарных ставок не используется: применяется опубликованный годовой ряд.',
            result: 'Пересчёт покупательной способности по официальным историческим индексам.',
            limitation: 'Личная корзина покупок может дорожать иначе, чем общий ИПЦ.'
        },
        'millionaire.html': {
            purpose: 'оценивает срок достижения финансовой цели при заданных накоплениях и взносах.',
            official: 'Ключевая ставка Банка России и годовой ряд инфляции Росстата / ЕМИСС. Обновляются после публикации источников; статус набора виден на странице.',
            input: 'Накопления, доход, расходы, цель и срок.',
            scenario: 'Доходность и рост цели моделируются на основе доступных официальных рядов.',
            result: 'Расчётный срок, взносы и траектория капитала в этом сценарии.',
            limitation: 'Будущая доходность, инфляция и личный бюджет могут измениться.'
        },
        'mortgage.html': {
            purpose: 'строит график ипотечных платежей и сравнивает варианты условий.',
            official: 'Ключевая ставка Банка России. Обновляется после публикации источника; это ориентир, а не ставка банка по вашему договору.',
            input: 'Стоимость жилья, первоначальный взнос, срок, ставка и досрочные платежи.',
            scenario: 'Расчёт использует введённую ставку и условия; ключевая ставка не подменяет предложение банка.',
            result: 'Расчётные платежи, переплата и график для заданных условий.',
            limitation: 'Не учитывает все условия договора, страховки, комиссии и решение банка.'
        },
        'rent-vs-mortgage.html': {
            purpose: 'сравнивает капитал и денежные потоки при аренде и покупке жилья.',
            official: 'Официальные данные не используются.',
            input: 'Стоимость жилья, аренда, взнос, ставка, срок и личные параметры.',
            scenario: 'Рост цен, аренды, доходность и расходы — изменяемые сценарные допущения.',
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
            purpose: 'сравнивает введённый доход с доступными региональными ориентирами.',
            official: 'Официальные данные не используются. Региональные значения — встроенный справочный набор, не норматив и не персональная оценка.',
            input: 'Доход и выбранный регион.',
            scenario: 'Пересчёт НДФЛ и сравнение выполняются по правилам, заданным в калькуляторе.',
            result: 'Ориентировочное сравнение дохода в выбранном регионе.',
            limitation: 'Не изменяет региональный набор и не заменяет официальную статистику или расчёт налогов.'
        }
    };

    function item(kind, text) {
        return `<div class="webwisor-item"><dt>${LABELS[kind]}</dt><dd>${text}</dd></div>`;
    }

    function render(container) {
        const config = (window.WebWisor && window.WebWisor[container.dataset.webwisor])
            || CALCULATORS[window.location.pathname.split('/').pop()];
        if (!config || container.dataset.webwisorRendered === 'true') return;

        container.dataset.webwisorRendered = 'true';
        container.innerHTML = `
            <details class="webwisor" data-testid="webwisor-help">
                <summary><span>WebWisor</span><strong>Как устроен расчёт</strong><span class="webwisor-chevron" aria-hidden="true">⌄</span></summary>
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
        .webwisor summary span:first-child { font-size: .65rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
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
    `;
    document.head.appendChild(style);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
}());
