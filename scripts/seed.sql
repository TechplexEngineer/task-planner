-- Demo data: a "Website Relaunch" project with a realistic task/dependency graph.
-- Re-runnable: clears out any prior copy of the same demo project first.

DELETE FROM dependencies WHERE project_id IN (SELECT id FROM projects WHERE name = 'Website Relaunch');
DELETE FROM task_positions WHERE task_id IN (
	SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE name = 'Website Relaunch')
);
DELETE FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE name = 'Website Relaunch');
DELETE FROM projects WHERE name = 'Website Relaunch';

INSERT INTO projects (name, start_date, created_at)
VALUES ('Website Relaunch', date('now'), datetime('now'));

INSERT INTO tasks (project_id, title, description, type, duration_days, status, priority_rank, created_at)
VALUES
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Discovery & Requirements', 'Interview stakeholders and document goals for the relaunch.', 'task', 5, 'done', 1, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Content Audit', 'Inventory existing pages and flag content to retire or migrate.', 'task', 3, 'done', 2, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Wireframes', 'Low-fidelity layouts for the key page templates.', 'task', 4, 'done', 3, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Visual Design', 'High-fidelity comps and the component style guide.', 'task', 6, 'in_progress', 4, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Design Approved', '', 'milestone', 0, 'todo', 5, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Frontend Build', 'Implement approved templates and components.', 'task', 10, 'todo', 6, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Backend Integration', 'Wire up the CMS and API endpoints the templates need.', 'task', 8, 'todo', 7, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Content Migration', 'Move retained content into the new CMS structure.', 'task', 4, 'todo', 8, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'QA Testing', 'Cross-browser, accessibility, and regression testing.', 'task', 5, 'todo', 9, datetime('now')),
	((SELECT id FROM projects WHERE name = 'Website Relaunch'), 'Launch', '', 'milestone', 0, 'todo', 10, datetime('now'));

INSERT INTO dependencies (project_id, predecessor_id, successor_id)
VALUES
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Discovery & Requirements' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Wireframes' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Wireframes' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Visual Design' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Visual Design' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Design Approved' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Design Approved' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Frontend Build' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Design Approved' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Backend Integration' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Content Audit' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Content Migration' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Design Approved' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Content Migration' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Frontend Build' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'QA Testing' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Backend Integration' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'QA Testing' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'Content Migration' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'QA Testing' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	),
	(
		(SELECT id FROM projects WHERE name = 'Website Relaunch'),
		(SELECT id FROM tasks WHERE title = 'QA Testing' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch')),
		(SELECT id FROM tasks WHERE title = 'Launch' AND project_id = (SELECT id FROM projects WHERE name = 'Website Relaunch'))
	);
