"use client";

// components/chat/inbox/thread.tsx
//
// Открита розмова: шапка, рядок угоди (56 px), стрічка, поле повідомлення і шари над чатом: шторки (список угод,
// «+») та екрани (угода, умови, пропозиція за відгуком).

import { DealComposerScreen } from "@/components/deals/deal-composer/deal-composer-screen";
import { DealScreen } from "@/components/deals/deal-screen/deal-screen";
import { TermsScreen } from "@/components/deals/terms-form/terms-screen";
import { CHAT_PHOTOS_MAX, type ConversationDto } from "@/lib/chat/types";
import { AttachSheet } from "./parts/attach-sheet";
import { Composer } from "./parts/composer";
import { DealListSheet } from "./parts/deal-list-sheet";
import { DealRow } from "./parts/deal-row";
import { MessageList } from "./parts/message-list";
import { PhotoViewer } from "./parts/photo-viewer";
import { ThreadHeader } from "./parts/thread-header";
import { useThread } from "./use-thread";
import type { InboxSize } from "./use-inbox-motion";

export const Thread = ({
  conversation,
  size,
  onBack,
  onClose,
  onToggleSize,
}: {
  conversation: ConversationDto;
  size: InboxSize;
  onBack: () => void;
  onClose: () => void;
  onToggleSize: () => void;
}) => {
  const { chat, screen, setScreen, selectedDeal, response, listRef, rowRef, closeScreen, photos, photoError, fileRef, addFiles, removePhoto, deals, ready, apply, reload, draft, type, submit, canSend, viewer, setViewer, sheet, setSheet, openDeals, openScreenAfterClose, attachPhoto } = useThread(conversation);
  const role = conversation.role;
  const emptyChat = chat.lines.length === 0 && !conversation.lastMessage;

  return (
    <>
      <ThreadHeader conversation={conversation} typing={chat.typing} size={size} onBack={onBack} onToggleSize={onToggleSize} onClose={onClose} />
      <DealRow ready={ready} deals={deals} role={role} response={response} onOpen={openDeals} openRef={rowRef} />
      <MessageList ref={listRef} lines={chat.lines} loaded={chat.loaded} error={Boolean(chat.error)} empty={emptyChat} onPhoto={setViewer} />
      <Composer
        draft={draft}
        placeholder={emptyChat ? "Опишіть задачу" : "Повідомлення"}
        photos={photos}
        photoError={photoError}
        canSend={canSend}
        fileRef={fileRef}
        onType={type}
        onSubmit={submit}
        onPlus={() => setSheet("attach")}
        onFiles={(files) => void addFiles(files)}
        onRemovePhoto={removePhoto}
      />
      {viewer && <PhotoViewer url={viewer} onClose={() => setViewer(null)} />}

      <AttachSheet
        open={sheet === "attach"}
        photoDisabled={photos.length >= CHAT_PHOTOS_MAX}
        onOpenChange={(open) => !open && setSheet(null)}
        onTerms={() => openScreenAfterClose({ kind: "terms" })}
        onPhoto={attachPhoto}
      />
      <DealListSheet
        open={sheet === "deals"}
        deals={deals}
        role={role}
        onOpenChange={(open) => !open && setSheet(null)}
        onPick={(deal) => openScreenAfterClose({ kind: "deal", id: deal.id })}
        onNew={() => openScreenAfterClose({ kind: "terms" })}
      />

      {selectedDeal && <DealScreen deal={selectedDeal} role={role} open onOpenChange={closeScreen} onChanged={apply} />}
      {screen?.kind === "terms" && (
        <TermsScreen
          conversation={conversation}
          onOpenChange={closeScreen}
          onDone={() => {
            setScreen(null);
            reload();
          }}
        />
      )}
      {screen?.kind === "composer" && response && (
        <DealComposerScreen
          response={response}
          onOpenChange={closeScreen}
          onDone={(deal) => {
            apply(deal);
            openScreenAfterClose({ kind: "deal", id: deal.id });
          }}
        />
      )}
    </>
  );
};
