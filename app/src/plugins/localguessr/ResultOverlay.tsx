import { Button } from "@/components/primitives/Button";
import { useT } from "@/lib/i18n";
import { formatDistance } from "./ScoreUtils";
import { streakResultMessage } from "./streakCopy";
import { AddTagButton } from "./AddTagButton";
import type { RoundResult, StreakMode } from "./GameState";

export function ResultOverlay({
	result,
	rounds,
	roundIndex,
	totalRounds,
	streak,
	stateStreak,
	streakMode,
	isLast,
	onNext,
	onFinish,
}: {
	result: RoundResult;
	rounds: RoundResult[];
	roundIndex: number;
	totalRounds: string;
	streak: number;
	stateStreak: number;
	streakMode: StreakMode;
	isLast: boolean;
	onNext: () => void;
	onFinish: () => void;
}) {
	const { t, locale } = useT();
	const streakMsg =
		streakMode !== "off"
			? streakResultMessage(result, rounds, streakMode, streak, stateStreak, t, locale)
			: null;

	return (
		<div className="gg-result">
			<div className="gg-result__card">
				<div className="gg-result__round">
					{t("plugin.localguessr.roundOf", {
						n: String(roundIndex + 1),
						total: totalRounds,
					})}
				</div>
				<div className="gg-result__score">{result.score.toLocaleString()}</div>
				<div className="gg-result__meta">
					{result.distanceMeters != null
						? t("plugin.localguessr.distanceAway", {
								distance: formatDistance(result.distanceMeters),
							})
						: t("plugin.localguessr.noGuess")}
				</div>
				{streakMsg && <div className="gg-result__streak">{streakMsg}</div>}
				<div className="gg-result__actions">
					<AddTagButton locationIds={[result.location.id]} variant="result" />
					{isLast ? (
						<Button variant="primary" onClick={onFinish}>
							{t("plugin.localguessr.viewSummary")}
						</Button>
					) : (
						<Button variant="primary" onClick={onNext}>
							{t("plugin.localguessr.nextRound")} <span className="gg-kbd">␣</span>
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
