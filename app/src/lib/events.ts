import { log } from "@/lib/util/log";
import type { Location, MapData } from "@/types";
import type { Selection } from "@/store/selections";

/** Payload type for each editor event. `void` means the event carries no payload. */
export interface EditorEventMap {
	"location:add": Location[];
	"location:remove": number[];
	"location:update": Partial<Location> & { id: number };
	"selection:change": Selection[];
	"map:open": MapData;
	"map:close": void;
}

export type EditorEvent = keyof EditorEventMap;
export type EventHandler<E extends EditorEvent> = (payload: EditorEventMap[E]) => void;

/** Events whose payload is `void` may be emitted with no argument; all others require one. */
type EmitArgs<E extends EditorEvent> = EditorEventMap[E] extends void
	? []
	: [payload: EditorEventMap[E]];

const handlers = new Map<EditorEvent, Set<(payload: never) => void>>();

export function emit<E extends EditorEvent>(event: E, ...args: EmitArgs<E>): void {
	const set = handlers.get(event);
	if (!set) return;
	const payload = args[0] as never;
	for (const h of set) {
		try {
			h(payload);
		} catch (e) {
			log.error(`[event] ${event}:`, e);
		}
	}
}

export function subscribe<E extends EditorEvent>(event: E, handler: EventHandler<E>): () => void {
	let set = handlers.get(event);
	if (!set) {
		set = new Set();
		handlers.set(event, set);
	}
	const h = handler as (payload: never) => void;
	set.add(h);
	return () => {
		set!.delete(h);
	};
}
