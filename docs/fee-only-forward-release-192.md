# Fee-only forward corrections

Migration 192 permits an otherwise valid forward adjustment when the reviewed fee-category delta is nonzero, even if aggregate revenue and tax deltas are zero. Previously that case could be rejected as having no financial correction. Existing preview/version checks and fee-target enforcement remain in force. Once the fee balances match their targets, an empty follow-up adjustment is still rejected.

Local hotel/home tests against the numbered migration cover fee-only approval, category storage, service-day close, separate journal accounts, balanced posting, journal retry, and rejection of an empty follow-up without data changes. Installation tests verify transactional rollback restores the previous approval function, existing records are unchanged, and execution privileges remain unchanged.

Not deployed. Browser review/recovery and full production acceptance remain outstanding.
