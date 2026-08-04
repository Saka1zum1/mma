import { Icon } from "@/components/primitives/Icon";
import { Tooltip } from "@/components/primitives/Tooltip";
import { mdiHome, mdiFlagOutline, mdiFlagCheckered, mdiCompass, mdiCar, mdiCarOff } from "@mdi/js";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/store/settings";
import { CompassControl, CompassTape } from "@/components/editor/location/PanoControls";
import type { MovementMode } from "./GameState";
import type { GamePanoHandle } from "./GamePanoView";

type StreetViewPanorama = NonNullable<ReturnType<GamePanoHandle["getPanorama"]>>;

export function GameControls({
	panorama,
	panoRef,
	movementMode,
	hideCar,
	onToggleHideCar,
}: {
	panorama: StreetViewPanorama | null;
	panoRef: React.RefObject<GamePanoHandle | null>;
	movementMode: MovementMode;
	hideCar?: boolean;
	onToggleHideCar?: () => void;
}) {
	const { t } = useT();
	const canMove = movementMode === "moving";
	const { showCompass, showCompassTape } = useSettings();

	return (
		<div className="gg-controls">
			{panorama && showCompass && (
				<div className="gg-controls__compass gg-compass-control-host">
					<CompassControl panorama={panorama} />
				</div>
			)}
			{panorama && showCompassTape && (
				<div className="gg-pano-compass">
					<CompassTape panorama={panorama} />
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
					</>
				)}
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
