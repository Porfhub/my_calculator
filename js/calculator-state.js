/**
 * Shared calculation UI state machine.
 * Keeps state transitions, stale-result cleanup and technical-value guards
 * independent from any calculator's mathematical model.
 */
(function exposeCalculationState(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.CalculatorState = api;
    }
})(typeof window !== 'undefined' ? window : null, function createCalculationStateApi() {
    const STATES = Object.freeze({
        LOADING: 'LOADING',
        READY: 'READY',
        INVALID_INPUT: 'INVALID_INPUT',
        CALCULATION_IMPOSSIBLE: 'CALCULATION_IMPOSSIBLE',
        DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
        ERROR: 'ERROR'
    });

    const DEFAULT_MESSAGES = Object.freeze({
        [STATES.LOADING]: 'Загружаем данные…',
        [STATES.INVALID_INPUT]: 'Проверьте введённые значения.',
        [STATES.CALCULATION_IMPOSSIBLE]: 'Расчёт невозможен при текущих параметрах.',
        [STATES.DATA_UNAVAILABLE]: 'Данные временно недоступны. Попробуйте позже.',
        [STATES.ERROR]: 'Не удалось выполнить расчёт. Попробуйте ещё раз.'
    });

    const STATE_VALUES = new Set(Object.values(STATES));
    const TECHNICAL_VALUE_PATTERN = /(?:^|\s|[^a-zа-яё])(NaN|[+-]?Infinity|undefined)(?:$|\s|[^a-zа-яё])/i;

    function containsTechnicalValue(value, seen = new Set()) {
        if (typeof value === 'number') return !Number.isFinite(value);
        if (typeof value === 'string') return TECHNICAL_VALUE_PATTERN.test(value);
        if (value === undefined) return true;
        if (value === null || typeof value !== 'object') return false;
        if (seen.has(value)) return false;

        seen.add(value);
        if (Array.isArray(value)) {
            return value.some((item) => containsTechnicalValue(item, seen));
        }

        return Object.values(value).some((item) => containsTechnicalValue(item, seen));
    }

    function toSafeText(value, fallback = '—') {
        if (value === null || value === undefined || containsTechnicalValue(value)) return fallback;
        return String(value);
    }

    function resolveElement(reference) {
        if (!reference) return null;
        if (typeof reference !== 'string') return reference;
        if (typeof document === 'undefined') return null;
        return document.getElementById(reference);
    }

    function resolveElements(references) {
        return (references || []).map(resolveElement).filter(Boolean);
    }

    function writeSafeText(reference, value, fallback = '—') {
        const element = resolveElement(reference);
        if (!element) return false;

        const safe = !containsTechnicalValue(value) && value !== null && value !== undefined;
        element.textContent = safe ? String(value) : fallback;
        return safe;
    }

    function createController(options = {}) {
        const rootElement = resolveElement(options.root);
        const messageElement = resolveElement(options.messageElement);
        const resultReferences = options.resultElements || [];
        const clearValue = options.clearValue ?? '—';
        const messages = { ...DEFAULT_MESSAGES, ...(options.messages || {}) };
        let currentState = null;

        function clearResults() {
            resolveElements(resultReferences).forEach((element) => {
                element.textContent = clearValue;
            });

            if (typeof options.onClear === 'function') {
                options.onClear();
            }
        }

        function transition(nextState, transitionOptions = {}) {
            if (!STATE_VALUES.has(nextState)) {
                throw new Error(`Unknown calculation state: ${nextState}`);
            }

            const shouldClear = transitionOptions.clearResults ?? nextState !== STATES.READY;
            if (shouldClear) clearResults();

            currentState = nextState;
            if (rootElement?.dataset) rootElement.dataset.calculationState = nextState;

            if (messageElement) {
                if (nextState === STATES.READY) {
                    messageElement.textContent = '';
                    messageElement.hidden = true;
                } else {
                    messageElement.textContent = toSafeText(
                        transitionOptions.message ?? messages[nextState],
                        DEFAULT_MESSAGES[STATES.ERROR]
                    );
                    messageElement.hidden = false;
                }
            }

            if (typeof options.onStateChange === 'function') {
                options.onStateChange(nextState);
            }

            return nextState;
        }

        function outputsContainTechnicalValues() {
            return resolveElements(resultReferences).some((element) => containsTechnicalValue(element.textContent));
        }

        function runCalculation(spec = {}) {
            if (spec.isLoading) {
                transition(STATES.LOADING, { message: spec.loadingMessage });
                return { ok: false, state: STATES.LOADING };
            }

            try {
                if (typeof spec.validateInput === 'function' && !spec.validateInput(spec.input)) {
                    transition(STATES.INVALID_INPUT, { message: spec.invalidInputMessage });
                    return { ok: false, state: STATES.INVALID_INPUT };
                }

                if (typeof spec.validateData === 'function' && !spec.validateData(spec.data)) {
                    transition(STATES.DATA_UNAVAILABLE, { message: spec.dataUnavailableMessage });
                    return { ok: false, state: STATES.DATA_UNAVAILABLE };
                }

                const result = spec.calculate();
                const resultIsValid = !containsTechnicalValue(result) && (
                    typeof spec.validateResult !== 'function' || spec.validateResult(result)
                );

                if (!resultIsValid) {
                    transition(STATES.CALCULATION_IMPOSSIBLE, { message: spec.impossibleMessage });
                    return { ok: false, state: STATES.CALCULATION_IMPOSSIBLE };
                }

                spec.render(result);
                if (outputsContainTechnicalValues()) {
                    transition(STATES.CALCULATION_IMPOSSIBLE, { message: spec.impossibleMessage });
                    return { ok: false, state: STATES.CALCULATION_IMPOSSIBLE };
                }

                transition(STATES.READY, { clearResults: false });
                return { ok: true, state: STATES.READY, result };
            } catch (error) {
                if (typeof spec.onError === 'function') spec.onError(error);
                transition(STATES.ERROR, { message: spec.errorMessage });
                return { ok: false, state: STATES.ERROR, error };
            }
        }

        return Object.freeze({
            clearResults,
            getState: () => currentState,
            runCalculation,
            transition
        });
    }

    return Object.freeze({
        DEFAULT_MESSAGES,
        STATES,
        containsTechnicalValue,
        createController,
        toSafeText,
        writeSafeText
    });
});
