/**
 * UI Utilities for Toasts, Goals, and Screenshots.
 */

function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    if (!toast || !toastMessage) return;

    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toastMessage.innerText = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
}

function reachGoal(goalId) {
    console.log("Goal reached:", goalId);
    if (typeof ym !== "undefined") {
        ym(110360838, 'reachGoal', goalId);
    }
}

// Some established calculator layouts pair a visible caption with more than
// one control (for example, a number field and a range). Give each primary
// control its own programmatic name without changing its visual presentation.
function applyAccessibleControlLabels() {
    const labels = {
        'car-price': 'Цена автомобиля, ₽',
        'depreciation-range': 'Потеря стоимости автомобиля в год, %',
        'savings-input': 'Ваши накопления, ₽',
        'savings-range': 'Ваши накопления, ₽',
        'yield-rate-range': 'Ожидаемая годовая доходность накоплений, %',
        'has-passive-income-toggle': 'У меня есть пассивный доход',
        'income-input': 'Пассивный доход в месяц, ₽',
        'income-range': 'Пассивный доход в месяц, ₽',
        'dep-amount-input': 'Сумма на отдельном вкладе, ₽',
        'dep-amount-range': 'Сумма на отдельном вкладе, ₽',
        'dep-rate-range': 'Ставка по вкладу в год, %',
        'survival-input': 'Расходы: выживание, ₽ в месяц',
        'survival-range': 'Расходы: выживание, ₽ в месяц',
        'comfort-input': 'Расходы: комфорт, ₽ в месяц',
        'comfort-range': 'Расходы: комфорт, ₽ в месяц',
        'luxury-input': 'Расходы: расширенный сценарий, ₽ в месяц',
        'luxury-range': 'Расходы: расширенный сценарий, ₽ в месяц',
        'amount-input': 'Сумма, ₽',
        'amount-range': 'Сумма, ₽',
        'term-input': 'Срок кредита',
        'term-unit': 'Единица срока кредита',
        'term-range': 'Срок кредита',
        'rate-input': 'Процентная ставка, % годовых',
        'rate-range': 'Процентная ставка, % годовых',
        'insurance-input': 'Страховка, ₽',
        'insurance-range': 'Страховка, ₽',
        'insurance-in-body': 'Включить страховку в тело кредита',
        'commissions-input': 'Комиссии, ₽',
        'commissions-range': 'Комиссии, ₽',
        'monthly-hidden-input': 'Ежемесячные дополнительные расходы, ₽',
        'monthly-hidden-range': 'Ежемесячные дополнительные расходы, ₽',
        'year-select': 'Год начала расчёта',
        'year-range': 'Год начала расчёта',
        'current-savings': 'Текущие накопления, ₽',
        'savings-range': 'Текущие накопления, ₽',
        'monthly-income': 'Доход в месяц, ₽',
        'income-range': 'Доход в месяц, ₽',
        'monthly-expenses': 'Регулярные траты в месяц, ₽',
        'expenses-range': 'Регулярные траты в месяц, ₽',
        'goal-sum': 'Желаемая сумма, ₽',
        'goal-range': 'Желаемая сумма, ₽',
        'interest-rate': 'Ожидаемая годовая доходность, % в год',
        'rate-range': 'Ожидаемая годовая доходность, % в год',
        'cost-input': 'Стоимость жилья, ₽',
        'cost-range': 'Стоимость жилья, ₽',
        'downpayment-input': 'Первоначальный взнос, ₽',
        'downpayment-range': 'Первоначальный взнос, ₽',
        'payment-input': 'Желаемый ежемесячный платёж, ₽',
        'payment-range': 'Желаемый ежемесячный платёж, ₽',
        'active-payment-input': 'Ежемесячный платёж по действующей ипотеке, ₽',
        'active-amount-input': 'Сумма действующей ипотеки, ₽',
        'active-rate-input': 'Ставка по действующей ипотеке, % годовых',
        'active-term-input': 'Срок действующей ипотеки, лет',
        'active-balance-input': 'Остаток долга по действующей ипотеке, ₽',
        'active-balance-range': 'Остаток долга по действующей ипотеке, ₽',
        'recurring-input': 'Регулярное досрочное погашение, ₽',
        'mode-checkbox': 'Экспертный режим',
        'cost-range': 'Стоимость квартиры, ₽',
        'dp-range': 'Первоначальный взнос, доля стоимости квартиры',
        'rent-range': 'Стоимость аренды в месяц, ₽',
        'growth-re': 'Рост стоимости жилья в год, %',
        'growth-rent': 'Рост аренды в год, %',
        'years-range': 'Горизонт анализа, лет',
        'hours-input': 'Рабочие часы в неделю',
        'hours-range': 'Рабочие часы в неделю',
        'commute-input': 'Время на дорогу в день, часов',
        'commute-range': 'Время на дорогу в день, часов',
        'overtime-input': 'Переработки в неделю, часов',
        'overtime-range': 'Переработки в неделю, часов',
        'purchase-input': 'Стоимость покупки, ₽',
        'purchase-range': 'Стоимость покупки, ₽'
    };

    const pageSpecificLabels = {
        'financial-freedom.html': {
            'savings-input': 'Ваши накопления, ₽',
            'savings-range': 'Ваши накопления, ₽',
            'yield-rate-range': 'Доходность вкладов и инвестиций, % годовых',
            'income-input': 'Пассивный доход в месяц, ₽',
            'income-range': 'Пассивный доход в месяц, ₽',
            'dep-amount-input': 'Сумма на отдельном вкладе, ₽',
            'dep-amount-range': 'Сумма на отдельном вкладе, ₽',
            'dep-rate-range': 'Ставка по вкладу, % годовых',
            'survival-input': 'Расходы: выживание, ₽ в месяц',
            'survival-range': 'Расходы: выживание, ₽ в месяц',
            'comfort-input': 'Расходы: комфорт, ₽ в месяц',
            'comfort-range': 'Расходы: комфорт, ₽ в месяц',
            'luxury-input': 'Расходы: расширенный сценарий, ₽ в месяц',
            'luxury-range': 'Расходы: расширенный сценарий, ₽ в месяц'
        },
        'honest-credit.html': {
            'amount-input': 'Сумма кредита, ₽',
            'amount-range': 'Сумма кредита, ₽',
            'rate-input': 'Процентная ставка по кредиту, % годовых',
            'rate-range': 'Процентная ставка по кредиту, % годовых'
        },
        'inflation-shredder.html': {
            'amount-input': 'Сумма для пересчёта, ₽',
            'amount-range': 'Сумма для пересчёта, ₽'
        },
        'mortgage.html': {
            'cost-input': 'Стоимость жилья, ₽',
            'cost-range': 'Стоимость жилья, ₽',
            'rate-input': 'Ипотечная ставка, % годовых',
            'rate-range': 'Ипотечная ставка, % годовых',
            'term-input': 'Срок ипотеки, лет',
            'term-range': 'Срок ипотеки, лет',
            'payment-input': 'Желаемый ежемесячный платёж, ₽',
            'payment-range': 'Желаемый ежемесячный платёж, ₽'
        },
        'rent-vs-mortgage.html': {
            'cost-range': 'Стоимость квартиры, ₽',
            'rate-range': 'Ипотечная ставка, % годовых'
        },
        'millionaire.html': {
            'savings-range': 'Текущие накопления, ₽',
            'income-range': 'Доход в месяц, ₽',
            'rate-range': 'Ожидаемая годовая доходность, % в год'
        }
    };
    const pageName = window.location.pathname.split('/').pop();
    const activeLabels = { ...labels, ...(pageSpecificLabels[pageName] || {}) };

    Object.entries(activeLabels).forEach(([id, label]) => {
        const control = document.getElementById(id);
        if (!control || control.hasAttribute('aria-label') || control.hasAttribute('aria-labelledby')) return;
        control.setAttribute('aria-label', label);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAccessibleControlLabels);
} else {
    applyAccessibleControlLabels();
}

function canExportCurrentCalculation() {
    if (typeof window === 'undefined' || typeof window.canExportCalculation !== 'function') {
        return true;
    }

    if (window.canExportCalculation()) {
        return true;
    }

    showToast('Сначала выполните корректный расчёт.');
    return false;
}

async function takeScreenshot(elementId = 'screenshot-area', filename = 'yasnomera-calculation.png') {
    if (!canExportCurrentCalculation()) return;

    const element = document.getElementById(elementId);
    if (!element) {
        console.error('Screenshot element not found:', elementId);
        return;
    }

    reachGoal("share_click");
    showToast("Подготовка скриншота...");

    try {
        const canvas = await html2canvas(element, {
            backgroundColor: '#f8fafc',
            scale: 2,
            logging: false,
            useCORS: true
        });

        canvas.toBlob((blob) => {
            const file = new File([blob], filename, { type: "image/png" });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Расчёт — Ясномера',
                    text: 'Результат расчёта в Ясномере.'
                }).then(() => showToast("Успешно отправлено!"))
                  .catch((err) => console.log('User cancelled share', err));
            } else {
                const link = document.createElement('a');
                link.download = filename;
                link.href = canvas.toDataURL('image/png');
                link.click();
                showToast("Скриншот скачан!");
            }
        }, 'image/png');
    } catch (err) {
        console.error('Screenshot error:', err);
        showToast("Ошибка при создании скриншота");
    }
}

function shareLink() {
    if (!canExportCurrentCalculation()) return;

    reachGoal("share_click");
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showToast("Ссылка скопирована!");
    }).catch(err => {
        console.error('Copy error:', err);
    });
}

function shareLinkCustom(title, text) {
    if (!canExportCurrentCalculation()) return;

    reachGoal("share_click");
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({
            title: title,
            text: text,
            url: url
        }).catch(err => console.log('Error sharing', err));
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showToast("Ссылка скопирована в буфер обмена!");
        }).catch(err => {
            console.error('Copy error:', err);
        });
    }
}
