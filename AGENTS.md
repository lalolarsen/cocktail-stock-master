- Tablet printing goes only through RawBT via `src/lib/printing/rawbt.ts` (`sendToRawBt` detects whether Android left the page) and `trackedPrint` in `print-tracker.ts`; why: Chrome silently blocks the RawBT intent after network waits, so every print is logged in `print_jobs` and falls back to a tap-to-print banner.
- One-time reprints are enforced server-side by `register_reprint` (kind='reprint' rows; admin/gerencia unlimited); why: prevents handing out extra covers.
- Ticket history batches cover counts through `fetchTicketCoverCounts` and the paginated fetch utility; why: avoids per-sale requests without truncating counts or changing token-status semantics.
- Session hydration validates the user outside auth callbacks and discards stale auth revisions; keep the login page mounted while permissions load so shared-POS sign-in cannot lose its mode selection.
- Login requests have bounded waits and only explicit invalid-credential errors count as incorrect PINs; successful attempt records specify failure_reason to disambiguate the existing RPC overloads.
- Worker PIN resets use `reset-worker-pin`, validating the caller's admin role and matching profile venue before a server-only Auth update; audit entries alone must never report a successful password change.

- PC printing uses one serialized iframe job per sale, keeps the document alive until afterprint, and does not claim paper delivery; why: overlapping dialogs and early frame removal lose covers.
- Alcohol Android printing sends both sale pieces in one RawBT intent before asynchronous audit, and failed attempts retain independent retries; why: network waits lose Chrome activation and a single fallback can hide earlier pending sales.
- Reprints must register successfully before invoking printing; an authorized blocked intent uses the manual fallback without a second registration, because issuing paper before authorization bypasses the one-time limit.
