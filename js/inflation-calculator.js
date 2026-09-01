/**
 * Pure inflation impact model used by the Ruble Shredder UI.
 * The module contains no DOM logic and accepts only normalized schema v2 records.
 */
(function exposeInflationCalculator(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.InflationCalculator = api;
    }
})(typeof window !== 'undefined' ? window : null, function createInflationCalculatorApi() {
    function calculateInflationImpact(records, startYear, amount) {
        if (!Array.isArray(records) || records.length === 0) {
            throw new Error('Inflation records are unavailable');
        }
        if (!Number.isInteger(startYear) || !Number.isFinite(amount) || amount <= 0) {
            throw new Error('Invalid inflation calculation input');
        }

        const selectedRecords = records.filter((record) => record.year >= startYear);
        if (selectedRecords.length === 0 || selectedRecords[0].year !== startYear) {
            throw new Error('Selected year is unavailable');
        }

        let cumulativeFactor = 1;
        const yearly = selectedRecords.map((record, index) => {
            const rate = record.inflation_percent;
            const cpiIndex = record.cpi_index;
            if (
                !Number.isInteger(record.year)
                || !Number.isFinite(rate)
                || !Number.isFinite(cpiIndex)
                || rate <= -100
                || (index > 0 && record.year !== selectedRecords[index - 1].year + 1)
            ) {
                throw new Error('Invalid inflation series');
            }

            cumulativeFactor *= 1 + rate / 100;
            const purchasingPowerOf1000 = 1000 / cumulativeFactor;
            if (!Number.isFinite(cumulativeFactor) || cumulativeFactor <= 0 || !Number.isFinite(purchasingPowerOf1000)) {
                throw new Error('Inflation calculation is impossible');
            }

            return {
                year: record.year,
                rate,
                cpiIndex,
                purchasingPowerOf1000
            };
        });

        const equivalentAmount = amount * cumulativeFactor;
        const remainingValue = amount / cumulativeFactor;
        const lostValue = amount - remainingValue;
        const result = {
            amount,
            startYear,
            endYear: yearly[yearly.length - 1].year,
            cumulativeFactor,
            cumulativePercent: (cumulativeFactor - 1) * 100,
            equivalentAmount,
            remainingValue,
            lostValue,
            remainingPercent: 100 / cumulativeFactor,
            yearly
        };

        if (Object.values(result).some((value) => typeof value === 'number' && !Number.isFinite(value))) {
            throw new Error('Inflation calculation produced a technical value');
        }

        return result;
    }

    return Object.freeze({ calculateInflationImpact });
});
