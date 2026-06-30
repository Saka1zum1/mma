import { useEffect, useEffectEvent, useState } from "react";
import { subscribeMany, type EditorEvent } from "@/lib/events";

/** Run `handler` whenever any of `events` fires, for the component's lifetime.
 *  The latest `handler` is always used without re-subscribing on identity change, so
 *  `events` should be a stable reference — e.g. one of the exported group constants. */
export function useEditorEvents(events: readonly EditorEvent[], handler: () => void): void {
	const onEvent = useEffectEvent(handler);
	useEffect(() => subscribeMany(events, onEvent), [events]);
}

/** A counter that bumps whenever any of `events` fires. Drop it into a deps array
 *  to re-run an effect or `useAsync` when that editor state changes. */
export function useEventVersion(events: readonly EditorEvent[]): number {
	const [version, setVersion] = useState(0);
	useEditorEvents(events, () => setVersion((v) => v + 1));
	return version;
}
