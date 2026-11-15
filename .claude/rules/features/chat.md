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
- The Telegram notice key `msg:<conversation>:<window>` is deduplicated; a change to it must keep the recipient in mind (see the doc, known defects).
