CREATE TABLE `baseline_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`kind` text DEFAULT 'approved' NOT NULL,
	`milestone_json` text NOT NULL,
	`change_id` integer,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `baseline_versions_project_version_idx` ON `baseline_versions` (`project_id`,`version`);--> statement-breakpoint
ALTER TABLE `weekly_reports` ADD `draft_json` text DEFAULT '{}' NOT NULL;