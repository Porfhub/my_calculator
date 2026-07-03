/**
 * API service for fetching financial data.
 */

async function fetchRegions() {
    try {
        const response = await fetch('regions.json');
        if (!response.ok) throw new Error('Failed to fetch regions');
        return await response.json();
    } catch (error) {
        console.error('Error loading regions:', error);
        return [];
    }
}

async function fetchRates() {
    try {
        const response = await fetch('rates.json');
        if (!response.ok) throw new Error('Failed to fetch rates');
        return await response.json();
    } catch (error) {
        console.error('Error loading rates:', error);
        return null;
    }
}

async function fetchInflation() {
    try {
        const response = await fetch('inflation.json');
        if (!response.ok) throw new Error('Failed to fetch inflation');
        return await response.json();
    } catch (error) {
        console.error('Error loading inflation:', error);
        return null;
    }
}
