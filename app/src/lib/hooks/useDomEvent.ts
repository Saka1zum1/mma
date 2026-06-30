import { useEffect, useEffectEvent } from "react";

export function useDomEvent(event: string, handler: (e: Event) => void) {
	const onEvent = useEffectEvent(handler);
	useEffect(() => {
		const listener = (e: Event) => onEvent(e);
		document.addEventListener(event, listener);
		return () => document.removeEventListener(event, listener);
	}, [event]);
}
