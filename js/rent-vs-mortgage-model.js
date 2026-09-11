(function (root, factory) {
    const model = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = model;
    root.RentVsMortgageModel = model;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    function calculateScenario(state) {
        const loanAmount = state.cost * (1 - state.dpPercent);
        const monthlyRate = state.rate / 12 / 100;
        const months = state.years * 12;
        const mortgagePayment = monthlyRate > 0
            ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
            : loanAmount / months;

        const dataBuy = [];
        const dataRent = [];
        const labels = [];
        let currentLoanBalance = loanAmount;
        let currentPropertyValue = state.cost;
        let currentRent = state.rent;
        const initialRenterCapital = state.cost * state.dpPercent;
        let investPot = initialRenterCapital;

        // The annual return is treated as a nominal annual rate with monthly
        // compounding: r_month = r_annual / 12. When investment income is
        // disabled, r_month is zero and the same cash flows still accumulate.
        const monthlyInvestmentRate = state.includeInvestments ? state.investRate / 12 / 100 : 0;
        const monthlyGrowthRE = Math.pow(1 + state.growthRE / 100, 1 / 12) - 1;
        const monthlyGrowthRent = Math.pow(1 + state.growthRent / 100, 1 / 12) - 1;

        dataBuy.push(currentPropertyValue - currentLoanBalance);
        dataRent.push(investPot);
        labels.push('Старт');

        for (let month = 1; month <= months; month++) {
            const interest = currentLoanBalance * monthlyRate;
            const principal = mortgagePayment - interest;
            currentLoanBalance = Math.max(0, currentLoanBalance - principal);
            currentPropertyValue *= (1 + monthlyGrowthRE);

            const maintenance = (state.cost * 0.001) / 12;
            const monthlyDifference = mortgagePayment + maintenance - currentRent;
            investPot = investPot * (1 + monthlyInvestmentRate) + monthlyDifference;
            currentRent *= (1 + monthlyGrowthRent);

            if (month % 12 === 0) {
                dataBuy.push(Math.round(currentPropertyValue - currentLoanBalance));
                dataRent.push(Math.round(investPot));
                labels.push(month / 12 + ' г.');
            }
        }

        return {
            buyFinal: dataBuy[dataBuy.length - 1],
            rentFinal: dataRent[dataRent.length - 1],
            dataBuy,
            dataRent,
            initialRenterCapital,
            initialMonthlyDifference: mortgagePayment + (state.cost * 0.001) / 12 - state.rent,
            annualReturn: state.investRate,
            labels,
            monthlyInvestmentRate,
            mortgagePayment
        };
    }

    return { calculateScenario };
});
