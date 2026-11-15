---
paths: ["**/lib/requests/**", "**/components/requests/**", "**/lib/feed/**", "**/lib/server/request-repo.ts", "**/app/api/requests/**", "**/app/api/feed/**", "**/app/zapyt/**", "**/components/request-page/**"]
trigger: touching requests (publish, edit, restore, feed, request pin on the map)
---
# Requests

Feature doc: `docs/features/requests.md` (edit, restore window, remote pin, channel post effects).

- Edit and restore are for the author only. Edit works on an open request (a closed one gives 409), up to 20 edits an hour, no text history.
- Restore is allowed only within `RESTORE_WINDOW_MS` (24 h) of the first close; `closed_at` is never overwritten by a second close.
- Neither edit nor restore sends "new request for your tags" notifications. Deals are not changed by an edit: their terms live in the deal.
- A request without a city is pinned at a stable offset by id (`lib/feed/request-point.ts`); do not randomise it.
