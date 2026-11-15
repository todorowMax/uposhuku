---
paths: ["**/components/chat/**", "**/lib/chat/**", "**/lib/server/chat-repo.ts", "**/worker/realtime.ts", "**/worker/index.ts", "**/lib/realtime/**", "**/lib/server/realtime.ts", "**/app/api/conversations/**", "**/lib/ui/chat-window.ts"]
trigger: touching the chat (conversations, messages, realtime sockets)
---
# Chat

Feature doc: `docs/features/chat.md` (model, list, polling, realtime, notifications). Read it before changing behaviour.

- Every conversation route starts with `accessibleConversation(id, userId)`; a stranger gets 404 for reading, writing and photos.
- One conversation per customer + performer pair; deals live inside it. Do not add a chat per deal.
- Realtime events carry only "what changed" (`lib/realtime/types.ts`), never message text: the client rereads through the REST API, where access is checked. `x-rt-user` is set only by `worker/index.ts`.
- A system line (`kind: "system"`) is not a human message: `talked` and the notification logic ignore it. Writing one must never break the action that caused it.
- The Telegram notice key is `msg:<conversation>:<recipient>:<window>`: keep the recipient in it, otherwise a reply inside the same 10-minute window is dropped as a duplicate.
- A failed send must leave the text and photos in the composer (`lib/chat/send-result.ts`); do not clear the draft before the server answers.
- Unread is a per-side read mark on `conversations` (`customer_read_at`, `performer_read_at`), counted in one grouped query in `listConversations`; only the other side's `text` messages count, plus a system line when the deal waits for me. The client sends the mark (`POST .../read`) only while the thread is open and the tab visible, after the first load: never from a list view or a hidden tab.
