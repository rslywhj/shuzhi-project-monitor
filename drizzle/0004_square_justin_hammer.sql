CREATE TABLE `milestone_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`sequence` integer NOT NULL,
	`default_weight` real NOT NULL,
	`critical` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `milestone_templates_code_idx` ON `milestone_templates` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `milestone_templates_sequence_idx` ON `milestone_templates` (`sequence`);--> statement-breakpoint
ALTER TABLE `milestones` ADD `template_id` integer REFERENCES milestone_templates(id);--> statement-breakpoint
ALTER TABLE `milestones` ADD `custom` integer DEFAULT false NOT NULL;