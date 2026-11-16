---
paths: ["**/lib/requests/**", "**/components/requests/**", "**/lib/feed/**", "**/lib/server/request-repo.ts", "**/app/api/requests/**", "**/app/api/request-files/**", "**/lib/server/request-files.ts", "**/app/api/feed/**", "**/app/zapyt/**", "**/components/request-page/**"]
trigger: touching requests (publish, edit, restore, feed, request pin on the map)
---
# Requests

Feature doc: `docs/features/requests.md` (edit, restore window, remote pin, channel post effects).

- Edit and restore are for the author only. Edit works on an open request (a closed one gives 409), up to 20 edits an hour, no text history.
- Restore is allowed only within `RESTORE_WINDOW_MS` (24 h) of the first close; `closed_at` is never overwritten by a second close.
- Lifetime: 14 days, then "Ще актуально?" once (Telegram + email, key carries the recipient); no answer in 3 days closes the request with `close_reason = 'expired'`, restorable for 7 days. Any restore restarts the clock; "Так, ще актуально" notifies nobody.
- Response status (`new | shortlisted | declined | chosen`) is set only by the request author and is never shown to the performer.
- Deadline: the bucket `deadline` stays and drives filters, ranking and matching; a custom date (`deadlineDate`, `YYYY-MM-DD`, Kyiv calendar day, today..+365) derives the bucket once at save time and is never re-derived later. Show deadlines only through `deadlineText` / `deadlineLabel` in `lib/requests/format.ts`.
- Neither edit nor restore sends "new request for your tags" notifications. Deals are not changed by an edit: their terms live in the deal.
- Files: uploaded to R2 first (`POST /api/request-files`, signed-in only), the draft carries only file ids, the server reads name, size and type from its own row and decides the type by extension plus magic bytes (never the client `Content-Type`). Bytes are served only through `GET /api/request-files/:id` (author, performer with a published profile while the request is open, or a performer who responded); never through a public URL, never in `PublicRequest` or to guests.
- A request without a city is pinned at a stable offset by id (`lib/feed/request-point.ts`); do not randomise it.
