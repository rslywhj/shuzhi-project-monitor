ALTER TABLE `projects` ADD `lifecycle_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `lifecycle_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
CREATE INDEX `projects_lifecycle_status_idx` ON `projects` (`lifecycle_status`);