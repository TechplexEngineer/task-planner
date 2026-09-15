import type { Point } from './graph-layout';

export interface Viewport {
	x: number;
	y: number;
	scale: number;
}

export interface Rect {
	left: number;
	top: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function screenToSvg(point: Point, rect: Rect, viewport: Viewport): Point {
	return {
		x: viewport.x + (point.x - rect.left) / viewport.scale,
		y: viewport.y + (point.y - rect.top) / viewport.scale
	};
}

export function svgToScreen(point: Point, rect: Rect, viewport: Viewport): Point {
	return {
		x: rect.left + (point.x - viewport.x) * viewport.scale,
		y: rect.top + (point.y - viewport.y) * viewport.scale
	};
}

export function panViewport(
	viewport: Viewport,
	deltaScreenX: number,
	deltaScreenY: number
): Viewport {
	return {
		...viewport,
		x: viewport.x - deltaScreenX / viewport.scale,
		y: viewport.y - deltaScreenY / viewport.scale
	};
}

export function zoomViewportAtPoint(
	viewport: Viewport,
	cursorScreen: Point,
	rect: Rect,
	zoomFactor: number
): Viewport {
	const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * zoomFactor));
	const svgPointUnderCursor = screenToSvg(cursorScreen, rect, viewport);
	return {
		scale: newScale,
		x: svgPointUnderCursor.x - (cursorScreen.x - rect.left) / newScale,
		y: svgPointUnderCursor.y - (cursorScreen.y - rect.top) / newScale
	};
}
