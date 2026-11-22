## [2053.01] - 2026-11-23

Cookie Payback Planner for Cookie Clicker 2.053. Requires CCSE.

- Reduce repeated statistics work with guarded production projections and smaller UI updates. Unknown game rules or mod effects retain native calculation.
- Fix x10/x100 auto-buy: fill the next ownership multiple, checking the whole batch and bank reserves before buying.
- Include click income and fractional production changes in cache invalidation.
- Keep strict calculation as the default. Bulk100 approximation remains an optional experiment, disabled by default.
- Add repeatable isolated profiling, native-core tests and purchase diagnostics.

Validated with 16 mods, banking and bulk100 auto-buy: all 1,110 measured updates stayed below 100ms; the maximum was 84.20ms. This describes the tested workload, not every save or mod combination.

Time-budgeted strategy search can choose different paths under load. Deterministic projection checks verify candidate values separately from search timing.

Download the ZIP, extract `BestDealHelper` into your mod directory, or update through Steam Workshop. Preserve your save and existing mod settings.
