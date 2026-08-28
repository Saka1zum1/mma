import { useState, useSyncExternalStore } from "react";
import type { Scope, PartitionBucket, KeySpec, Location } from "@/bindings.gen";
import { compareNatural } from "@/lib/util/util";
import { compareMonthOrder } from "@/lib/util/date";
import { resolveSavedSelectionIds } from "./savedSelections";
import type { ReadonlyIdSet } from "@/lib/render/CellManager";

import { useMapState, getMapState, groupBy, scopeIds } from "./useMapStore";

/** The user-facing "which locations" concept: Rust's mechanical Scope widened with
 *  saved selections, which resolve to ids in JS (Rust never sees saved definitions). */
export type ScopeWithSaved = Scope | { kind: "saved"; id: string };

export interface ScopeController<S extends ScopeWithSaved = Scope> {
	scope: S;
	// Method syntax on purpose: bivariance lets a plain ScopeController flow into
	// ScopeSelector's wider ScopeController<ScopeWithSaved> prop.
	setScope(s: S): void;
	allCount: number;
	selectionCount: number;
	/** Opt-in: ScopeSelector offers saved selections. Only for consumers that
	 *  narrow via resolveScopeIds rather than passing the scope to Rust. */
	saved?: boolean;
}

/** Narrow a materialized pool of id-bearing records to the scope's subset (JS-side).
 *  `props` scopes carry a predicate only Rust can evaluate -- resolve those via
 *  `resolveScopeIds`/`fetchLocations` instead. */
export function applyScope(scope: Scope, pool: Location[]): Location[] {
	if (scope.kind === "all") return pool;
	if (scope.kind === "props")
		throw new Error("applyScope: props scopes resolve in Rust (use resolveScopeIds)");
	const ids = scope.kind === "ids" ? new Set(scope.ids) : getMapState().selectedLocationIds;
	return pool.filter((item) => ids.has(item.id));
}

/** The id-set a scope narrows to, or null for "all". Saved and props scopes resolve async. */
export async function resolveScopeIds(scope: ScopeWithSaved): Promise<ReadonlyIdSet | null> {
	switch (scope.kind) {
		case "all":
			return null;
		case "selected":
			return getMapState().selectedLocationIds;
		case "ids":
			return new Set(scope.ids);
		case "props":
			return new Set(await scopeIds(scope));
		case "saved":
			return resolveSavedSelectionIds(scope.id);
	}
}

/** Group the scoped location set by a derived key - entirely in Rust, no locations fetched.
 *  Numeric bins arrive in bound order; projection keys are sorted naturally for display. */
export async function partition(
	field: string,
	key: KeySpec,
	scope: Scope,
): Promise<PartitionBucket[]> {
	const groups = await groupBy(scope, field, key);
	if (key.kind !== "numericBin") {
		const cmp =
			key.kind === "datePart" && key.part === "monthOfYear" ? compareMonthOrder : compareNatural;
		groups.sort((a, b) => cmp(a.key, b.key));
	}
	return groups;
}

function defaultScope(): Scope {
	return getMapState().selectedLocationIds.size > 0 ? { kind: "selected" } : { kind: "all" };
}

/** Reactive scope state + live counts, owned by the calling React component. Defaults to
 *  the current selection when one exists at mount, else all locations. Use this for plugins
 *  whose scope lives entirely in a React sidebar; reach for `createScope` when an imperative
 *  renderer (e.g. a deck.gl overlay) outside React also needs to read the scope. */
export function useScope(initial?: Scope): ScopeController {
	const selectedIds = useMapState((s) => s.selectedLocationIds);
	const allCount = useMapState((s) => s.locationCount);
	const [scope, setScope] = useState<Scope>(() => initial ?? defaultScope());
	return {
		scope,
		setScope,
		allCount,
		selectionCount: selectedIds.size,
	};
}

/** A per-consumer scope store that lives outside React, so an imperative renderer can read it
 *  synchronously and subscribe to changes while a React sidebar drives it via `use()`. Mirrors
 *  the module-store + hook idiom (cf. settings). Isolated per call - one consumer's choice never
 *  leaks into another's. */
export interface ScopeHandle {
	get(): Scope;
	set(scope: Scope): void;
	subscribe(listener: () => void): () => void;
	/** React view of this handle: re-renders on change, with live counts. */
	use(): ScopeController;
}

/** A standalone "all locations vs current selection" switch, for features that operate on a subset. */
export function createScope(initial?: Scope): ScopeHandle {
	let scope: Scope = initial ?? defaultScope();
	const listeners = new Set<() => void>();
	const get = () => scope;
	const set = (next: Scope) => {
		// Structural, not by kind: two `ids` scopes differ by their contents.
		if (JSON.stringify(next) === JSON.stringify(scope)) return;
		scope = next;
		for (const l of listeners) l();
	};
	const sub = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	return {
		get,
		set,
		subscribe: sub,
		use(): ScopeController {
			useSyncExternalStore(sub, get);
			const selectedIds = useMapState((s) => s.selectedLocationIds);
			const allCount = useMapState((s) => s.locationCount);
			return {
				scope,
				setScope: set,
				allCount,
				selectionCount: selectedIds.size,
			};
		},
	};
}
