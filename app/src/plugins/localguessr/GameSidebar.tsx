import { useEffect, useState } from "react";
import { Sidebar, Section, Field, SegmentedControl, EmptyState } from "@/components/primitives/Sidebar";
import { Button } from "@/components/primitives/Button";
import { Slider } from "@/components/primitives/Slider";
import { NSelect } from "@/components/primitives/NSelect";
import { usePluginState } from "@/plugins/registry";
import { useMapState } from "@/store/useMapStore";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/primitives/Icon";
import { mdiEarth, mdiPlayCircleOutline, mdiDeleteOutline } from "@mdi/js";
import {
	DEFAULT_GAME_CONFIG,
	normalizeStreakMode,
	type GameConfig,
	type GeocodeBackend,
	type MovementMode,
	type RoundMode,
	type StreakMode,
	type TimerMode,
} from "./GameState";
import { GameOverlay, useGameController } from "./GameRunner";
import { getSessions } from "./gameSessionStore";
import { deleteOngoingGame, getOngoingGames, type OngoingGameRecord } from "./ongoingGameStore";
import "./geoguessr.css";

function formatStartedAt(ms: number): string {
	try {
		return new Date(ms).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "";
	}
}

export function GameSidebar({ onClose }: { onClose: () => void }) {
	const { t } = useT();
	const [stored, setStored] = usePluginState<Partial<GameConfig>>(
		"localguessr",
		"config",
		DEFAULT_GAME_CONFIG,
	);
	const config: GameConfig = {
		...DEFAULT_GAME_CONFIG,
		...stored,
		streakMode: normalizeStreakMode(stored?.streakMode as string | undefined),
	};
	const map = useMapState((s) => s.map);
	const locationCount = useMapState((s) => s.locationCount);
	const controller = useGameController(config);
	const [ongoingGames, setOngoingGames] = useState<OngoingGameRecord[]>([]);

	const refreshOngoing = () => {
		setOngoingGames(getOngoingGames());
	};

	useEffect(() => {
		refreshOngoing();
	}, [controller.state.phase, controller.state.active?.sessionId]);

	useEffect(() => {
		controller.setConfig(config);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		config.movementMode,
		config.roundMode,
		config.classicRounds,
		config.timerMode,
		config.timeLimit,
		config.streakMode,
		config.geocodeBackend,
	]);

	const patch = (p: Partial<GameConfig>) => {
		setStored((prev) => ({ ...DEFAULT_GAME_CONFIG, ...prev, ...p }));
	};

	const inGame =
		controller.state.phase === "playing" ||
		controller.state.phase === "result" ||
		controller.state.phase === "summary" ||
		controller.state.phase === "analytics";
	const pastGames = getSessions().length;

	return (
		<>
			<Sidebar title={t("plugin.localguessr.title")} onBack={onClose} className="gg-plugin-sidebar">
				{!map ? (
					<EmptyState icon={mdiEarth}>{t("plugin.localguessr.noMapOpen")}</EmptyState>
				) : (
					<>
						<Section title={t("plugin.localguessr.mapSection")}>
							<Field label={t("plugin.localguessr.currentMap")}>
								<div className="gg-sidebar__map-name">{map.meta.name}</div>
							</Field>
							<Field label={t("plugin.localguessr.poolSize")}>
								<div>{locationCount.toLocaleString()}</div>
							</Field>
						</Section>

						<Section title={t("plugin.localguessr.ongoingGames")}>
							{ongoingGames.length === 0 ? (
								<p className="gg-sidebar__ongoing-empty">
									{t("plugin.localguessr.ongoingGamesEmpty")}
								</p>
							) : (
								ongoingGames.map((g) => {
									const isCurrent = controller.state.active?.sessionId === g.sessionId;
									const roundsDone = g.active.rounds.length;
									const roundLabel =
										g.active.phase === "result"
											? `${roundsDone}/${g.active.locations.length}`
											: `${g.active.currentRoundIndex + 1}/${g.active.locations.length}`;
									return (
										<div
											key={g.sessionId}
											className={`gg-sidebar__ongoing-row${isCurrent ? " is-current" : ""}`}
										>
											<span className="gg-sidebar__ongoing-map" title={g.mapName}>
												{g.mapName}
											</span>
											<span className="gg-sidebar__ongoing-meta">
												<span className="gg-sidebar__ongoing-mode">{g.active.config.movementMode}</span>
												<span className="gg-sidebar__ongoing-sep">·</span>
												<span className="gg-sidebar__ongoing-rounds">{roundLabel}</span>
												<span className="gg-sidebar__ongoing-sep">·</span>
												<span className="gg-sidebar__ongoing-time">
													{formatStartedAt(g.startedAt)}
												</span>
											</span>
											<span className="gg-sidebar__ongoing-actions">
												<button
													type="button"
													className="gg-sidebar__ongoing-icon-btn"
													disabled={inGame}
													onClick={() => {
														const active = {
															...g.active,
															config: {
																...g.active.config,
																streakMode: normalizeStreakMode(
																	g.active.config.streakMode as string,
																),
															},
															gameStartedAt:
																g.active.gameStartedAt ?? g.startedAt,
														};
														controller.resumeGame(active);
													}}
													aria-label={t("plugin.localguessr.resumeGame")}
												>
													<Icon path={mdiPlayCircleOutline} size={18} />
												</button>
												<button
													type="button"
													className="gg-sidebar__ongoing-icon-btn"
													onClick={() => {
														deleteOngoingGame(g.sessionId);
														refreshOngoing();
													}}
													aria-label={t("common.delete")}
												>
													<Icon path={mdiDeleteOutline} size={18} />
												</button>
											</span>
										</div>
									);
								})
							)}
						</Section>

						<Section title={t("plugin.localguessr.modeSection")}>
							<Field label={t("plugin.localguessr.movementMode")}>
								<SegmentedControl<MovementMode>
									value={config.movementMode}
									onChange={(movementMode) => patch({ movementMode })}
									options={[
										{ value: "moving", label: "Moving" },
										{ value: "no-move", label: "No Move" },
										{ value: "nmpz", label: "NMPZ" },
									]}
								/>
							</Field>

							<Field label={t("plugin.localguessr.roundMode")}>
								<SegmentedControl<RoundMode>
									value={config.roundMode}
									onChange={(roundMode) => patch({ roundMode })}
									options={[
										{ value: "classic", label: t("plugin.localguessr.classic") },
										{ value: "infinite", label: t("plugin.localguessr.infinite") },
									]}
								/>
							</Field>

							{config.roundMode === "classic" && (
								<Field
									label={t("plugin.localguessr.rounds", {
										n: String(config.classicRounds),
									})}
								>
									<Slider
										min={1}
										max={10}
										step={1}
										value={config.classicRounds}
										onChange={(e) =>
											patch({ classicRounds: Number(e.target.value) })
										}
									/>
								</Field>
							)}
						</Section>

						<Section title={t("plugin.localguessr.timerSection")} collapsible>
							<Field label={t("plugin.localguessr.timerMode")}>
								<NSelect
									value={config.timerMode}
									onChange={(e) =>
										patch({ timerMode: e.target.value as TimerMode })
									}
								>
									<option value="off">{t("plugin.localguessr.timerOff")}</option>
									<option value="countdown">
										{t("plugin.localguessr.timerCountdown")}
									</option>
									<option value="countup">
										{t("plugin.localguessr.timerCountup")}
									</option>
								</NSelect>
							</Field>
							{config.timerMode === "countdown" && (
								<Field
									label={t("plugin.localguessr.timeLimit", {
										n: String(config.timeLimit),
									})}
								>
									<Slider
										min={15}
										max={300}
										step={5}
										value={config.timeLimit}
										onChange={(e) =>
											patch({ timeLimit: Number(e.target.value) })
										}
									/>
								</Field>
							)}
						</Section>

						<Section title={t("plugin.localguessr.streakSection")} collapsible>
							<Field label={t("plugin.localguessr.streakMode")}>
								<NSelect
									value={config.streakMode}
									onChange={(e) =>
										patch({ streakMode: e.target.value as StreakMode })
									}
								>
									<option value="off">{t("plugin.localguessr.streakOff")}</option>
									<option value="country">{t("plugin.localguessr.streakCountry")}</option>
									<option value="state">{t("plugin.localguessr.streakState")}</option>
								</NSelect>
							</Field>
							{config.streakMode !== "off" && (
								<>
									<Field label={t("plugin.localguessr.geocodeBackend")}>
										<SegmentedControl<GeocodeBackend>
											value={config.geocodeBackend}
											onChange={(geocodeBackend) => patch({ geocodeBackend })}
											options={[
												{
													value: "local",
													label: t("plugin.localguessr.geocodeLocal"),
												},
												{
													value: "nominatim",
													label: t("plugin.localguessr.geocodeNominatim"),
												},
											]}
										/>
									</Field>
								</>
							)}
						</Section>

						<div className="gg-sidebar__actions">
							<Button
								variant="primary"
								disabled={locationCount === 0 || inGame}
								onClick={() => void controller.startGame()}
							>
								{t("plugin.localguessr.start")}
							</Button>
							<Button
								variant="ghost"
								onClick={() => controller.showAnalytics()}
							>
								{t("plugin.localguessr.analytics")}
								{pastGames > 0 ? ` (${pastGames})` : ""}
							</Button>
						</div>
					</>
				)}
			</Sidebar>
			<GameOverlay controller={controller} />
		</>
	);
}
