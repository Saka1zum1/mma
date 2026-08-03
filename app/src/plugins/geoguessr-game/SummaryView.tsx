import { Button } from "@/components/primitives/Button";
import { useT } from "@/lib/i18n";
import { formatDistance } from "./ScoreUtils";
import { formatCountryLabel, type GameSession, type StreakMode } from "./GameState";

export function SummaryView({
	session,
	onPlayAgain,
	onBack,
	onAnalytics,
}: {
	session: GameSession;
	onPlayAgain: () => void;
	onBack: () => void;
	onAnalytics: () => void;
}) {
	const { t, locale } = useT();
	const maxScore = session.rounds.length * 5000;
	const pct = maxScore > 0 ? Math.round((session.totalScore / maxScore) * 100) : 0;
	const streakMode = session.config.streakMode as StreakMode;
	const streakOn = streakMode !== "off";
	const streakLabel =
		streakMode === "state"
			? t("plugin.geoguessrGame.stateStreak")
			: t("plugin.geoguessrGame.countryStreak");
	const streakValue = streakMode === "state" ? session.stateStreak : session.streak;

	return (
		<div className="gg-summary">
			<div className="gg-summary__hero">
				<div className="gg-summary__label">{t("plugin.geoguessrGame.gameOver")}</div>
				<div className="gg-summary__score">{session.totalScore.toLocaleString()}</div>
				<div className="gg-summary__sub">
					{t("plugin.geoguessrGame.scoreOf", {
						score: session.totalScore.toLocaleString(),
						max: maxScore.toLocaleString(),
						pct: String(pct),
					})}
				</div>
				{streakOn && (
					<div className="gg-summary__streak">
						{streakLabel}: {streakValue}
					</div>
				)}
				<div className="gg-summary__map">{session.mapName}</div>
			</div>

			<div className="gg-summary__rounds">
				{session.rounds.map((r, i) => (
					<div key={i} className="gg-summary__row">
						<span className="gg-summary__row-n">#{i + 1}</span>
						<span className="gg-summary__row-score">{r.score.toLocaleString()}</span>
						<span className="gg-summary__row-dist">
							{r.distanceMeters != null ? formatDistance(r.distanceMeters) : "—"}
						</span>
						<span
							className="gg-summary__row-place"
							dangerouslySetInnerHTML={{
								__html: formatCountryLabel(r.countryCode, r.countryName, r.admin, locale) || "—",
							}}
						/>
						{streakOn && streakMode === "country" && (
							<span
								className={`gg-summary__row-streak${r.streakHit ? " is-hit" : " is-miss"}`}
							>
								{t("plugin.geoguessrGame.streakSection")} {r.streakHit ? "✓" : "✗"}
							</span>
						)}
						{streakOn && streakMode === "state" && (
							<span
								className={`gg-summary__row-streak${r.stateStreakHit ? " is-hit" : " is-miss"}`}
							>
								{t("plugin.geoguessrGame.streakSection")} {r.stateStreakHit ? "✓" : "✗"}
							</span>
						)}
					</div>
				))}
			</div>

			<div className="gg-summary__actions">
				<Button variant="primary" onClick={onPlayAgain}>
					{t("plugin.geoguessrGame.playAgain")}
				</Button>
				<Button onClick={onAnalytics}>{t("plugin.geoguessrGame.analytics")}</Button>
				<Button variant="ghost" onClick={onBack}>
					{t("plugin.geoguessrGame.backToConfig")}
				</Button>
			</div>
		</div>
	);
}
