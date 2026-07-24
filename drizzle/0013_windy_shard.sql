CREATE TABLE `resource_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_id` integer NOT NULL,
	`project_id` text NOT NULL,
	`milestone_id` integer,
	`role` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`hours_per_week` real NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`override_reason` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resource_allocations_resource_dates_idx` ON `resource_allocations` (`resource_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `resource_allocations_project_status_idx` ON `resource_allocations` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `resource_allocations_milestone_idx` ON `resource_allocations` (`milestone_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`resource_type` text NOT NULL,
	`org` text NOT NULL,
	`capacity_hours_per_week` real DEFAULT 40 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resources_org_name_idx` ON `resources` (`org`,`name`);--> statement-breakpoint
CREATE INDEX `resources_active_type_idx` ON `resources` (`active`,`resource_type`);