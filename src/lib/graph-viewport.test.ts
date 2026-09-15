import { describe, it, expect } from 'vitest';
import { VIEW_WIDTH, VIEW_HEIGHT } from './graph-layout';
import {
	DEFAULT_VIEWPORT,
	MAX_SCALE,
	MIN_SCALE,
	panViewport,
	screenToSvg,
	svgToScreen,
	zoomViewportAtPoint
} from './graph-viewport';

const rect = { left: 100, top: 50, width: VIEW_WIDTH, height: VIEW_HEIGHT };

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

	it('scales by the rect size relative to the viewBox dimensions when the rendered size differs from VIEW_WIDTH/VIEW_HEIGHT', () => {
		// Rendered wider/taller than the 900x600 viewBox (e.g. .graph-canvas at width: 100%
		// on a wide viewport) — the full width/height of the rendered rect must still map to
		// the full width/height of the viewBox, not to VIEW_WIDTH/VIEW_HEIGHT screen px.
		const wideRect = { left: 0, top: 0, width: 1266, height: 844 };
		const svgPoint = screenToSvg({ x: 1266, y: 844 }, wideRect, DEFAULT_VIEWPORT);
		expect(svgPoint.x).toBeCloseTo(VIEW_WIDTH);
		expect(svgPoint.y).toBeCloseTo(VIEW_HEIGHT);
	});

	it('svgToScreen inverts screenToSvg for a rect whose rendered size differs from the viewBox', () => {
		const wideRect = { left: 40, top: 15, width: 1266, height: 844 };
		const viewport = { x: 10, y: 5, scale: 1.5 };
		const screenPoint = { x: 500, y: 300 };
		const svgPoint = screenToSvg(screenPoint, wideRect, viewport);
		expect(svgToScreen(svgPoint, wideRect, viewport)).toEqual(screenPoint);
		// And it must actually use the rect's rendered size, not just viewport.scale:
		// mapping the rect's right/bottom edge should land at the far edge of the viewBox.
		const edge = screenToSvg(
			{ x: wideRect.left + wideRect.width, y: wideRect.top + wideRect.height },
			wideRect,
			DEFAULT_VIEWPORT
		);
		expect(edge.x).toBeCloseTo(VIEW_WIDTH);
		expect(edge.y).toBeCloseTo(VIEW_HEIGHT);
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
		const tinyZoom = zoomViewportAtPoint(
			{ x: 0, y: 0, scale: MIN_SCALE },
			{ x: 0, y: 0 },
			rect,
			0.1
		);
		expect(tinyZoom.scale).toBe(MIN_SCALE);
		const hugeZoom = zoomViewportAtPoint(
			{ x: 0, y: 0, scale: MAX_SCALE },
			{ x: 0, y: 0 },
			rect,
			10
		);
		expect(hugeZoom.scale).toBe(MAX_SCALE);
	});
});
