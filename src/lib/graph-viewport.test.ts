import { describe, it, expect } from 'vitest';
import {
	DEFAULT_VIEWPORT,
	MAX_SCALE,
	MIN_SCALE,
	panViewport,
	screenToSvg,
	svgToScreen,
	zoomViewportAtPoint
} from './graph-viewport';

const rect = { left: 100, top: 50 };

describe('screenToSvg / svgToScreen', () => {
	it('round-trips a point at the default viewport', () => {
		const screenPoint = { x: 150, y: 90 };
		const svgPoint = screenToSvg(screenPoint, rect, DEFAULT_VIEWPORT);
		expect(svgToScreen(svgPoint, rect, DEFAULT_VIEWPORT)).toEqual(screenPoint);
	});

	it('accounts for pan offset and scale', () => {
		const viewport = { x: 20, y: 10, scale: 2 };
		const svgPoint = screenToSvg({ x: 120, y: 70 }, rect, viewport);
		expect(svgPoint).toEqual({ x: 30, y: 20 });
	});
});

describe('panViewport', () => {
	it('shifts the viewport opposite the drag delta, scaled', () => {
		const viewport = { x: 0, y: 0, scale: 2 };
		expect(panViewport(viewport, 20, 10)).toEqual({ x: -10, y: -5, scale: 2 });
	});
});

describe('zoomViewportAtPoint', () => {
	it('keeps the cursor over the same SVG point after zooming in', () => {
		const viewport = { x: 0, y: 0, scale: 1 };
		const cursorScreen = { x: 150, y: 90 };
		const before = screenToSvg(cursorScreen, rect, viewport);
		const after = zoomViewportAtPoint(viewport, cursorScreen, rect, 2);
		const svgPointAfter = screenToSvg(cursorScreen, rect, after);
		expect(svgPointAfter.x).toBeCloseTo(before.x);
		expect(svgPointAfter.y).toBeCloseTo(before.y);
	});

	it('clamps scale to MIN_SCALE/MAX_SCALE', () => {
		const tinyZoom = zoomViewportAtPoint({ x: 0, y: 0, scale: MIN_SCALE }, { x: 0, y: 0 }, rect, 0.1);
		expect(tinyZoom.scale).toBe(MIN_SCALE);
		const hugeZoom = zoomViewportAtPoint({ x: 0, y: 0, scale: MAX_SCALE }, { x: 0, y: 0 }, rect, 10);
		expect(hugeZoom.scale).toBe(MAX_SCALE);
	});
});
