// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient module decl must be referenced so dts-bundle-generator pulls it into plugin type-gen
/// <reference path="../../types/measuretool.d.ts" />
import { useEffect } from "react";
import MeasureToolClass from "measuretool-googlemaps-v3";
import type { LatLng } from "@/types";
import { emit as emitEvent, useEventValue } from "@/lib/events";

// --- Measure tool state ---

interface MeasureState {
	instance: InstanceType<typeof MeasureToolClass> | null;
	isMeasuring: boolean;
}

let mState: MeasureState = { instance: null, isMeasuring: false };
function mSnap() {
	return mState;
}

function createInstance(map: google.maps.Map) {
	const mt = new MeasureToolClass(map, {
		contextMenu: false,
		showSegmentLength: false,
	});
	mt.addListener("measure_start", () => {
		mState = { ...mState, isMeasuring: true };
		emitEvent("measure:changed");
	});
	mt.addListener("measure_end", () => {
		mState = { ...mState, isMeasuring: false };
		emitEvent("measure:changed");
		queueMicrotask(() => map.setOptions({ draggableCursor: "crosshair" }));
	});
	return mt;
}

export function startMeasure(map: google.maps.Map, latLng: LatLng) {
	let { instance } = mState;
	if (!instance) {
		instance = createInstance(map);
		mState = { ...mState, instance };
		emitEvent("measure:changed");
	}
	instance.start([latLng]);
}

export function endMeasure() {
	mState.instance?.end();
}

export function useMeasureState() {
	return useEventValue("measure:changed", mSnap);
}

export function useMeasure() {
	const s = useMeasureState();
	useEffect(() => () => endMeasure(), []);
	return s;
}

// --- Lat/lng anchor state ---

let anchor: LatLng | null = null;

export function setLatLngAnchor(v: LatLng | null) {
	anchor = v;
	emitEvent("anchor:changed");
}

export function getLatLngAnchor() {
	return anchor;
}
