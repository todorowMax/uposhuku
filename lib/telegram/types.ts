// lib/telegram/types.ts
//
// Лише те, що ми читаємо з Bot API. Повний опис: https://core.telegram.org/bots/api

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  /** Контакт, надісланий кнопкою `request_contact`. `user_id` Telegram ставить, коли контакт має акаунт. */
  contact?: TgContact;
}

export interface TgContact {
  phone_number: string;
  first_name?: string;
  user_id?: number;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgChatMemberUpdated {
  chat: TgChat;
  from: TgUser;
  date: number;
  old_chat_member: { status: string; user: TgUser };
  new_chat_member: { status: string; user: TgUser };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: TgChatMemberUpdated;
}

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboard {
  inline_keyboard: InlineButton[][];
}

/** Клавіатура під полем вводу: кнопка «Поділитися номером» (працює лише в приватному чаті). */
export interface ReplyKeyboard {
  keyboard: { text: string; request_contact?: boolean }[][];
  one_time_keyboard?: boolean;
  resize_keyboard?: boolean;
}

export interface ReplyKeyboardRemove {
  remove_keyboard: true;
}

export type ReplyMarkup = InlineKeyboard | ReplyKeyboard | ReplyKeyboardRemove;
