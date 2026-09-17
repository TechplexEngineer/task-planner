ALTER TABLE `tasks` ADD `parent_id` integer REFERENCES tasks(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `tree_rank` integer DEFAULT 0 NOT NULL;