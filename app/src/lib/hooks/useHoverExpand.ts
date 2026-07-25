import { useEffect, useRef, useState, type RefObject } from "react";
import { useDomEvent } from "./useDomEvent";

/**
 * Hover-to-expand panel state. A drag that starts inside the panel holds it open until the
 * release, which then decides: still inside stays open, outside closes after the usual
 * delay. Leaving mid-drag can't be trusted either way -- the dragged surface captures the
 * pointer, so pointerleave fires late, or never.
 */
export function useHoverExpand(ref: RefObject<HTMLElement | null>, closeDelay: number) {
	const [expanded, setExpanded] = useState(false);
	const closeTimer = useRef<number | null>(null);
	const dragging = useRef(false);

	const open = () => {
		if (closeTimer.current !== null) {
			clearTimeout(closeTimer.current);
			closeTimer.current = null;
		}
		setExpanded(true);
	};

	const scheduleClose = () => {
		if (dragging.current) return;
		if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		closeTimer.current = window.setTimeout(() => {
			setExpanded(false);
			closeTimer.current = null;
		}, closeDelay);
	};

	useDomEvent("pointerup", (e) => {
		dragging.current = false;
		const el = ref.current;
		if (!expanded || !el) return;
		const { clientX, clientY } = e as PointerEvent;
		const r = el.getBoundingClientRect();
		const inside =
			clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
		if (!inside) scheduleClose();
	});

	useEffect(() => {
		return () => {
			if (closeTimer.current !== null) clearTimeout(closeTimer.current);
		};
	}, []);

	return {
		expanded,
		hoverProps: {
			onPointerEnter: open,
			onPointerLeave: scheduleClose,
			onPointerDown: () => {
				dragging.current = true;
			},
		},
	};
}
