# Contributing to iRatePilot

Thank you for helping improve iRatePilot. Keep changes focused, document their impact, and avoid including secrets, personal data, or production payment details.

## Before you start

- Search the existing issues and pull requests before opening a duplicate.
- Use the bug-report form for reproducible defects.
- Report suspected vulnerabilities privately through GitHub's **Report a vulnerability** form. Do not disclose an unpatched security issue in a public issue or pull request; see [SECURITY.md](SECURITY.md).
- For substantial product, architecture, database, payment, or privacy changes, open an issue first so the approach and operational impact can be discussed.

## Local setup

The project requires Node.js 24.x and npm. If you use `nvm`, run `nvm use` from the repository root before installing dependencies.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Populate only the environment variables needed for the flow you are testing, and use development credentials, Stripe test mode, and non-production data.

## Make a change

1. Create a short-lived branch from the latest `main`.
2. Keep the change limited to one clear outcome.
3. Add or update tests when behavior changes.
4. Update documentation and `.env.example` when setup or configuration changes.
5. Never commit `.env.local`, credentials, access tokens, customer data, or production payment information.

## Validate your work

Run the complete repository check before requesting review:

```bash
npm run check
```

This runs linting, TypeScript checks, the Vitest suite, and the production build. If a check cannot be run locally, explain why in the pull request and include the narrower validation you performed.

Manually verify any affected user flow. Pay particular attention to authentication, authorization, database access, Stripe behavior, responsive layout, and error states when those areas are involved.

## Open a pull request

- Complete the pull-request template, including validation and deployment risk.
- Call out new environment variables, schema changes, migrations, feature flags, or rollback steps.
- Include screenshots for visible interface changes when they help reviewers assess the result.
- Keep commits and the pull request free of generated artifacts that are not intentionally tracked.
- Resolve automated checks before merging. The protected `main` branch requires the repository CI and Vercel deployment checks to pass.
