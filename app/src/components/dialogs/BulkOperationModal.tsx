import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/primitives/Dialog";
import {
	getCurrentMap,
	addSelections,
	fetchAllLocations,
	batchUpdateLocations,
	useScope,
	applyScope,
	type Scope,
	type ScopeController,
} from "@/store/useMapStore";
import { ScopeSelector } from "@/components/primitives/ScopeSelector";
import type { Location } from "@/types";
import { isPinnedToPano } from "@/types";
import { getFieldDef, getAllFieldDefs } from "@/lib/data/fieldDefRegistry";
import {
	planFieldSet,
	planFieldExpr,
	parseFieldExpr,
	fieldPatch,
	TOP_LEVEL_SET_FIELDS,
} from "@/lib/data/fieldOps";
import { ValidationState } from "@/store/selections";
import { validateLocations } from "@/lib/sv/validate";
import { enrichAll, needsEnrichment, type EnrichResult } from "@/lib/sv/enrich";
import { bulkPinToPano } from "@/lib/sv/pinPano";
import { bulkPanHeading, type RoadDirection } from "@/lib/sv/headingRoad";
import { fmt } from "@/lib/util/format";

const TITLES = {
	validate: "Validate locations",
	enrich: "Enrich metadata",
	pinPano: "Pin to Pano ID",
	clearFields: "Clear metadata fields",
	setField: "Set metadata field",
	headingRoad: "Pan headings along road",
} as const;
export type BulkOperation = keyof typeof TITLES;

interface Props {
	operation: BulkOperation;
	onClose: () => void;
}

function BulkSetup({
	operation,
	scopeCtl,
	onStart,
}: {
	operation: BulkOperation;
	scopeCtl: ScopeController;
	onStart: (opts: {
		force: boolean;
		clearKeys?: string[];
		setField?: Partial<Location>;
		setExpr?: { key: string; src: string };
		headingDirection?: RoadDirection;
	}) => void;
}) {
	const [force, setForce] = useState(false);
	const [locs, setLocs] = useState<Location[]>([]);
	const { scope } = scopeCtl;
	const map = getCurrentMap();

	useEffect(() => {
		fetchAllLocations().then(setLocs);
	}, []);

	if (!map) return null;

	const scopedLocs = applyScope(scope, locs);

	if (operation === "enrich") {
		const unenriched = scopedLocs.filter(needsEnrichment).length;
		const noPano = scopedLocs.filter((l) => !l.panoId).length;
		return (
			<div className="bulk-operation">
				<ScopeSelector ctl={scopeCtl} />
				<div className="bulk-operation__status">
					{fmt.format(unenriched)} locations need enrichment.
					{noPano > 0 &&
						` ${fmt.format(noPano)} without pano ID will be resolved from coordinates.`}
				</div>
				<label className="bulk-operation__option">
					<input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
					Re-enrich already enriched locations
				</label>
				<div className="bulk-operation__actions">
					<button
						className="button button--primary"
						type="button"
						onClick={() => onStart({ force })}
						disabled={!force && unenriched === 0}
					>
						Start
					</button>
				</div>
			</div>
		);
	}

	if (operation === "pinPano") {
		const unpinned = scopedLocs.filter((l) => !isPinnedToPano(l)).length;
		return (
			<div className="bulk-operation">
				<ScopeSelector ctl={scopeCtl} />
				<div className="bulk-operation__status">
					{fmt.format(unpinned)} locations not pinned to a pano ID.
				</div>
				<label className="bulk-operation__option">
					<input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
					Re-pin already pinned locations
				</label>
				<div className="bulk-operation__actions">
					<button
						className="button button--primary"
						type="button"
						onClick={() => onStart({ force })}
						disabled={!force && unpinned === 0}
					>
						Start
					</button>
				</div>
			</div>
		);
	}

	if (operation === "clearFields") {
		return (
			<ClearFieldsSetup
				locs={locs}
				scopedLocs={scopedLocs}
				scopeCtl={scopeCtl}
				onStart={(keys) => onStart({ force: false, clearKeys: keys })}
			/>
		);
	}

	if (operation === "setField") {
		return (
			<SetFieldSetup
				locs={locs}
				scopeCtl={scopeCtl}
				onStart={(v) =>
					onStart({
						force: false,
						setField: v.patch,
						setExpr: v.exprKey != null ? { key: v.exprKey, src: v.exprSrc! } : undefined,
					})
				}
			/>
		);
	}

	if (operation === "headingRoad") {
		return (
			<HeadingRoadSetup
				scopeCtl={scopeCtl}
				onStart={(direction) => onStart({ force: false, headingDirection: direction })}
			/>
		);
	}

	// validate has no setup options beyond scope
	return (
		<div className="bulk-operation">
			<ScopeSelector ctl={scopeCtl} />
			<div className="bulk-operation__actions">
				<button
					className="button button--primary"
					type="button"
					onClick={() => onStart({ force: false })}
				>
					Start
				</button>
			</div>
		</div>
	);
}

function ClearFieldsSetup({
	locs,
	scopedLocs,
	scopeCtl,
	onStart,
}: {
	locs: Location[];
	scopedLocs: Location[];
	scopeCtl: ScopeController;
	onStart: (keys: string[]) => void;
}) {
	const allKeys = new Set<string>();
	for (const loc of locs) {
		if (loc.extra) for (const k of Object.keys(loc.extra)) allKeys.add(k);
	}

	const sortedKeys = [...allKeys].sort();
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const toggle = (key: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const scopedWithData = (key: string) => scopedLocs.filter((l) => l.extra?.[key] != null).length;

	return (
		<div className="bulk-operation">
			<ScopeSelector ctl={scopeCtl} />
			{sortedKeys.length === 0 ? (
				<div className="bulk-operation__status">No metadata fields on this map.</div>
			) : (
				<div className="bulk-operation__field-list">
					{sortedKeys.map((key) => {
						const def = getFieldDef(key);
						const count = scopedWithData(key);
						return (
							<label key={key} className="bulk-operation__field-item">
								<input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
								<span className="bulk-operation__field-label">{def?.label ?? key}</span>
								{def?.label && def.label !== key && (
									<span className="bulk-operation__field-key">{key}</span>
								)}
								<span className="bulk-operation__field-count">
									{count > 0 ? `${fmt.format(count)} values` : "no data"}
								</span>
							</label>
						);
					})}
				</div>
			)}
			<div className="bulk-operation__actions">
				<button
					className="button button--primary"
					type="button"
					onClick={() => onStart([...selected])}
					disabled={selected.size === 0}
				>
					Clear {selected.size > 0 ? `${selected.size} field${selected.size !== 1 ? "s" : ""}` : ""}
				</button>
			</div>
		</div>
	);
}

function SetFieldSetup({
	locs,
	scopeCtl,
	onStart,
}: {
	locs: Location[];
	scopeCtl: ScopeController;
	onStart: (v: { patch?: Partial<Location>; exprKey?: string; exprSrc?: string }) => void;
}) {
	const sortedKeys = useMemo(() => {
		const known = new Set<string>([
			...Object.keys(TOP_LEVEL_SET_FIELDS),
			...Object.keys(getAllFieldDefs()),
		]);
		for (const loc of locs) {
			if (loc.extra) for (const k of Object.keys(loc.extra)) known.add(k);
		}
		return [...known].sort();
	}, [locs]);

	const [key, setKey] = useState("");
	const [creatingNew, setCreatingNew] = useState(false);
	const [newKey, setNewKey] = useState("");
	const [raw, setRaw] = useState("");

	const effectiveKey = (creatingNew ? newKey : key).trim();
	const def = effectiveKey ? (getFieldDef(effectiveKey) ?? TOP_LEVEL_SET_FIELDS[effectiveKey]) : undefined;
	const isNumber = def?.type === "number";
	const isEnum = def?.type === "enum" && def.values;
	// Number targets take an expression (a constant is the degenerate case); other
	// types keep the literal input.
	const exprError = useMemo(() => {
		if (!isNumber || raw.trim() === "") return null;
		try {
			parseFieldExpr(raw);
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : "Invalid expression";
		}
	}, [isNumber, raw]);
	const invalid = !effectiveKey || (isNumber && (raw.trim() === "" || exprError != null));

	return (
		<div className="bulk-operation">
			<ScopeSelector ctl={scopeCtl} />
			<label className="bulk-operation__option">
				Field
				<select
					className="nselect"
					value={creatingNew ? "__new__" : key}
					onChange={(e) => {
						if (e.target.value === "__new__") {
							setCreatingNew(true);
						} else {
							setCreatingNew(false);
							setKey(e.target.value);
						}
					}}
				>
					<option value="" disabled>
						Select a field...
					</option>
					{sortedKeys.map((k) => (
						<option key={k} value={k}>
							{getFieldDef(k)?.label ?? TOP_LEVEL_SET_FIELDS[k]?.label ?? k}
						</option>
					))}
					<option value="__new__">New field...</option>
				</select>
			</label>
			{creatingNew && (
				<label className="bulk-operation__option">
					New field name
					<input
						className="input"
						value={newKey}
						onChange={(e) => setNewKey(e.target.value)}
						placeholder="field name"
						autoFocus
					/>
				</label>
			)}
			<label className="bulk-operation__option">
				Value
				{isEnum ? (
					<select className="nselect" value={raw} onChange={(e) => setRaw(e.target.value)}>
						<option value="" />
						{def!.values!.map((v) => (
							<option key={v} value={v}>
								{def!.labels?.[v] ?? v}
							</option>
						))}
					</select>
				) : (
					<input
						className="input"
						type="text"
						value={raw}
						onChange={(e) => setRaw(e.target.value)}
						placeholder={isNumber ? "e.g. 45 or mod(sunAzimuth + 180, 360)" : undefined}
					/>
				)}
			</label>
			{isNumber && (
				<div className="bulk-operation__status">
					{exprError
						? `Invalid expression: ${exprError}`
						: "Constant or expression over fields (e.g. sunAzimuth, drivingDirection, lat)."}
				</div>
			)}
			<div className="bulk-operation__actions">
				<button
					className="button button--primary"
					type="button"
					disabled={invalid}
					onClick={() =>
						isNumber
							? onStart({ exprKey: effectiveKey, exprSrc: raw })
							: onStart({ patch: fieldPatch(effectiveKey, raw) })
					}
				>
					Set field
				</button>
			</div>
		</div>
	);
}

function HeadingRoadSetup({
	scopeCtl,
	onStart,
}: {
	scopeCtl: ScopeController;
	onStart: (direction: RoadDirection) => void;
}) {
	const [direction, setDirection] = useState<RoadDirection>("forwards");

	return (
		<div className="bulk-operation">
			<ScopeSelector ctl={scopeCtl} />
			<div className="bulk-operation__fieldset">
				<label>
					<input
						type="radio"
						name="direction"
						checked={direction === "forwards"}
						onChange={() => setDirection("forwards")}
					/>
					Forwards (along driving direction)
				</label>
				<label>
					<input
						type="radio"
						name="direction"
						checked={direction === "backwards"}
						onChange={() => setDirection("backwards")}
					/>
					Backwards
				</label>
			</div>
			<div className="bulk-operation__actions">
				<button className="button button--primary" type="button" onClick={() => onStart(direction)}>
					Start
				</button>
			</div>
		</div>
	);
}

function EnrichSummary({
	result,
	onSelect,
}: {
	result: EnrichResult;
	onSelect: (ids: number[], label: string) => void;
}) {
	if (result.length === 0) {
		return (
			<div className="enrich-summary">
				<div>Nothing to process.</div>
			</div>
		);
	}
	return (
		<div className="enrich-summary">
			{result.map((r) => (
				<div key={r.id}>
					{r.label}: {fmt.format(r.success.length)} updated
					{r.failed.length > 0 && <>, {fmt.format(r.failed.length)} failed</>}
					{r.failed.length > 0 && (
						<button
							className="button"
							type="button"
							style={{ marginLeft: 8 }}
							onClick={() => onSelect(r.failed, `${r.label} failed`)}
						>
							Select failed
						</button>
					)}
				</div>
			))}
		</div>
	);
}

function BulkProgress({
	operation,
	force,
	scope,
	clearKeys,
	setField,
	setExpr,
	headingDirection,
	onClose,
}: {
	operation: BulkOperation;
	force: boolean;
	scope: Scope;
	clearKeys?: string[];
	setField?: Partial<Location>;
	setExpr?: { key: string; src: string };
	headingDirection?: RoadDirection;
	onClose: () => void;
}) {
	const [progress, setProgress] = useState(0);
	const [total, setTotal] = useState(0);
	const [done, setDone] = useState(0);
	const [phaseLabel, setPhaseLabel] = useState<string | null>(null);
	const [status, setStatus] = useState<"running" | "done" | "cancelled" | "error">("running");
	const [error, setError] = useState<string | null>(null);
	const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
	const [clearCount, setClearCount] = useState(0);
	const [skippedCount, setSkippedCount] = useState(0);
	const controllerRef = useRef<AbortController | null>(null);

	const run = useCallback(async () => {
		const map = getCurrentMap();
		if (!map) return;
		const controller = new AbortController();
		controllerRef.current = controller;

		const locations = applyScope(scope, await fetchAllLocations());

		const onProgress = (d: number, t: number, label?: string) => {
			setPhaseLabel(label ?? null);
			setTotal(t);
			setDone(d);
			setProgress(t > 0 ? d / t : 1);
		};

		try {
			if (operation === "validate") {
				const results = await validateLocations(locations, {
					signal: controller.signal,
					onProgress: (p) =>
						onProgress(Math.round(p.progress * locations.length), locations.length),
				});

				const stateOrder = [
					ValidationState.Ok,
					ValidationState.UpdateAvailable,
					ValidationState.UpdateApplied,
					ValidationState.GoodcamAvailable,
					ValidationState.PanoIdBroke,
					ValidationState.Unofficial,
					ValidationState.NotFound,
				];
				const batch = stateOrder
					.filter((state) => (results.get(state)?.length ?? 0) > 0)
					.map((state) => ({
						type: "ValidationState" as const,
						locations: results.get(state)!.map((l) => l.id),
						state,
					}));
				if (batch.length > 0) addSelections(batch);
			} else if (operation === "enrich") {
				const er = await enrichAll(locations, {
					signal: controller.signal,
					force,
					onProgress,
				});
				setEnrichResult(er);
			} else if (operation === "pinPano") {
				await bulkPinToPano(locations, {
					signal: controller.signal,
					force,
					onProgress,
				});
			} else if (operation === "clearFields") {
				const keys = clearKeys ?? [];
				const updates: { id: number; patch: { extra: Record<string, unknown> } }[] = [];
				for (const loc of locations) {
					if (!loc.extra) continue;
					const hasAny = keys.some((k) => loc.extra![k] != null);
					if (!hasAny) continue;
					const cleaned = { ...loc.extra };
					for (const k of keys) delete cleaned[k];
					updates.push({ id: loc.id, patch: { extra: cleaned } });
				}

				setTotal(updates.length);
				if (updates.length > 0) {
					await batchUpdateLocations(updates);
				}
				setDone(updates.length);
				setClearCount(updates.length);
			} else if (operation === "setField" && setExpr) {
				const { updates, skipped } = planFieldExpr(
					locations,
					setExpr.key,
					parseFieldExpr(setExpr.src),
				);
				setTotal(updates.length);
				if (updates.length > 0) {
					await batchUpdateLocations(updates);
				}
				setDone(updates.length);
				setClearCount(updates.length);
				setSkippedCount(skipped);
			} else if (operation === "setField" && setField) {
				const updates = planFieldSet(locations, setField);
				setTotal(updates.length);
				if (updates.length > 0) {
					await batchUpdateLocations(updates);
				}
				setDone(updates.length);
				setClearCount(updates.length);
			} else if (operation === "headingRoad") {
				const count = await bulkPanHeading(locations, headingDirection ?? "forwards", {
					signal: controller.signal,
					onProgress,
				});
				setClearCount(count);
			}
			setProgress(1);
			setStatus("done");
		} catch (e: unknown) {
			if (e instanceof Error && e.name === "AbortError") {
				if (controllerRef.current === controller) setStatus("cancelled");
			} else {
				setError(e instanceof Error ? e.message : "Operation failed");
				setStatus("error");
			}
		}
	}, [operation, force, scope, clearKeys, setField, setExpr, headingDirection]);

	useEffect(() => {
		run();
		return () => {
			controllerRef.current?.abort();
		};
	}, [run]);

	const pct = Math.round(progress * 100);

	return (
		<div className="bulk-operation">
			<div className="bulk-operation__status">
				{status === "running" &&
					`${phaseLabel ? `${phaseLabel}: ` : ""}${fmt.format(done)} / ${fmt.format(total)} (${pct}%)`}
				{status === "done" && enrichResult ? (
					<EnrichSummary
						result={enrichResult}
						onSelect={(ids, _label) => {
							addSelections([{ type: "Manual", locations: ids }]);
						}}
					/>
				) : status === "done" && operation === "clearFields" ? (
					`Cleared fields from ${fmt.format(clearCount)} locations.`
				) : status === "done" && operation === "setField" ? (
					`Set field on ${fmt.format(clearCount)} locations.${
						skippedCount > 0 ? ` ${fmt.format(skippedCount)} skipped (missing source fields).` : ""
					}`
				) : status === "done" && operation === "headingRoad" ? (
					`Panned ${fmt.format(clearCount)} headings.`
				) : (
					status === "done" && `Done -- ${fmt.format(total)} locations processed.`
				)}
				{status === "cancelled" && `Cancelled at ${fmt.format(done)} / ${fmt.format(total)}.`}
				{status === "error" && `Error: ${error}`}
			</div>
			<progress className="bulk-operation__bar" value={progress} max={1} />
			<div className="bulk-operation__actions">
				{status === "running" ? (
					<button
						className="button button--destructive"
						type="button"
						onClick={() => controllerRef.current?.abort()}
					>
						Cancel
					</button>
				) : (
					<button className="button button--primary" type="button" onClick={onClose}>
						Close
					</button>
				)}
			</div>
		</div>
	);
}

export function BulkOperationModal({ operation, onClose }: Props) {
	const [started, setStarted] = useState(false);
	const [force, setForce] = useState(false);
	const scopeCtl = useScope();
	const [clearKeys, setClearKeys] = useState<string[]>([]);
	const [setField, setSetField] = useState<Partial<Location> | undefined>(undefined);
	const [setExpr, setSetExpr] = useState<{ key: string; src: string } | undefined>(undefined);
	const [headingDirection, setHeadingDirection] = useState<RoadDirection | undefined>(undefined);

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent title={TITLES[operation]} className="bulk-operation-modal">
				{!started ? (
					<BulkSetup
						operation={operation}
						scopeCtl={scopeCtl}
						onStart={(opts) => {
							setForce(opts.force);
							if (opts.clearKeys) setClearKeys(opts.clearKeys);
							if (opts.setField) setSetField(opts.setField);
							if (opts.setExpr) setSetExpr(opts.setExpr);
							if (opts.headingDirection) setHeadingDirection(opts.headingDirection);
							setStarted(true);
						}}
					/>
				) : (
					<BulkProgress
						operation={operation}
						force={force}
						scope={scopeCtl.scope}
						clearKeys={clearKeys}
						setField={setField}
						setExpr={setExpr}
						headingDirection={headingDirection}
						onClose={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
