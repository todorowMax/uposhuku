CREATE TABLE `deal_complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`stage_id` text NOT NULL,
	`complainant_user_id` text NOT NULL,
	`side` text NOT NULL,
	`reason` text NOT NULL,
	`text` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	`closed_by_email` text,
	`close_comment` text,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deal_complaints_deal_idx` ON `deal_complaints` (`deal_id`);--> statement-breakpoint
CREATE INDEX `deal_complaints_status_idx` ON `deal_complaints` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `deal_complaints_open_idx` ON `deal_complaints` (`deal_id`,`stage_id`,`complainant_user_id`) WHERE "deal_complaints"."status" = 'open';