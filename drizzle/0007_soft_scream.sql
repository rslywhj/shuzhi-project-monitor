CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_email` text NOT NULL,
	`project_id` text,
	`type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`action_view` text NOT NULL,
	`reference_key` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`read_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedup_idx` ON `notifications` (`recipient_email`,`project_id`,`type`,`reference_key`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_status_idx` ON `notifications` (`recipient_email`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_project_idx` ON `notifications` (`project_id`);