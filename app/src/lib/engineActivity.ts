import type { ProcedureActivity } from "@/bindings.gen";

export interface EngineProviderRow {
	key: string;
	label: string;
	fraction: number;
	done: number;
	total: number;
	failed: number;
	skipped: number;
	inflight: number;
	inflightLimit: number;
	rateWaiting: number;
	retries: number;
	instances: number;
}

export interface EngineQueryRow {
	entry: string;
	inflight: number;
	inflightLimit: number;
	retries: number;
}

export interface EngineRows {
	providers: EngineProviderRow[];
	queries: EngineQueryRow[];
	requestsPerSecond: number;
	idle: boolean;
}

function procedureLabel(entry: string): string {
	const m = entry.match(/([^/]+)\.js$/);
	return m ? m[1] : entry;
}

/** An engine activity snapshot as a panel shows it: one row per working provider, one
 *  per procedure answering questions, and whether anything is happening at all. */
export function engineRows(activity: ProcedureActivity | null): EngineRows {
	const providers = (activity?.runs ?? []).map((r) => ({
		key: `${r.runId}:${r.providerId}`,
		label: r.label ?? r.providerId,
		fraction: r.total > 0 ? r.done / r.total : 0,
		done: r.done,
		total: r.total,
		failed: r.failed,
		skipped: r.skipped,
		inflight: r.inflight,
		inflightLimit: r.inflightLimit,
		rateWaiting: r.rateWaiting,
		retries: r.retries,
		instances: r.instances,
	}));
	const queries = (activity?.queries ?? []).map((q) => ({
		entry: procedureLabel(q.entry),
		inflight: q.inflight,
		inflightLimit: q.inflightLimit,
		retries: q.retries,
	}));
	return {
		providers,
		queries,
		requestsPerSecond: activity?.requestsPerSecond ?? 0,
		idle: providers.length === 0 && queries.length === 0,
	};
}
