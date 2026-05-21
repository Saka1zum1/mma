import { useState, useEffect } from "react";
import type { MapSettings } from "@/types";
import { updateMapMeta } from "@/store/useMapStore";

export interface MapSettingsState {
	pointAlongRoad: boolean;
	setPointAlongRoad: (v: boolean) => void;
	preferDirection: string | null;
	setPreferDirection: (v: string | null) => void;
	preferOfficial: boolean;
	setPreferOfficial: (v: boolean) => void;
	onlyOfficial: boolean;
	setOnlyOfficial: (v: boolean) => void;
	preferHigherQuality: boolean;
	setPreferHigherQuality: (v: boolean) => void;
	defaultPanoId: boolean;
	setDefaultPanoId: (v: boolean) => void;
	enrichMetadata: boolean;
	setEnrichMetadata: (v: boolean) => void;
	enrichFields: string[] | null;
	setEnrichFields: (v: string[] | null) => void;
}

export function useMapSettings(
	ms: MapSettings | undefined,
	fullSettings: MapSettings | undefined,
): MapSettingsState {
	const [pointAlongRoad, _setPointAlongRoad] = useState(true);
	const [preferDirection, _setPreferDirection] = useState<string | null>(null);
	const [preferOfficial, _setPreferOfficial] = useState(false);
	const [onlyOfficial, _setOnlyOfficial] = useState(false);
	const [preferHigherQuality, _setPreferHigherQuality] = useState(false);
	const [defaultPanoId, _setDefaultPanoId] = useState(false);
	const [enrichMetadata, _setEnrichMetadata] = useState(true);
	const [enrichFields, _setEnrichFields] = useState<string[] | null>(null);

	useEffect(() => {
		if (!ms) return;
		_setPointAlongRoad(ms.pointAlongRoad);
		_setPreferDirection(ms.preferDirection != null ? String(ms.preferDirection) : null);
		_setPreferOfficial(ms.preferOfficial);
		_setPreferHigherQuality(ms.preferHigherQuality ?? false);
		_setOnlyOfficial(ms.onlyOfficial);
		_setDefaultPanoId(ms.defaultPanoId);
		_setEnrichMetadata(ms.enrichMetadata ?? true);
		_setEnrichFields(ms.enrichFields);
	}, [ms]);

	const makeSetter =
		<K extends keyof MapSettings>(key: K, localSet: (v: MapSettings[K]) => void) =>
		(v: MapSettings[K]) => {
			localSet(v);
			if (fullSettings) updateMapMeta({ settings: { ...fullSettings, [key]: v } });
		};

	return {
		pointAlongRoad,
		setPointAlongRoad: makeSetter("pointAlongRoad", _setPointAlongRoad),
		preferDirection,
		setPreferDirection: (v: string | null) => {
			_setPreferDirection(v);
			if (fullSettings)
				updateMapMeta({
					settings: { ...fullSettings, preferDirection: v as MapSettings["preferDirection"] },
				});
		},
		preferOfficial,
		setPreferOfficial: makeSetter("preferOfficial", _setPreferOfficial),
		onlyOfficial,
		setOnlyOfficial: makeSetter("onlyOfficial", _setOnlyOfficial),
		preferHigherQuality,
		setPreferHigherQuality: makeSetter("preferHigherQuality", _setPreferHigherQuality),
		defaultPanoId,
		setDefaultPanoId: makeSetter("defaultPanoId", _setDefaultPanoId),
		enrichMetadata,
		setEnrichMetadata: makeSetter("enrichMetadata", _setEnrichMetadata),
		enrichFields,
		setEnrichFields: makeSetter("enrichFields", _setEnrichFields),
	};
}
