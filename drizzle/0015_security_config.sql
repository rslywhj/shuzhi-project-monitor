CREATE TABLE `security_configs` (
	`id` integer PRIMARY KEY NOT NULL,
	`min_password_length` integer DEFAULT 12 NOT NULL,
	`require_letter` integer DEFAULT true NOT NULL,
	`require_uppercase` integer DEFAULT false NOT NULL,
	`require_lowercase` integer DEFAULT false NOT NULL,
	`require_number` integer DEFAULT true NOT NULL,
	`require_symbol` integer DEFAULT false NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `security_configs` (
	`id`,
	`min_password_length`,
	`require_letter`,
	`require_uppercase`,
	`require_lowercase`,
	`require_number`,
	`require_symbol`,
	`updated_by`
) VALUES (1, 12, true, false, false, true, false, 'system');
