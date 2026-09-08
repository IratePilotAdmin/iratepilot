# Invoice aging pagination — release 186

Adds invoice_aging_page for histories beyond 1000 invoices. Pages contain at most 200 rows, complete totals/count and a report-content token. Changes between requests reject the previous token. Client validates sequence, scope, totals and final invoice uniqueness before display/export.

Install database before matching UI. Older invoice_aging API remains unchanged. Installation after 185 preserves all 102 tables and rejects inherited anon/service-role execution. Hotel/home tests cover 1001 invoices, six-page display and fresh CSV export, actual between-request credit, empty reports, access denial and rollback.

Not deployed. Full report is recalculated per page; write-heavy properties may require restarting. Collected rows render together. Large production volume and hosted HTTP authentication remain unverified.
