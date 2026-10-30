# Deterministic financial-data fixtures

`inflation.json` is a test-owned schema-v2 snapshot of the 2000–2025 annual
series. Its `ok` status and August/September 2026 provenance timeline are modeled
for the fixed test clock. It is not a current official-source fetch and must
never be copied to the production dataset.

Validator, updater, and client inflation/state tests read fresh copies of this fixture. Tests must
not derive their status, payload, dates, or coverage from the mutable root
`inflation.json`: a legitimate daily transition to `stale`/`unavailable`, a new
publication, or a new year must not alter the scenario under test.

`npm run validate:data` independently validates the actual repository datasets
against the real clock. Do not replace that publish gate with fixture validation.
