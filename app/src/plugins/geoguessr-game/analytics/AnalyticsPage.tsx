import { useMemo, useState } from "react";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";
import { EmptyState } from "@/components/primitives/Sidebar";
import { useT } from "@/lib/i18n";
import { mdiChartBoxOutline } from "@mdi/js";
import { computeAnalytics } from "./analyticsStore";
import { clearSessions, deleteSession } from "../gameSessionStore";
import { formatDistance } from "../ScoreUtils";
import { countryFlagHtml } from "../GameState";

function ScoreTrendChart({
	points,
	t,
}: {
	points: { at: number; score: number; mapName: string }[];
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	t: (...args: any[]) => string;
}) {
	if (points.length < 2) {
		return <div className="gg-analytics__chart-empty">—</div>;
	}

	const w = 440;
	const h = 160;
	const padLeft = 50;
	const padRight = 16;
	const padTop = 16;
	const padBottom = 30;
	const plotW = w - padLeft - padRight;
	const plotH = h - padTop - padBottom;
	const maxScore = Math.max(...points.map((p) => p.score), 1);

	// Compute time span to decide format
	const firstAt = points[0].at;
	const lastAt = points[points.length - 1].at;
	const spanMs = lastAt - firstAt;
	const isHours = spanMs < 7 * 24 * 3600 * 1000; // < 1 week → hours

	// Y-axis ticks (score)
	const yTickCount = 4;
	const yTicks: { y: number; label: string }[] = [];
	for (let i = 0; i <= yTickCount; i++) {
		const val = Math.round((maxScore / yTickCount) * i);
		if (val === 0 && i > 0) continue; // skip zero when max is small
		const y = padTop + plotH - (val / maxScore) * plotH;
		yTicks.push({ y, label: val.toLocaleString() });
	}

	// X-axis ticks (time)
	const xTickCount = Math.min(5, points.length);
	const xTicks: { x: number; label: string }[] = [];
	for (let i = 0; i < xTickCount; i++) {
		const idx = Math.round((i / (xTickCount - 1)) * (points.length - 1));
		const ts = points[idx].at * 1000; // seconds → ms
		const d = new Date(ts);
		let label: string;
		if (isHours) {
			label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
		} else {
			label = `${d.getMonth() + 1}/${d.getDate()}`;
		}
		const x = padLeft + (idx / (points.length - 1)) * plotW;
		xTicks.push({ x, label });
	}

	// Polyline coords
	const coords = points
		.map((p, i) => {
			const x = padLeft + (i / (points.length - 1)) * plotW;
			const y = padTop + plotH - (p.score / maxScore) * plotH;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg className="gg-analytics__chart" viewBox={`0 0 ${w} ${h}`}>
			{/* Grid lines */}
			{yTicks.map((tk) => (
				<line
					key={`yg-${tk.y}`}
					x1={padLeft}
					y1={tk.y}
					x2={w - padRight}
					y2={tk.y}
					stroke="var(--gg-border)"
					strokeDasharray="3,3"
				/>
			))}

			{/* Area fill */}
			<polygon
				fill="var(--gg-accent)"
				fillOpacity="0.1"
				points={`${padLeft},${padTop + plotH} ${coords} ${padLeft + plotW},${padTop + plotH}`}
			/>

			{/* Line */}
			<polyline
				fill="none"
				stroke="var(--gg-accent)"
				strokeWidth="2"
				points={coords}
			/>

			{/* Score dots */}
			{points.map((p, i) => {
				const x = padLeft + (i / (points.length - 1)) * plotW;
				const y = padTop + plotH - (p.score / maxScore) * plotH;
				return <circle key={`pt-${i}`} cx={x} cy={y} r="3" fill="var(--gg-accent)" />;
			})}

			{/* Y-axis labels */}
			{yTicks.map((tk) => (
				<text
					key={`yl-${tk.y}`}
					x={padLeft - 6}
					y={tk.y + 4}
					textAnchor="end"
					fontSize="9"
					fill="var(--gg-muted)"
				>
					{tk.label}
				</text>
			))}

			{/* X-axis labels */}
			{xTicks.map((tk, i) => (
				<text
					key={`xl-${i}`}
					x={tk.x}
					y={h - 4}
					textAnchor="middle"
					fontSize="9"
					fill="var(--gg-muted)"
				>
					{tk.label}
				</text>
			))}

			{/* Axis labels */}
			<text x={w / 2} y={h - 12} textAnchor="middle" fontSize="10" fill="var(--gg-muted)">
				{t("plugin.geoguessrGame.scoreTimeX")}
			</text>
			<text
				x={12}
				y={h / 2}
				textAnchor="middle"
				fontSize="10"
				fill="var(--gg-muted)"
				transform={`rotate(-90, 12, ${h / 2})`}
			>
				{t("plugin.geoguessrGame.scoreTimeY")}
			</text>
		</svg>
	);
}

function accuracyClass(pct: number): string {
	if (pct >= 90) return "gg-acc--green";
	if (pct >= 75) return "gg-acc--yellow";
	if (pct >= 50) return "gg-acc--orange";
	return "gg-acc--red";
}

export function AnalyticsPage({
	mapId,
	onBack,
}: {
	mapId?: string | null;
	onBack: () => void;
}) {
	const { t } = useT();
	const [filterMap, setFilterMap] = useState(false);
	const [version, setVersion] = useState(0);
	const data = useMemo(
		() => computeAnalytics(filterMap ? mapId : null),
		// version bumps force recompute after mutations
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[filterMap, mapId, version],
	);

	if (data.overview.gamesPlayed === 0) {
		return (
			<div className="gg-analytics">
				<header className="gg-analytics__header">
					<h2>{t("plugin.geoguessrGame.analytics")}</h2>
					<Button variant="ghost" onClick={onBack}>
						{t("common.back")}
					</Button>
				</header>
				<EmptyState icon={mdiChartBoxOutline}>
					{t("plugin.geoguessrGame.noGamesYet")}
				</EmptyState>
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
							<Checkbox
								checked={filterMap}
								onChange={(e) => setFilterMap(e.target.checked)}
							/>
							{t("plugin.geoguessrGame.filterCurrentMap")}
						</label>
					)}
					<Button variant="ghost" onClick={onBack}>
						{t("common.back")}
					</Button>
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
							<span
								className="gg-analytics__flag"
								dangerouslySetInnerHTML={{ __html: countryFlagHtml(c.countryCode) || c.countryCode }}
							/>
							<span className="gg-analytics__name">{c.countryName}</span>
							<span className={`gg-analytics__acc ${accuracyClass(c.accuracy)}`}>
								{c.accuracy}%
							</span>
							<span className="gg-analytics__meta">
								{c.rounds} · avg {c.avgScore}
							</span>
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
								{m.games} games · avg {m.avgScore.toLocaleString()} · best{" "}
								{m.bestScore.toLocaleString()}
							</span>
						</div>
					))}
				</div>
			</section>

			<section className="gg-analytics__section">
				<h3>{t("plugin.geoguessrGame.recentGames")}</h3>
				<div className="gg-analytics__list">
					{data.recent.map((s) => (
						<div key={s.id} className="gg-analytics__row gg-analytics__row--game">
							<span className="gg-analytics__name">{s.mapName}</span>
							<span className="gg-analytics__meta">
								{s.totalScore.toLocaleString()} · {s.config.movementMode} ·{" "}
								{s.rounds.length}r
								{s.rounds[0]?.distanceMeters != null
									? ` · ${formatDistance(s.rounds[0].distanceMeters)}`
									: ""}
							</span>
							<button
								type="button"
								className="gg-analytics__delete"
								onClick={() => {
									deleteSession(s.id);
									setVersion((n) => n + 1);
								}}
							>
								×
							</button>
						</div>
					))}
				</div>
			</section>

			<div className="gg-analytics__footer">
				<Button
					variant="destructive"
					onClick={() => {
						clearSessions();
						setVersion((n) => n + 1);
					}}
				>
					{t("plugin.geoguessrGame.clearHistory")}
				</Button>
			</div>
		</div>
	);
}
