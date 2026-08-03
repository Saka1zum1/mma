import { useEffect, useRef } from "react";
import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import { mdiHome, mdiFlagOutline, mdiFlagCheckered, mdiCompass, mdiCar, mdiCarOff } from "@mdi/js";
import { google } from "@/lib/sv/opensv";
import { useT } from "@/lib/i18n";
import type { MovementMode } from "./GameState";
import type { GamePanoHandle } from "./GamePanoView";

function Compass({ panorama }: { panorama: google.maps.StreetViewPanorama }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const update = () => {
			ref.current?.style.setProperty("--heading", `${(-panorama.getPov().heading).toFixed(2)}deg`);
		};
		const listener = panorama.addListener("pov_changed", update);
		update();
		return () => {
			google?.maps?.event?.removeListener(listener);
		};
	}, [panorama]);
	return (
		<div ref={ref} className="compass gg-compass">
			<svg className="compass__arrow" viewBox="0 0 40 100">
				<path fill="#C1272D" d="M10 50l10-32 10 32z" />
				<path fill="#D1D1D1" d="M30 50L20 82 10 50z" />
			</svg>
		</div>
	);
}

export function GameControls({
	panorama,
	panoRef,
	movementMode,
	hideCar,
	onToggleHideCar,
}: {
	panorama: google.maps.StreetViewPanorama | null;
	panoRef: React.RefObject<GamePanoHandle | null>;
	movementMode: MovementMode;
	hideCar?: boolean;
	onToggleHideCar?: () => void;
}) {
	const { t } = useT();
	const canMove = movementMode === "moving";

	return (
		<div className="gg-controls">
			{panorama && (
				<div className="gg-controls__compass">
					<Compass panorama={panorama} />
				</div>
			)}

			<div className="gg-controls__actions">
				{canMove && (
					<>
						<Tooltip content={t("plugin.geoguessrGame.checkpoint")} side="right">
							<button
								type="button"
								className="gg-controls__btn"
								onClick={() => panoRef.current?.setCheckpoint()}
								aria-label={t("plugin.geoguessrGame.checkpoint")}
							>
								<Icon path={mdiFlagOutline} />
							</button>
						</Tooltip>
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
					</>
				)}
				<Tooltip content={t("plugin.geoguessrGame.returnToSpawn")} side="right">
					<button
						type="button"
						className="gg-controls__btn"
						onClick={() => panoRef.current?.returnToSpawn()}
						aria-label={t("plugin.geoguessrGame.returnToSpawn")}
					>
						<Icon path={mdiHome} />
					</button>
				</Tooltip>
				{panorama && (
					<Tooltip content={hideCar ? "Show car" : "Hide car"} side="right">
						<button
							type="button"
							className={`gg-controls__btn${hideCar ? " gg-controls__btn--active" : ""}`}
							onClick={onToggleHideCar}
							aria-label={hideCar ? "Show car" : "Hide car"}
						>
							<Icon path={hideCar ? mdiCarOff : mdiCar} />
						</button>
					</Tooltip>
				)}
				{!panorama && (
					<span className="gg-controls__btn gg-controls__btn--ghost" aria-hidden>
						<Icon path={mdiCompass} />
					</span>
				)}
			</div>
		</div>
	);
}
