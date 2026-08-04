import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";
import { EmptyState } from "@/components/primitives/Sidebar";
import { useT, type MessageKey, type MessageParams } from "@/lib/i18n";
import { mdiChartBoxOutline } from "@mdi/js";
import { computeAnalytics } from "./analyticsStore";
import { clearSessions, deleteSession } from "../gameSessionStore";
import { formatDistance } from "../ScoreUtils";
import { countryFlagHtml, type GameSession } from "../GameState";

function ScoreTrendChart({
	points,
	t,
}: {
	points: { at: number; score: number; mapName: string }[];
	t: (key: MessageKey, params?: MessageParams) => string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState({ w: 500, h: 220 });

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			setSize({ w: el.clientWidth || 500, h: el.clientHeight || 220 });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// ── hover interaction ────────────────────────────────────────
	const [hoverIdx, setHoverIdx] = useState<number | null>(null);
	const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const handleMouseEnter = useCallback((i: number) => {
		if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
		setHoverIdx(i);
	}, []);
	const handleMouseLeave = useCallback(() => {
		leaveTimer.current = setTimeout(() => setHoverIdx(null), 200);
	}, []);
	useEffect(() => () => {
		if (leaveTimer.current) clearTimeout(leaveTimer.current);
	}, []);

	if (points.length < 2) {
		return <div className="gg-analytics__chart-empty">—</div>;
	}

	// ── geometry ──────────────────────────────────────────────────
	const { w, h } = size;
	const padL = 54, padR = 24, padT = 18, padB = 32;
	const pw = w - padL - padR, ph = h - padT - padB;

	const maxScore = Math.max(...points.map((p) => p.score), 1);
	const round = (v: number, step: number) => Math.ceil(v / step) * step;
	const yStep = maxScore <= 2000 ? 500 : maxScore <= 10000 ? 2000 : maxScore <= 25000 ? 5000 : 10000;
	const yMax = round(maxScore, yStep);

	const spanMs = points[points.length - 1].at - points[0].at;
	const isHours = spanMs < 7 * 24 * 3600 * 1000;

	const dataPts = points.map((p, i) => ({
		x: padL + (i / (points.length - 1)) * pw,
		y: padT + ph - (p.score / yMax) * ph,
		score: p.score,
		at: p.at,
		map: p.mapName,
	}));

	// ── y‑ticks ───────────────────────────────────────────────────
	const yTicks: { y: number; label: string }[] = [];
	const steps = Math.max(2, Math.min(6, Math.floor(yMax / yStep)));
	for (let i = 0; i <= steps; i++) {
		const val = Math.round((yMax / steps) * i);
		if (val === 0 && i > 0) continue;
		yTicks.push({ y: padT + ph - (val / yMax) * ph, label: val.toLocaleString() });
	}

	// ── x‑ticks (max 6) ──────────────────────────────────────────
	const xTickCount = Math.min(6, points.length);
	const xTicks: { x: number; label: string }[] = [];
	for (let i = 0; i < xTickCount; i++) {
		const idx = Math.round((i / (xTickCount - 1)) * (points.length - 1));
		const ts = points[idx].at * 1000;
		const d = new Date(ts);
		const label = isHours
			? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
			: `${d.getMonth() + 1}/${d.getDate()}`;
		xTicks.push({ x: dataPts[idx].x, label });
	}

	// ── smooth catmull‑rom path ──────────────────────────────────
	const smoothPoints = (pts: typeof dataPts) => {
		const n = pts.length;
		if (n < 2) return "";
		let d = `M${pts[0].x},${pts[0].y}`;
		for (let i = 0; i < n - 1; i++) {
			const p0 = i > 0 ? pts[i - 1] : pts[0];
			const p1 = pts[i];
			const p2 = pts[i + 1];
			const p3 = i < n - 2 ? pts[i + 2] : pts[n - 1];
			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;
			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;
			d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
		}
		return d;
	};
	const pathD = smoothPoints(dataPts);
	const fillD = `${pathD} L${dataPts[dataPts.length - 1].x},${padT + ph} L${dataPts[0].x},${padT + ph} Z`;

	// ── hover tooltip position ───────────────────────────────────
	const hover = hoverIdx != null ? dataPts[hoverIdx] : null;
	const tooltipX = hover ? Math.min(Math.max(hover.x, 90), w - 90) : 0;
	const tooltipY = hover ? Math.max(4, hover.y - 56) : 0;

	return (
		<div ref={containerRef} className="gg-analytics__chart-wrap">
			<svg className="gg-analytics__chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
				<defs>
					<linearGradient id="gg-chart-fill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--gg-accent)" stopOpacity="0.25" />
						<stop offset="100%" stopColor="var(--gg-accent)" stopOpacity="0.02" />
					</linearGradient>
					<linearGradient id="gg-chart-stroke" x1="0" y1="0" x2="1" y2="0">
						<stop offset="0%" stopColor="var(--gg-accent)" stopOpacity="0.7" />
						<stop offset="100%" stopColor="var(--gg-accent-purple)" stopOpacity="1" />
					</linearGradient>
				</defs>

				{/* grid lines */}
				{yTicks.map((tk) => (
					<line key={`g-${tk.y}`} x1={padL} y1={tk.y} x2={padL + pw} y2={tk.y}
						stroke="var(--gg-border)" strokeWidth="0.8" strokeDasharray="5,5" />
				))}

				{/* area fill under line */}
				<path d={fillD} fill="url(#gg-chart-fill)" />

				{/* line */}
				<path d={pathD} fill="none" stroke="url(#gg-chart-stroke)" strokeWidth="2.2"
					strokeLinecap="round" strokeLinejoin="round" />

				{/* data dots */}
				{dataPts.map((p, i) => {
					const active = i === hoverIdx;
					return (
						<circle key={`pt-${i}`} cx={p.x} cy={p.y}
							r={active ? 5.5 : 3.5}
							fill={active ? "var(--gg-accent)" : "var(--gg-bg)"}
							stroke={active ? "var(--gg-accent)" : "var(--gg-accent)"}
							strokeWidth={active ? 2 : 1.6}
							style={{ cursor: "pointer", transition: "r 120ms, fill 120ms" }}
							onMouseEnter={() => handleMouseEnter(i)}
							onMouseLeave={handleMouseLeave}
						/>
					);
				})}

				{/* hover crosshair */}
				{hover && (
					<>
						<line x1={hover.x} y1={padT} x2={hover.x} y2={padT + ph}
							stroke="var(--gg-text)" strokeWidth="0.6" strokeDasharray="3,3" opacity="0.3" />
						<line x1={padL} y1={hover.y} x2={padL + pw} y2={hover.y}
							stroke="var(--gg-text)" strokeWidth="0.6" strokeDasharray="3,3" opacity="0.3" />
					</>
				)}

				{/* y‑axis labels */}
				{yTicks.map((tk) => (
					<text key={`yl-${tk.y}`} x={padL - 8} y={tk.y + 4} textAnchor="end"
						fontSize="10" fontFamily="var(--gg-font)" fill="var(--gg-muted)">
						{tk.label}
					</text>
				))}

				{/* x‑axis labels */}
				{xTicks.map((tk, i) => (
					<text key={`xl-${i}`} x={tk.x} y={h - 6} textAnchor="middle"
						fontSize="10" fontFamily="var(--gg-font)" fill="var(--gg-muted)">
						{tk.label}
					</text>
				))}

				{/* axis titles */}
				<text x={10} y={padT + ph / 2} textAnchor="middle" fontSize="10"
					fontFamily="var(--gg-font)" fill="var(--gg-muted)" opacity="0.55"
					transform={`rotate(-90, 10, ${padT + ph / 2})`}>
					{t("plugin.geoguessrGame.scoreTimeY")}
				</text>

				{/* hover tooltip */}
				{hover && (
					<g>
						<rect x={tooltipX - 80} y={tooltipY} width="160" height="42" rx="6"
							fill="var(--gg-panel)" stroke="var(--gg-border)" strokeWidth="0.8" />
						<text x={tooltipX} y={tooltipY + 16} textAnchor="middle"
							fontSize="12" fontFamily="var(--gg-font)" fill="var(--gg-accent)" fontWeight={600}>
							{hover.score.toLocaleString()} pts
						</text>
						<text x={tooltipX} y={tooltipY + 32} textAnchor="middle"
							fontSize="9" fontFamily="var(--gg-font)" fill="var(--gg-muted)">
							{hover.map} · {new Date(hover.at * 1000).toLocaleString()}
						</text>
					</g>
				)}
			</svg>
		</div>
	);
}

function accuracyClass(pct: number): string {
	if (pct >= 90) return "gg-acc--green";
	if (pct >= 75) return "gg-acc--yellow";
	if (pct >= 50) return "gg-acc--orange";
	return "gg-acc--red";
}

function ReplayEntry({ session, onReplay, onDelete }: {
	session: GameSession;
	onReplay: () => void;
	onDelete: () => void;
}) {
	const { t } = useT();
	return (
		<div className="gg-analytics__row gg-analytics__row--game">
			<span className="gg-analytics__name">{session.mapName}</span>
			<span className="gg-analytics__meta">
				{session.totalScore.toLocaleString()} · {session.config.movementMode} · {session.rounds.length}r
				{session.rounds[0]?.distanceMeters != null
					? ` · ${formatDistance(session.rounds[0].distanceMeters)}` : ""}
			</span>
			<div className="gg-analytics__row-actions">
				<button type="button" className="gg-analytics__replay" onClick={onReplay}>
					{t("plugin.geoguessrGame.replay")}</button>
				<button type="button" className="gg-analytics__delete" onClick={onDelete}>×</button>
			</div>
		</div>
	);
}

export function AnalyticsPage({
	mapId,
	onBack,
	onReplaySession,
}: {
	mapId?: string | null;
	onBack: () => void;
	onReplaySession?: (session: GameSession) => void;
}) {
	const { t } = useT();
	const [filterMap, setFilterMap] = useState(false);
	const [version, setVersion] = useState(0);
	const data = useMemo(
		() => computeAnalytics(filterMap ? mapId : null),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- manual recompute trigger after delete/clear
		[filterMap, mapId, version],
	);

	const handleReplay = useCallback((s: GameSession) => {
		onReplaySession?.(s);
	}, [onReplaySession]);

	if (data.overview.gamesPlayed === 0) {
		return (
			<div className="gg-analytics">
				<header className="gg-analytics__header">
					<h2>{t("plugin.geoguessrGame.analytics")}</h2>
					<Button variant="ghost" onClick={onBack}>{t("common.back")}</Button>
				</header>
				<EmptyState icon={mdiChartBoxOutline}>{t("plugin.geoguessrGame.noGamesYet")}</EmptyState>
			</div>
		);
	}

	const o = data.overview;

	return (
		<div className="gg-analytics">
			<header className="gg-analytics__header">
				<div>
					<h2>{t("plugin.geoguessrGame.analytics")}</h2>
					<p className="gg-analytics__sub">{t("plugin.geoguessrGame.analyticsSub")}</p>
				</div>
				<div className="gg-analytics__header-actions">
					{mapId && (
						<label className="gg-analytics__filter">
							<Checkbox checked={filterMap} onChange={(e) => setFilterMap(e.target.checked)} />
							{t("plugin.geoguessrGame.filterCurrentMap")}
						</label>
					)}
					<Button variant="ghost" onClick={onBack}>{t("common.back")}</Button>
				</div>
			</header>

			<div className="gg-analytics__cards">
				<div className="gg-analytics__card">
					<span className="gg-analytics__card-label">{t("plugin.geoguessrGame.gamesPlayed")}</span>
					<span className="gg-analytics__card-value">{o.gamesPlayed}</span>
				</div>
				<div className="gg-analytics__card">
					<span className="gg-analytics__card-label">{t("plugin.geoguessrGame.avgScore")}</span>
					<span className="gg-analytics__card-value">{o.averageScore.toLocaleString()}</span>
				</div>
				<div className="gg-analytics__card">
					<span className="gg-analytics__card-label">{t("plugin.geoguessrGame.bestScore")}</span>
					<span className="gg-analytics__card-value">{o.bestScore.toLocaleString()}</span>
				</div>
				<div className="gg-analytics__card">
					<span className="gg-analytics__card-label">{t("plugin.geoguessrGame.bestStreak")}</span>
					<span className="gg-analytics__card-value">{o.bestStreak}</span>
				</div>
				<div className="gg-analytics__card">
					<span className="gg-analytics__card-label">{t("plugin.geoguessrGame.perfectRounds")}</span>
					<span className="gg-analytics__card-value">{o.perfectRounds}</span>
				</div>
				<div className="gg-analytics__card">
					<span className="gg-analytics__card-label">{t("plugin.geoguessrGame.totalRounds")}</span>
					<span className="gg-analytics__card-value">{o.totalRounds}</span>
				</div>
			</div>

			<section className="gg-analytics__section">
				<h3>{t("plugin.geoguessrGame.scoreTrend")}</h3>
				<ScoreTrendChart points={data.scoreTrend} t={t} />
			</section>

			<section className="gg-analytics__section">
				<h3>{t("plugin.geoguessrGame.byCountry")}</h3>
				<div className="gg-analytics__list">
					{data.byCountry.slice(0, 40).map((c) => (
						<div key={c.countryCode} className="gg-analytics__row">
							<span className="gg-analytics__flag" dangerouslySetInnerHTML={{ __html: countryFlagHtml(c.countryCode) || c.countryCode }} />
							<span className="gg-analytics__name">{c.countryName}</span>
							<span className={`gg-analytics__acc ${accuracyClass(c.accuracy)}`}>{c.accuracy}%</span>
							<span className="gg-analytics__meta">{c.rounds} · avg {c.avgScore}</span>
						</div>
					))}
				</div>
			</section>

			<section className="gg-analytics__section">
				<h3>{t("plugin.geoguessrGame.byProvider")}</h3>
				<div className="gg-analytics__list">
					{data.byProvider.map((p) => (
						<div key={p.provider} className="gg-analytics__row">
							<span className="gg-analytics__name gg-analytics__provider">{p.provider}</span>
							<span className="gg-analytics__meta">{p.rounds} rounds · avg {p.avgScore.toLocaleString()}</span>
						</div>
					))}
				</div>
			</section>

			<section className="gg-analytics__section">
				<h3>{t("plugin.geoguessrGame.byMap")}</h3>
				<div className="gg-analytics__list">
					{data.byMap.map((m) => (
						<div key={m.mapId} className="gg-analytics__row">
							<span className="gg-analytics__name">{m.mapName}</span>
							<span className="gg-analytics__meta">
								{m.games} games · avg {m.avgScore.toLocaleString()} · best {m.bestScore.toLocaleString()}
							</span>
						</div>
					))}
				</div>
			</section>

			<section className="gg-analytics__section">
				<h3>{t("plugin.geoguessrGame.recentGames")}</h3>
				<div className="gg-analytics__list">
					{data.recent.map((s) => (
						<ReplayEntry
							key={s.id}
							session={s}
							onReplay={() => handleReplay(s)}
							onDelete={() => { deleteSession(s.id); setVersion((n) => n + 1); }}
						/>
					))}
				</div>
			</section>

			<div className="gg-analytics__footer">
				<Button variant="destructive" onClick={() => { clearSessions(); setVersion((n) => n + 1); }}>
					{t("plugin.geoguessrGame.clearHistory")}
				</Button>
			</div>
		</div>
	);
}
