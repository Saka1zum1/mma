import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/primitives/Button";
import { Icon } from "@/components/primitives/Icon";
import { mdiClose, mdiHome, mdiFlagCheckered, mdiCar, mdiCarOff, mdiFlagPlusOutline } from "@mdi/js";
import { Tooltip } from "@/components/primitives/Tooltip";
import { useT } from "@/lib/i18n";
import { getSettings, setSetting } from "@/store/settings";
import { getPanorama } from "@/lib/sv/panoSingleton";
import { google } from "@/lib/sv/opensv";
import { tweenPov } from "@/lib/sv/tweenPov";
import { sendHideCar, CompassControl, CompassTape } from "@/components/editor/location/PanoControls";
import type { LatLng } from "@/types";
import {
	currentRoundLocation,
	isLastRound,
	totalRoundsLabel,
	type ActiveGame,
	type RoundResult,
	type StreakMode,
	resolveCountryName,
} from "./GameState";
import { scoreForGuess } from "./ScoreUtils";
import { checkStreakHit, reverseGeocodePlace } from "./streakValidator";
import { GamePanoView, type GamePanoHandle } from "./GamePanoView";
import { GameTimer } from "./GameTimer";
import { GuessMap } from "./GuessMap";

import { streakResultMessage } from "./streakCopy";

function splitDistanceDisplay(meters: number | null): { value: string; unit: string } {
	if (meters == null) return { value: "—", unit: "" };
	if (meters > 1000) {
		return {
			value: Math.round(meters / 1000).toLocaleString(),
			unit: "km",
		};
	}
	return { value: Math.round(meters).toLocaleString(), unit: "m" };
}

/* ---- Round result bottom bar (GeoGuessr gameUI_2) ---- */
function RoundResultBar({
	result,
	rounds,
	streakMode,
	streak,
	stateStreak,
	isLast,
	onNext,
	onFinish,
	t,
	locale,
}: {
	result: RoundResult;
	rounds: RoundResult[];
	streakMode: StreakMode;
	streak: number;
	stateStreak: number;
	isLast: boolean;
	onNext: () => void;
	onFinish: () => void;
	t: ReturnType<typeof useT>["t"];
	locale: string;
}) {
	const dist = splitDistanceDisplay(result.distanceMeters);
	const streakMsg =
		streakMode !== "off"
			? streakResultMessage(result, rounds, streakMode, streak, stateStreak, t, locale)
			: null;

	return (
		<div className="gg-round-result__bar" data-qa="result-view-bottom">
			<div className="gg-round-result__bar-inner">
				<div className="gg-round-result__distance">
					<div className="gg-round-result__distance-value">
						<span className="gg-shadow-text gg-shadow-text--positive gg-shadow-text--md">
							{dist.value}
						</span>
						{dist.unit && (
							<span className="gg-shadow-text gg-shadow-text--positive gg-shadow-text--md">
								{dist.unit}
							</span>
						)}
					</div>
					<p className="gg-round-result__label">
						{result.distanceMeters != null
							? t("plugin.geoguessrGame.fromLocation")
							: t("plugin.geoguessrGame.noGuess")}
					</p>
				</div>

				<div className="gg-round-result__center">
					{streakMsg && <div className="gg-round-result__streak">{streakMsg}</div>}
					<div className="gg-round-result__actions">
						{isLast ? (
							<Button variant="primary" onClick={onFinish}>
								{t("plugin.geoguessrGame.viewSummary")}
							</Button>
						) : (
							<Button variant="primary" onClick={onNext}>
								{t("plugin.geoguessrGame.nextRound")}
							</Button>
						)}
						<p className="gg-round-result__space">
							{t("plugin.geoguessrGame.hitSpace")}{" "}
							<span className="gg-kbd">Space</span> {t("plugin.geoguessrGame.toContinue")}
						</p>
					</div>
				</div>

				<div className="gg-round-result__points">
					<div className="gg-shadow-text gg-shadow-text--negative gg-shadow-text--md">
						{result.score.toLocaleString()}
					</div>
					<p className="gg-round-result__label">{t("plugin.geoguessrGame.ofMaxPoints", { max: "5,000" })}</p>
				</div>
			</div>
		</div>
	);
}

export function RoundPlayer({
	active,
	onResult,
	onNext,
	onFinish,
	onAbort,
}: {
	active: ActiveGame;
	onResult: (result: RoundResult) => void;
	onNext: () => void;
	onFinish: () => void;
	onAbort: (patch?: Partial<ActiveGame>) => void;
}) {
	const { t, locale } = useT();
	const round = currentRoundLocation(active);
	const panoRef = useRef<GamePanoHandle | null>(null);
	const [panorama, setPanorama] = useState<google.maps.StreetViewPanorama | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [localGuess, setLocalGuess] = useState<LatLng | null>(null);
	const [hideCar, setHideCar] = useState(!getSettings().showCar);
	const [hideCarSupported, setHideCarSupported] = useState(true);
	const [hasCheckpoint, setHasCheckpoint] = useState(false);
	const [mapSize, setMapSize] = useState(2);
	const [sticky, setSticky] = useState(false);
	const showResult = active.phase === "result";
	const lastResult = active.rounds[active.rounds.length - 1] ?? null;
	const streakMode = active.config.streakMode;
	const streakOn = streakMode !== "off";
	const hudStreak = streakMode === "state" ? active.stateStreak : active.streak;

	const cancelTweenRef = useRef<(() => void) | null>(null);
	const sectionChange = String(active.currentRoundIndex) + (showResult ? "r" : "p");

	const applyHideCar = useCallback((hide: boolean) => {
		// Google + Baidu/Tencent inject share the Google material pipeline.
		// PSV (Apple/Yandex) must not receive NO_CAR — it corrupts their WebGL shaders.
		// Panos with zero links/neighbors are still fine; hide-car does not depend on links.
		if (panoRef.current?.supportsHideCar() ?? true) {
			sendHideCar(hide);
		} else {
			sendHideCar(false);
		}
	}, []);

	const toggleHideCar = useCallback(() => {
		const next = !hideCar;
		setHideCar(next);
		setSetting("showCar", !next);
		applyHideCar(next);
	}, [hideCar, applyHideCar]);

	useEffect(() => {
		if (!panorama) return;
		const refreshSupport = () => {
			setHideCarSupported(panoRef.current?.supportsHideCar() ?? true);
		};
		refreshSupport();
		applyHideCar(hideCar);
		const statusListener = panorama.addListener("status_changed", () => {
			// Baidu inject may report OK with empty getLinks() — still re-apply hide-car.
			if (panorama.getStatus() !== "OK") return;
			refreshSupport();
			applyHideCar(hideCar);
		});
		const panoListener = panorama.addListener("pano_changed", () => {
			refreshSupport();
			applyHideCar(hideCar);
		});
		return () => {
			google?.maps?.event?.removeListener(statusListener);
			google?.maps?.event?.removeListener(panoListener);
		};
	}, [panorama, hideCar, applyHideCar, round?.id]);

	useEffect(() => {
		return () => {
			sendHideCar(false);
		};
	}, []);

	useEffect(() => {
		setLocalGuess(null);
		setSubmitting(false);
		setSticky(false);
		setHasCheckpoint(false);
	}, [sectionChange]);

	const submitGuess = useCallback(
		async (guess: LatLng | null) => {
			if (!round || submitting || showResult) return;
			setSubmitting(true);
			try {
				const { distanceMeters, score } = scoreForGuess(
					guess,
					{ lat: round.lat, lng: round.lng },
					active.maxErrorDistance,
				);

				const [truthPlace, guessPlace] = await Promise.all([
					reverseGeocodePlace(round.lat, round.lng, active.config.geocodeBackend, locale),
					guess
						? reverseGeocodePlace(guess.lat, guess.lng, active.config.geocodeBackend, locale)
						: Promise.resolve(null),
				]);

				const streakResult = checkStreakHit(streakMode, truthPlace, guessPlace);
				const countryName = resolveCountryName(
					truthPlace?.countryCode ?? null,
					truthPlace?.countryName ?? null,
					locale,
				);
				const guessCountryName = guessPlace
					? resolveCountryName(guessPlace.countryCode, guessPlace.countryName, locale)
					: null;

				const result: RoundResult = {
					location: round,
					guess,
					distanceMeters,
					score,
					countryCode: truthPlace?.countryCode ?? null,
					countryName,
					admin: truthPlace?.admin ?? null,
					guessCountryCode: guessPlace?.countryCode ?? null,
					guessCountryName,
					guessAdmin: guessPlace?.admin ?? null,
					streakHit: streakMode === "country" ? streakResult.country : null,
					stateStreakHit: streakMode === "state" ? streakResult.state : null,
					elapsedMs: Date.now() - active.roundStartedAt,
				};
				onResult(result);
			} finally {
				setSubmitting(false);
			}
		},
		[round, submitting, showResult, active, onResult, streakMode],
	);

	/* ---- Keyboard shortcuts ---- */
	useEffect(() => {
		let isRepeated = false;
		function handleKeyDown(e: KeyboardEvent) {
			if (isRepeated) { isRepeated = false; return; }
			if (e.repeat) return;
			const target = e.target as HTMLElement;
			if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

			if (e.code === "Space") {
				e.preventDefault();
				if (showResult) {
					if (isLastRound(active) && active.config.roundMode === "classic") {
						onFinish();
					} else {
						onNext();
					}
				} else {
					void submitGuess(localGuess);
				}
				return;
			}
			if (e.key === "n" || e.key === "N") {
				e.preventDefault();
				const pano = panoRef.current?.getPanorama() ?? getPanorama();
				if (!pano) return;
				cancelTweenRef.current?.();
				const h = pano.getPov().heading;
				if (Math.abs(h) < 1 && Math.abs(pano.getPov().pitch) < 1) {
					cancelTweenRef.current = tweenPov(pano, { heading: 0, pitch: -90 });
				} else {
					cancelTweenRef.current = tweenPov(pano, { heading: 0, pitch: 0 });
				}
			}
			if (e.key === "h" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				toggleHideCar();
			}
		}
		function onKeyDown(e: KeyboardEvent) { handleKeyDown(e); }
		function onKeyUp() { isRepeated = false; }
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("keyup", onKeyUp);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("keyup", onKeyUp);
		};
	}, [showResult, active, localGuess, submitGuess, onNext, onFinish, toggleHideCar]);

	const hidePano = active.config.movementMode === "nmpz" && !showResult;

	if (!round) return null;

	const truth: LatLng | null = showResult ? { lat: round.lat, lng: round.lng } : null;
	const displayGuess = showResult ? (lastResult?.guess ?? localGuess) : localGuess;
	const cumScore = active.rounds.reduce((s, r) => s + r.score, 0);

	return (
		<div className={`gg-round${showResult ? " gg-round--result" : ""}`}>
			{!hidePano && !showResult && (
				<div className="gg-pano-wrap">
					<GamePanoView
						ref={panoRef}
						round={round}
						movementMode={active.config.movementMode}
						onPanorama={setPanorama}
					/>
					{panorama && (
						<div className="gg-pano-compass">
							<CompassTape panorama={panorama} />
						</div>
					)}
				</div>
			)}
			{hidePano && (
				<div className="gg-round__nmpz">
					<div className="gg-round__nmpz-msg">{t("plugin.geoguessrGame.nmpzHint")}</div>
				</div>
			)}

			<header className="gg-round__top">
				<div className="gg-status">
					<div className="gg-status__inner">
						<div className="gg-status__item">
							<div className="gg-status__label">{t("plugin.geoguessrGame.statusMap")}</div>
							<div className="gg-status__value">{active.mapName}</div>
						</div>
						<div className="gg-status__item">
							<div className="gg-status__label">{t("plugin.geoguessrGame.statusRound")}</div>
							<div className="gg-status__value">
								{active.currentRoundIndex + 1}
								<span className="gg-status__slash">/</span>
								{totalRoundsLabel(active)}
							</div>
						</div>
						<div className="gg-status__item">
							<div className="gg-status__label">{t("plugin.geoguessrGame.stausScore")}</div>
							<div className="gg-status__value">{cumScore.toLocaleString()}</div>
						</div>
						{streakOn && (
							<div className="gg-status__item">
								<div className="gg-status__label">{t("plugin.geoguessrGame.streakShort")}</div>
								<div className="gg-status__value">{hudStreak}</div>
							</div>
						)}
						{active.config.timerMode !== "off" && !showResult && (
							<div className="gg-status__item gg-status__item--timer">
								<div className="gg-status__label">{t("plugin.geoguessrGame.timerShort")}</div>
								<div className="gg-status__value">
									<GameTimer
										embedded
										mode={active.config.timerMode}
										timeLimit={active.config.timeLimit}
										startedAt={active.roundStartedAt}
										running={!showResult && !submitting}
										onExpire={() => void submitGuess(localGuess)}
									/>
								</div>
							</div>
						)}
					</div>
				</div>
			</header>

			<button
				type="button"
				className="gg-round__close"
				onClick={() => onAbort({ guess: localGuess ?? active.guess })}
				aria-label={t("common.close")}
			>
				<Icon path={mdiClose} />
			</button>

			{!showResult && (
				<div className="gg-controls">
					{panorama && (
						<div className="gg-controls__compass gg-compass-control-host">
							<CompassControl panorama={panorama} />
						</div>
					)}
					<div className="gg-controls__col">
						{active.config.movementMode === "moving" && (
							<>
								<Tooltip content={t("plugin.geoguessrGame.checkpoint")} side="right">
									<button
										type="button"
										className="gg-controls__btn"
										onClick={() => {
											panoRef.current?.setCheckpoint();
											setHasCheckpoint(true);
										}}
										aria-label={t("plugin.geoguessrGame.checkpoint")}
									>
										<Icon path={mdiFlagPlusOutline} />
									</button>
								</Tooltip>
								{hasCheckpoint && (
									<Tooltip content={t("plugin.geoguessrGame.returnCheckpoint")} side="right">
										<button
											type="button"
											className="gg-controls__btn"
											onClick={() => panoRef.current?.returnToCheckpoint()}
											aria-label={t("plugin.geoguessrGame.returnCheckpoint")}
										>
											<Icon path={mdiFlagCheckered} />
										</button>
									</Tooltip>
								)}
							</>
						)}
						<Tooltip content={t("plugin.geoguessrGame.returnToSpawn")} side="right">
							<button type="button" className="gg-controls__btn" onClick={() => panoRef.current?.returnToSpawn()} aria-label={t("plugin.geoguessrGame.returnToSpawn")}>
								<Icon path={mdiHome} />
							</button>
						</Tooltip>
						{panorama && hideCarSupported && (
							<Tooltip
								content={
									hideCar
										? t("plugin.geoguessrGame.showCar")
										: t("plugin.geoguessrGame.hideCar")
								}
								side="right"
							>
								<button
									type="button"
									className={`gg-controls__btn${hideCar ? " gg-controls__btn--active" : ""}`}
									onClick={toggleHideCar}
									aria-label={
										hideCar
											? t("plugin.geoguessrGame.showCar")
											: t("plugin.geoguessrGame.hideCar")
									}
								>
									<Icon path={hideCar ? mdiCarOff : mdiCar} />
								</button>
							</Tooltip>
						)}
					</div>
				</div>
			)}

			{!showResult && (
				<GuessMap
					variant="play"
					guess={displayGuess}
					truth={null}
					showResult={false}
					locked={false}
					mapSize={mapSize}
					sticky={sticky}
					onSizeChange={setMapSize}
					onToggleSticky={() => setSticky((v) => !v)}
					onGuess={(p) => setLocalGuess(p)}
					onSubmit={() => void submitGuess(localGuess)}
					submitting={submitting}
					hasGuess={!!localGuess}
				/>
			)}

			{showResult && lastResult && (
				<div className="gg-round-result" data-qa="result-layout">
					<div className="gg-round-result__map" data-qa="result-view-top">
						<GuessMap
							variant="result"
							guess={displayGuess}
							truth={truth}
							showResult={true}
							locked={true}
							mapSize={2}
							sticky={false}
							onSizeChange={() => {}}
							onToggleSticky={() => {}}
							onGuess={() => {}}
						/>
					</div>
					<RoundResultBar
						result={lastResult}
						rounds={active.rounds}
						streakMode={streakMode}
						streak={active.streak}
						stateStreak={active.stateStreak}
						isLast={isLastRound(active)}
						onNext={onNext}
						onFinish={onFinish}
						t={t}
						locale={locale}
					/>
				</div>
			)}
		</div>
	);
}
