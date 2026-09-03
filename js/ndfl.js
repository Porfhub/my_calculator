/*
 * Standard NDFL conversion for resident employment income.
 * The 2025 progressive scale remains current: 13%, 15%, 18%, 20%, 22%.
 * This intentionally excludes deductions and special tax situations.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.Ndfl = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const BRACKETS = Object.freeze([
        { ceiling: 2400000, rate: 0.13 },
        { ceiling: 5000000, rate: 0.15 },
        { ceiling: 20000000, rate: 0.18 },
        { ceiling: 50000000, rate: 0.20 },
        { ceiling: Infinity, rate: 0.22 }
    ]);

    function taxFromAnnualGross(annualGross) {
        if (!Number.isFinite(annualGross) || annualGross < 0) return null;
        let tax = 0;
        let lowerBound = 0;
        for (const { ceiling, rate } of BRACKETS) {
            const taxablePart = Math.max(0, Math.min(annualGross, ceiling) - lowerBound);
            tax += taxablePart * rate;
            if (annualGross <= ceiling) return tax;
            lowerBound = ceiling;
        }
        return tax;
    }

    function annualGrossFromAnnualNet(annualNet) {
        if (!Number.isFinite(annualNet) || annualNet <= 0) return null;
        let lowerBound = 0;
        let taxBeforeBracket = 0;
        for (const { ceiling, rate } of BRACKETS) {
            const netAtCeiling = ceiling === Infinity
                ? Infinity
                : ceiling - (taxBeforeBracket + (ceiling - lowerBound) * rate);
            if (annualNet <= netAtCeiling) {
                return (annualNet + taxBeforeBracket - lowerBound * rate) / (1 - rate);
            }
            taxBeforeBracket += (ceiling - lowerBound) * rate;
            lowerBound = ceiling;
        }
        return null;
    }

    function monthlyGrossFromMonthlyNet(monthlyNet) {
        if (!Number.isFinite(monthlyNet) || monthlyNet <= 0) return null;
        return annualGrossFromAnnualNet(monthlyNet * 12) / 12;
    }

    return { BRACKETS, taxFromAnnualGross, annualGrossFromAnnualNet, monthlyGrossFromMonthlyNet };
}));
