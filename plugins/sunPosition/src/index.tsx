import { useEffect, useState } from "react";
import { LineLayer } from "@deck.gl/layers";
import SunCalc from "suncalc";
import type { DeckOverlayHandle, ExtraFieldDef, Location, RGB } from "mma-plugin-types";

const DEG = 180 / Math.PI;
const RAY_LIMIT = 8000;
const EARTH_RADIUS_KM = 6371;

const FIELDS: Record<string, ExtraFieldDef> = {
	sunAzimuth: {
		type: "number",
		label: MMA.t("Sun azimuth"),
		comparison: { type: "circular", period: 360 },
	},
	sunAltitude: { type: "number", label: MMA.t("Sun altitude") },
};

function computeSun(lat: number, lng: number, unixSeconds: number) {
	const pos = SunCalc.getPosition(new Date(unixSeconds * 1000), lat, lng);
	const azimuth = ((pos.azimuth * DEG + 180) % 360 + 360) % 360;
	const altitude = pos.altitude * DEG;
	return {
		azimuth: Math.round(azimuth * 100) / 100,
		altitude: Math.round(altitude * 100) / 100,
	};
}

async function enrich(
	locations: Location[],
	enrichFields: string[] | null,
): Promise<Map<number, Record<string, unknown>>> {
	const patches = new Map<number, Record<string, unknown>>();
	for (const loc of locations) {
		const dt = loc.extra?.datetime;
		if (typeof dt !== "number") continue;
		if (enrichFields && !enrichFields.some((k) => k === "sunAzimuth" || k === "sunAltitude")) continue;

		const sun = computeSun(loc.lat, loc.lng, dt);
		const patch: Record<string, unknown> = {};
		if (!enrichFields || enrichFields.includes("sunAzimuth")) patch.sunAzimuth = sun.azimuth;
		if (!enrichFields || enrichFields.includes("sunAltitude")) patch.sunAltitude = sun.altitude;
		patches.set(loc.id, patch);
	}
	return patches;
}

interface OverlaySettings {
	visible: boolean;
	lengthKm: number;
	width: number;
	color: RGB;
}

const DEFAULT_OVERLAY: OverlaySettings = {
	visible: true,
	lengthKm: 2,
	width: 2,
	color: { r: 255, g: 196, b: 64 },
};

const overlayStore = MMA.storage("sunPosition");

function loadOverlay(): OverlaySettings {
	const stored = overlayStore.get<Partial<OverlaySettings>>("overlay") ?? {};
	const color = stored.color;
	return {
		...DEFAULT_OVERLAY,
		...stored,
		color:
			color && Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b)
				? color
				: DEFAULT_OVERLAY.color,
		lengthKm:
			typeof stored.lengthKm === "number" && stored.lengthKm > 0
				? stored.lengthKm
				: DEFAULT_OVERLAY.lengthKm,
		width:
			typeof stored.width === "number" && stored.width > 0 ? stored.width : DEFAULT_OVERLAY.width,
		visible: stored.visible !== false,
	};
}

let overlaySettings = loadOverlay();
let overlayHandle: DeckOverlayHandle | null = null;
let rebuildToken = 0;
const settingsListeners = new Set<() => void>();

function getOverlaySettings(): OverlaySettings {
	return overlaySettings;
}

function setOverlaySettings(patch: Partial<OverlaySettings>) {
	overlaySettings = { ...overlaySettings, ...patch };
	overlayStore.set("overlay", overlaySettings);
	for (const fn of settingsListeners) fn();
	void rebuildRays();
}

function destination(lat: number, lng: number, bearingDeg: number, km: number): [number, number] {
	const δ = km / EARTH_RADIUS_KM;
	const θ = (bearingDeg * Math.PI) / 180;
	const φ1 = (lat * Math.PI) / 180;
	const λ1 = (lng * Math.PI) / 180;
	const sinφ1 = Math.sin(φ1);
	const cosφ1 = Math.cos(φ1);
	const sinδ = Math.sin(δ);
	const cosδ = Math.cos(δ);
	const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
	const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
	return [(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI];
}

type Ray = { path: [number, number][] };

async function rebuildRays() {
	if (!overlayHandle) return;
	const token = ++rebuildToken;
	if (!overlaySettings.visible) {
		overlayHandle.setProps({ layers: [] });
		return;
	}

	let locs: Location[] = [];
	try {
		locs = await MMA.fetchLocations({
			type: "Filter",
			field: "sunAzimuth",
			op: "has",
			value: true,
		});
	} catch {
		if (token === rebuildToken && overlayHandle) overlayHandle.setProps({ layers: [] });
		return;
	}
	if (token !== rebuildToken || !overlayHandle) return;

	const { lengthKm, width, color } = overlaySettings;
	const rgba: [number, number, number, number] = [color.r, color.g, color.b, 220];
	const data: Ray[] = [];
	for (const loc of locs) {
		if (data.length >= RAY_LIMIT) break;
		const azimuth = loc.extra?.sunAzimuth;
		const altitude = loc.extra?.sunAltitude;
		if (typeof azimuth !== "number" || !Number.isFinite(azimuth)) continue;
		if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
		const altRad =
			typeof altitude === "number" && Number.isFinite(altitude) ? (altitude * Math.PI) / 180 : 0;
		const km = lengthKm * Math.max(0.15, Math.cos(altRad));
		const dest = destination(loc.lat, loc.lng, azimuth, km);
		if (!Number.isFinite(dest[0]) || !Number.isFinite(dest[1])) continue;
		data.push({ path: [[loc.lng, loc.lat], dest] });
	}

	overlayHandle.setProps({
		layers: [
			new LineLayer<Ray>({
				id: "mma-sun-rays",
				data,
				getSourcePosition: (d) => d.path[0],
				getTargetPosition: (d) => d.path[1],
				getColor: rgba,
				getWidth: width,
				widthMinPixels: 1,
				widthUnits: "pixels",
				pickable: false,
			}),
		],
	});
}

function attachOverlay(host: { createDeckOverlay: () => DeckOverlayHandle }): () => void {
	overlayHandle = host.createDeckOverlay();
	void rebuildRays();
	const onChange = () => {
		void rebuildRays();
	};
	const events = [
		"location:add",
		"location:remove",
		"location:update",
		"location:invalidate",
		"scene:changed",
	] as const;
	const unsubs = events.map((e) => MMA.on(e, onChange));
	return () => {
		unsubs.forEach((u) => u());
		overlayHandle?.finalize();
		overlayHandle = null;
	};
}

const { Sidebar, Section, Field, SwitchRow, ColorPicker, Slider } = MMA.ui;

function OverlaySidebar({ onClose }: { onClose: () => void }) {
	const [settings, setSettings] = useState(getOverlaySettings);
	useEffect(() => {
		const sync = () => setSettings(getOverlaySettings());
		settingsListeners.add(sync);
		return () => {
			settingsListeners.delete(sync);
		};
	}, []);

	return (
		<Sidebar title={MMA.t("Sun Position")} onBack={onClose}>
			<Section title={MMA.t("Sun rays")}>
				<SwitchRow
					label={MMA.t("Show rays")}
					checked={settings.visible}
					onChange={(visible) => setOverlaySettings({ visible })}
				/>
				<Field label={MMA.t("Ray length")} row>
					<Slider
						type="range"
						min={0.2}
						max={20}
						step={0.2}
						value={settings.lengthKm}
						onChange={(e) => setOverlaySettings({ lengthKm: Number(e.currentTarget.value) })}
					/>
				</Field>
				<Field label={MMA.t("Ray width")} row>
					<Slider
						type="range"
						min={1}
						max={8}
						step={0.5}
						value={settings.width}
						onChange={(e) => setOverlaySettings({ width: Number(e.currentTarget.value) })}
					/>
				</Field>
				<Field label={MMA.t("Ray color")} row>
					<ColorPicker
						color={settings.color}
						onChange={(color) => setOverlaySettings({ color })}
						ariaLabel={MMA.t("Ray color")}
					/>
				</Field>
			</Section>
		</Sidebar>
	);
}

MMA.registerPlugin({
	activate() {
		MMA.registerEnrichFields([
			{ key: "sunAzimuth", label: MMA.t("Sun azimuth") },
			{ key: "sunAltitude", label: MMA.t("Sun altitude") },
		]);
		MMA.registerEnrichmentProvider({
			id: "sunPosition",
			enrich,
			fieldDefs: FIELDS,
			requires: ["datetime"],
		});

		let cancelled = false;
		let overlayTeardown: (() => void) | null = null;

		const stopOverlay = () => {
			overlayTeardown?.();
			overlayTeardown = null;
		};
		const startOverlay = () => {
			if (cancelled) return;
			const host = MMA.getMapHost();
			if (!host) return;
			stopOverlay();
			overlayTeardown = attachOverlay(host);
		};

		const unsubs = [MMA.on("map:open", startOverlay), MMA.on("map:close", stopOverlay)];
		startOverlay();
		if (!MMA.getMapHost()) {
			void MMA.waitForMapHost().then(() => {
				if (!cancelled) startOverlay();
			});
		}

		return () => {
			cancelled = true;
			unsubs.forEach((u) => u());
			stopOverlay();
		};
	},
	sidebar: OverlaySidebar,
});
