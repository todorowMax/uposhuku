CREATE TABLE `chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`uploader_user_id` text NOT NULL,
	`message_id` text,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_attachments_conversation_idx` ON `chat_attachments` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `chat_attachments_message_idx` ON `chat_attachments` (`message_id`);