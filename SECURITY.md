# Security Policy

## Supported versions

iRatePilot currently supports the code deployed from the `main` branch. Security fixes are applied to `main` and released through the production deployment pipeline.

## Report a vulnerability

Please report suspected vulnerabilities privately through GitHub's **Report a vulnerability** form in this repository's **Security** tab. Do not open a public issue or pull request for an unpatched security problem.

Include enough information for us to reproduce and assess the report:

- the affected URL, route, API, or component;
- the prerequisites and exact reproduction steps;
- the observed and expected behavior;
- the potential security impact;
- a minimal proof of concept, logs, or screenshots with secrets and personal data removed; and
- any suggested remediation or coordinated-disclosure constraints.

We will acknowledge reports as promptly as practical, investigate them, and coordinate disclosure after a fix is available. Please allow a reasonable remediation period before publishing details.

## Research guidelines

When testing iRatePilot:

- use test accounts, Stripe test mode, and data you own or are authorized to use;
- avoid privacy violations, service disruption, social engineering, denial-of-service testing, and automated high-volume traffic;
- do not access, modify, retain, or disclose another person's data;
- stop testing and report immediately if you encounter secrets or personal data; and
- make a good-faith effort to avoid degrading the production service.

Reports made in good faith and consistent with these guidelines are welcomed and will be handled constructively.
