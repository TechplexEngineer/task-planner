<script lang="ts">
	let { data, children } = $props();
</script>

<h1>{data.project.name}</h1>

{@render children()}
