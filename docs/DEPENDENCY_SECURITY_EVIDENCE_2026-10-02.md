# Dependency security evidence — 2026-10-02

This record documents the dependency lockfile security refresh for the current iRatePilot release branch.

## Findings and remediation

- The pre-refresh lockfile reported four development-tool findings: two high-severity transitive findings in `brace-expansion` and `js-yaml`, plus two moderate Vitest findings.
- All findings had compatible fixes within the existing dependency declarations.
- The npm lockfile was regenerated without changing application dependency ranges or runtime launch controls.
- A clean install from the regenerated lockfile completed successfully and reported zero vulnerabilities.
- A second package-lock audit reported zero info, low, moderate, high, or critical vulnerabilities across 532 resolved dependencies.

## Verification

- TypeScript passed with no errors.
- 172 launch-critical tests passed across 35 files covering hotel intake, content, inventory, agreements, suppliers, booking writes, payments, payouts, and final release controls.
- The optimized Next.js production build completed successfully and generated all 123 application routes.

## Safety boundary

This dependency refresh does not enable hotel publication, public booking, supplier traffic, live payments, live webhooks, or partner payouts. Those controls remain subject to their existing evidence gates.
