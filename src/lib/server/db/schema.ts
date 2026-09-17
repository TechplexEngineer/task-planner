import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	startDate: text('start_date').notNull(),
	createdAt: text('created_at').notNull()
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	projectId: integer('project_id')
		.notNull()
		.references(() => projects.id),
	title: text('title').notNull(),
	description: text('description').notNull().default(''),
	type: text('type', { enum: ['task', 'milestone'] })
		.notNull()
		.default('task'),
	durationDays: integer('duration_days').notNull().default(1),
	status: text('status', { enum: ['todo', 'in_progress', 'done'] })
		.notNull()
		.default('todo'),
	startDelayDays: integer('start_delay_days').notNull().default(0),
	priorityRank: integer('priority_rank').notNull(),
	createdAt: text('created_at').notNull()
});

export const dependencies = sqliteTable('dependencies', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	projectId: integer('project_id')
		.notNull()
		.references(() => projects.id),
	predecessorId: integer('predecessor_id')
		.notNull()
		.references(() => tasks.id),
	successorId: integer('successor_id')
		.notNull()
		.references(() => tasks.id)
});

export const taskPositions = sqliteTable('task_positions', {
	taskId: integer('task_id')
		.primaryKey()
		.references(() => tasks.id),
	offsetX: integer('offset_x').notNull().default(0),
	offsetY: integer('offset_y').notNull().default(0)
});
