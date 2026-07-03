/**
 * Utility functions for formatting and parsing.
 */

function formatMoney(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0
    }).format(amount);
}

function formatNumber(amount) {
    return new Intl.NumberFormat('ru-RU').format(amount);
}

function parseCleanNumber(str) {
    if (typeof str !== 'string') return parseFloat(str) || 0;
    return parseFloat(str.replace(/\s+/g, '').replace(',', '.')) || 0;
}

/**
 * Real-time thousand-separator formatting for text inputs.
 * Maintains cursor position logic.
 */
function formatInputField(input, val) {
    let cursorPosition = input.selectionStart;
    let originalLength = input.value.length;
    let cleanVal = val.toString().replace(/\s+/g, '').replace(/\D/g, '');

    if (cleanVal === '') {
        input.value = '';
        return 0;
    }

    let parsed = parseInt(cleanVal, 10);
    let formatted = new Intl.NumberFormat('ru-RU').format(parsed);
    input.value = formatted;

    let newLength = formatted.length;
    let diff = newLength - originalLength;
    input.setSelectionRange(cursorPosition + diff, cursorPosition + diff);

    return parsed;
}

function getYearWord(years) {
    let number = Math.abs(years);
    number %= 100;
    if (number >= 5 && number <= 20) return 'лет';
    number %= 10;
    if (number === 1) return 'год';
    if (number >= 2 && number <= 4) return 'года';
    return 'лет';
}

function getMonthWord(months) {
    let number = Math.abs(months);
    number %= 100;
    if (number >= 5 && number <= 20) return 'месяцев';
    number %= 10;
    if (number === 1) return 'месяц';
    if (number >= 2 && number <= 4) return 'месяца';
    return 'месяцев';
}
