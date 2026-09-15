import type { Point } from './graph-layout';
import { VIEW_WIDTH, VIEW_HEIGHT } from './graph-layout';

export interface Viewport {
	x: number;
	y: number;
	scale: number;
}

export interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function screenToSvg(point: Point, rect: Rect, viewport: Viewport): Point {
	const scaleX = viewport.scale * (rect.width / VIEW_WIDTH);
	const scaleY = viewport.scale * (rect.height / VIEW_HEIGHT);
	return {
		x: viewport.x + (point.x - rect.left) / scaleX,
		y: viewport.y + (point.y - rect.top) / scaleY
	};
}

export function svgToScreen(point: Point, rect: Rect, viewport: Viewport): Point {
	const scaleX = viewport.scale * (rect.width / VIEW_WIDTH);
	const scaleY = viewport.scale * (rect.height / VIEW_HEIGHT);
	return {
		x: rect.left + (point.x - viewport.x) * scaleX,
		y: rect.top + (point.y - viewport.y) * scaleY
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
	const scaleX = newScale * (rect.width / VIEW_WIDTH);
	const scaleY = newScale * (rect.height / VIEW_HEIGHT);
	return {
		scale: newScale,
		x: svgPointUnderCursor.x - (cursorScreen.x - rect.left) / scaleX,
		y: svgPointUnderCursor.y - (cursorScreen.y - rect.top) / scaleY
	};
}
