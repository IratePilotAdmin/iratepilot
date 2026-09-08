# Fee breakdown in saved correction results

Migration 193 includes stored fee buckets in new forward-correction receipts and history entries. Exact retries return the originally saved receipt. Existing receipt JSON is not rewritten; historical rows may omit a fee breakdown or expose a null history value.

Local hotel/home tests verify the returned fee breakdown matches the preview and stored approval, history exposes the same breakdown, retry leaves one approval, and the fee-only workflow posts a balanced journal. Installation checks verify existing data and permissions are preserved and an injected failure restores both changed functions.

Not deployed. Frontend display and recovery integration remain required.
