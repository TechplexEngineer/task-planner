import {
	computeBasePositions,
	GRAPH_COLUMN_WIDTH,
	NODE_SIZE,
	type LayeredTask,
	type Point
} from './graph-layout';

export interface DependencyEdge {
	predecessorId: number;
	successorId: number;
}

const MIN_SEPARATION = NODE_SIZE * 1.5;
const SPRING_LENGTH = GRAPH_COLUMN_WIDTH;
const SPRING_STRENGTH = 0.05;
const DIRECTIONAL_BIAS = 0.1;
const ITERATIONS = 300;

export function computeAutoLayout(
	tasks: LayeredTask[],
	edges: DependencyEdge[],
	pinned: Map<number, Point>
): Map<number, Point> {
	const base = computeBasePositions(tasks);
	const positions = new Map<number, Point>();
	for (const task of tasks) {
		const pin = pinned.get(task.id);
		positions.set(task.id, pin ? { ...pin } : { ...base.get(task.id)! });
	}

	let temperature = SPRING_LENGTH;
	const cooling = temperature / ITERATIONS;

	for (let iteration = 0; iteration < ITERATIONS; iteration++) {
		const forces = new Map<number, Point>();
		for (const task of tasks) forces.set(task.id, { x: 0, y: 0 });

		for (let i = 0; i < tasks.length; i++) {
			for (let j = i + 1; j < tasks.length; j++) {
				const a = tasks[i];
				const b = tasks[j];
				const pa = positions.get(a.id)!;
				const pb = positions.get(b.id)!;
				let dx = pa.x - pb.x;
				const dy = pa.y - pb.y;
				let distance = Math.hypot(dx, dy);
				if (distance === 0) {
					dx = 0.01;
					distance = 0.01;
				}
				if (distance < MIN_SEPARATION) {
					const magnitude = ((MIN_SEPARATION - distance) / MIN_SEPARATION) * MIN_SEPARATION;
					const fx = (dx / distance) * magnitude;
					const fy = (dy / distance) * magnitude;
					const fa = forces.get(a.id)!;
					fa.x += fx;
					fa.y += fy;
					const fb = forces.get(b.id)!;
					fb.x -= fx;
					fb.y -= fy;
				}
			}
		}

		for (const edge of edges) {
			const pa = positions.get(edge.predecessorId);
			const pb = positions.get(edge.successorId);
			if (!pa || !pb) continue;
			const dx = pb.x - pa.x;
			const dy = pb.y - pa.y;
			const distance = Math.hypot(dx, dy) || 0.01;
			const displacement = distance - SPRING_LENGTH;
			const fx = (dx / distance) * displacement * SPRING_STRENGTH;
			const fy = (dy / distance) * displacement * SPRING_STRENGTH;
			const fPred = forces.get(edge.predecessorId)!;
			fPred.x += fx;
			fPred.y += fy;
			const fSucc = forces.get(edge.successorId)!;
			fSucc.x -= fx;
			fSucc.y -= fy;

			const minGapX = SPRING_LENGTH * 0.5;
			if (dx < minGapX) {
				const bias = (minGapX - dx) * DIRECTIONAL_BIAS;
				fPred.x -= bias;
				fSucc.x += bias;
			}
		}

		for (const task of tasks) {
			if (pinned.has(task.id)) continue;
			const position = positions.get(task.id)!;
			const force = forces.get(task.id)!;
			const magnitude = Math.hypot(force.x, force.y) || 0.0001;
			const capped = Math.min(magnitude, temperature);
			// Clamp to the canvas origin: nothing may be laid out above/left of (0, 0),
			// which is where the visible viewBox and page content above it begin.
			position.x = Math.max(0, position.x + (force.x / magnitude) * capped);
			position.y = Math.max(0, position.y + (force.y / magnitude) * capped);
		}

		temperature = Math.max(temperature - cooling, 0.01);
	}

	return positions;
}
