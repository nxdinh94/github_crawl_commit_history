CREATE TABLE `commit_details_cache` (
	`sha` text PRIMARY KEY NOT NULL,
	`additions` integer,
	`deletions` integer,
	`changed_files` integer,
	`fetched_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contributor_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`crawl_run_id` text NOT NULL,
	`github_username` text NOT NULL,
	`commit_count` integer DEFAULT 0 NOT NULL,
	`latest_commit_at` text,
	`additions` integer,
	`deletions` integer,
	`changed_files` integer,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contributor_summaries_crawl` ON `contributor_summaries` (`crawl_run_id`);--> statement-breakpoint
CREATE INDEX `idx_contributor_summaries_username` ON `contributor_summaries` (`github_username`);--> statement-breakpoint
CREATE TABLE `crawl_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`error_summary` text,
	`notification_status` text DEFAULT 'not_sent' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_crawl_runs_week` ON `crawl_runs` (`week_start`);--> statement-breakpoint
CREATE INDEX `idx_crawl_runs_status` ON `crawl_runs` (`status`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_repositories_url` ON `repositories` (`url`);--> statement-breakpoint
CREATE INDEX `idx_repositories_active` ON `repositories` (`active`);--> statement-breakpoint
CREATE TABLE `repository_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`crawl_run_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`commit_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_repository_runs_crawl` ON `repository_runs` (`crawl_run_id`);--> statement-breakpoint
CREATE INDEX `idx_repository_runs_repo` ON `repository_runs` (`repository_id`);--> statement-breakpoint
CREATE TABLE `roster_members` (
	`id` text PRIMARY KEY NOT NULL,
	`github_username` text NOT NULL,
	`display_name` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_roster_username` ON `roster_members` (`github_username`);--> statement-breakpoint
CREATE INDEX `idx_roster_active` ON `roster_members` (`active`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`shallow_threshold` integer DEFAULT 20 NOT NULL,
	`alert_email` text DEFAULT '' NOT NULL,
	`notifications_enabled` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
