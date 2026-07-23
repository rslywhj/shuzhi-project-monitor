ALTER TABLE `baseline_changes` ADD `rejected_by` text;--> statement-breakpoint
ALTER TABLE `baseline_changes` ADD `rejected_at` text;--> statement-breakpoint
ALTER TABLE `baseline_changes` ADD `rejection_reason` text DEFAULT '' NOT NULL;