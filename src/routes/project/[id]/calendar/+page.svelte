<script lang="ts">
	import { enhance } from '$app/forms';
	import { dndzone, TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { getMonthWeeks, computeWeekSegments } from '$lib/calendar-data';
	import { findDateOrderViolations } from '$lib/order-validation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface TaskLite {
		id: number;
		title: string;
		type: 'task' | 'milestone';
	}

	const UNASSIGNED = 'unassigned';
	const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const today = new Date();
	let year = $state(today.getFullYear());
	let month = $state(today.getMonth() + 1);

	let weeks = $derived(getMonthWeeks(year, month));
	let monthLabel = $derived(
		new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
	);

	function buildZones(tasks: PageData['tasks']): Record<string, TaskLite[]> {
		const zones: Record<string, TaskLite[]> = { [UNASSIGNED]: [] };
		for (const task of tasks) {
			const key = task.scheduledDate ?? UNASSIGNED;
			(zones[key] ??= []).push({ id: task.id, title: task.title, type: task.type });
		}
		return zones;
	}

	let zones = $derived(buildZones(data.tasks));

	let segments = $derived(
		computeWeekSegments(
			weeks,
			data.tasks
				.filter((t) => t.scheduledDate)
				.map((t) => ({
					id: t.id,
					title: t.title,
					scheduledDate: t.scheduledDate!,
					durationDays: t.durationDays
				}))
		)
	);

	let violatingIds = $derived(
		findDateOrderViolations(
			data.tasks.map((t) => ({
				id: t.id,
				scheduledDate: t.scheduledDate,
				durationDays: t.durationDays
			})),
			data.dependencies
		)
	);

	let scheduleForm: HTMLFormElement;
	let scheduleTaskIdInput: HTMLInputElement;
	let scheduleDateInput: HTMLInputElement;

	function submitScheduledDate(taskId: number, date: string) {
		scheduleTaskIdInput.value = String(taskId);
		scheduleDateInput.value = date;
		scheduleForm.requestSubmit();
	}

	function handleConsider(zoneKey: string, e: CustomEvent<DndEvent<TaskLite>>) {
		zones = { ...zones, [zoneKey]: e.detail.items };
	}

	function handleFinalize(zoneKey: string, e: CustomEvent<DndEvent<TaskLite>>) {
		zones = { ...zones, [zoneKey]: e.detail.items };
		if (e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE) {
			submitScheduledDate(Number(e.detail.info.id), zoneKey === UNASSIGNED ? '' : zoneKey);
		}
	}

	function changeMonth(delta: number) {
		const base = new Date(year, month - 1 + delta, 1);
		year = base.getFullYear();
		month = base.getMonth() + 1;
	}
</script>

<h2>Calendar</h2>

<div class="d-flex align-items-center justify-content-between mb-3">
	<button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => changeMonth(-1)}>
		&lt; Prev
	</button>
	<h3 class="mb-0">{monthLabel}</h3>
	<button type="button" class="btn btn-outline-secondary btn-sm" onclick={() => changeMonth(1)}>
		Next &gt;
	</button>
</div>

<form bind:this={scheduleForm} method="POST" action="?/setScheduledDate" use:enhance>
	<input bind:this={scheduleTaskIdInput} type="hidden" name="taskId" value="" />
	<input bind:this={scheduleDateInput} type="hidden" name="date" value="" />
</form>

<div class="calendar-weekdays">
	{#each weekdayLabels as label (label)}
		<div class="weekday-label">{label}</div>
	{/each}
</div>

{#each weeks as week, weekIndex (weekIndex)}
	<div class="calendar-week">
		{#each week as day, colIndex (day.iso)}
			<div class="day-cell" class:outside-month={!day.inCurrentMonth}>
				<div class="day-number">{day.date.getDate()}</div>
				<div
					class="day-drop"
					use:dndzone={{ items: zones[day.iso] ?? [], type: 'calendar-task', flipDurationMs: 150 }}
					onconsider={(e) => handleConsider(day.iso, e)}
					onfinalize={(e) => handleFinalize(day.iso, e)}
				>
					{#each zones[day.iso] ?? [] as task (task.id)}
						{@const span =
							segments.find((s) => s.taskId === task.id && s.weekIndex === weekIndex)?.span ?? 1}
						<div
							class="task-chip"
							class:milestone={task.type === 'milestone'}
							class:warning={violatingIds.has(task.id)}
							style="width: calc({span} * 100% + {span - 1}px)"
							title={task.title}
							data-task-id={task.id}
						>
							{#if violatingIds.has(task.id)}⚠
							{/if}{task.title}
						</div>
					{/each}
				</div>
				{#each segments.filter((s) => s.weekIndex === weekIndex && s.startCol === colIndex && !s.isStart) as segment (segment.taskId)}
					<div
						class="task-chip continuation"
						class:warning={violatingIds.has(segment.taskId)}
						style="width: calc({segment.span} * 100% + {segment.span - 1}px)"
						title={segment.title}
					>
						{segment.title}
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/each}

<h3 class="mt-4">Unassigned</h3>
<div
	class="unassigned-zone"
	use:dndzone={{ items: zones[UNASSIGNED] ?? [], type: 'calendar-task', flipDurationMs: 150 }}
	onconsider={(e) => handleConsider(UNASSIGNED, e)}
	onfinalize={(e) => handleFinalize(UNASSIGNED, e)}
>
	{#each zones[UNASSIGNED] ?? [] as task (task.id)}
		<div
			class="task-chip unassigned-chip"
			class:milestone={task.type === 'milestone'}
			data-task-id={task.id}
		>
			{task.title}
		</div>
	{/each}
	{#if (zones[UNASSIGNED]?.length ?? 0) === 0}
		<p class="text-muted mb-0">Nothing unassigned</p>
	{/if}
</div>

<style>
	.calendar-weekdays,
	.calendar-week {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
	}

	.weekday-label {
		font-weight: 600;
		text-align: center;
		padding: 4px 0;
	}

	.day-cell {
		position: relative;
		box-sizing: border-box;
		border: 1px solid #dee2e6;
		min-height: 90px;
		padding: 4px;
		overflow: visible;
	}

	.day-cell.outside-month {
		background: #f8f9fa;
		color: #adb5bd;
	}

	.day-number {
		font-size: 0.8rem;
		margin-bottom: 2px;
	}

	.day-drop {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 24px;
	}

	.task-chip {
		position: relative;
		z-index: 2;
		background: #0d6efd;
		color: white;
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 0.75rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: grab;
	}

	.task-chip.milestone {
		background: #6f42c1;
	}

	.task-chip.warning {
		box-shadow: inset 0 0 0 2px darkorange;
	}

	.task-chip.continuation {
		opacity: 0.6;
		cursor: default;
	}

	.unassigned-zone {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-height: 48px;
		border: 1px dashed #ced4da;
		border-radius: 4px;
		padding: 8px;
	}

	.unassigned-chip {
		cursor: grab;
	}
</style>
