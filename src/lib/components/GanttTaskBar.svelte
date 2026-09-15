<script lang="ts">
	let { data }: { data: { text?: string; type?: string; critical?: boolean } } = $props();
</script>

{#if data.type === 'milestone'}
	<div class="milestone" class:critical={data.critical}></div>
	<div class="label">{data.text ?? ''}</div>
{:else}
	<div class="bar" class:critical={data.critical}>{data.text ?? ''}</div>
{/if}

<style>
	.bar {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--wx-gantt-task-font-color, #fff);
		background-color: var(--wx-gantt-task-color, #3983eb);
	}
	.bar.critical {
		outline: 2px solid crimson;
	}
	.milestone {
		position: absolute;
		inset: 0;
		z-index: 3;
		background-color: var(--wx-gantt-milestone-color, #ad44ab);
		transform: rotate(45deg) scale(0.75);
		border-radius: 3px;
	}
	.milestone.critical {
		outline: 2px solid crimson;
	}
	.label {
		position: absolute;
		left: 100%;
		padding: 0 4px;
		white-space: nowrap;
	}
</style>
