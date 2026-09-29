import type { Location, PolygonGeometry } from "@/bindings.gen";
import type { CameraType } from "@/bindings.gen";
import type { LatLng, PanoView } from "@/types";

/** The camera type each `generation` choice asks for. Equality, not rig family: a
 *  "Gen 4" pick excludes trekkers the way a `cameraType` metadata filter does. */
export const GENERATION_CAMERA_TYPE = {
	1: "gen1",
	23: "gen2",
	4: "gen4",
} as const satisfies Record<GeneratorSettings["generation"], CameraType>;

export interface GeneratorSettings {
	defaultTarget: number;
	radius: number;
	rejectUnofficial: boolean;
	rejectGen1: boolean;
	rejectOfficial: boolean;
	rejectNoDescription: boolean;
	rejectDescription: boolean;
	rejectDateless: boolean;
	adjustHeading: boolean;
	headingReference: "link" | "forward" | "backward";
	headingDeviation: number;
	/** Degrees added to the chosen heading. `headingRandomInRange` draws inside the
	 *  interval; otherwise it picks one of the two ends. */
	headingRangeMin: number;
	headingRangeMax: number;
	headingRandomInRange: boolean;
	adjustPitch: boolean;
	pitchDeviation: number;
	fromDate: string;
	toDate: string;
	checkAllDates: boolean;
	checkLinks: boolean;
	linksDepth: number;
	onlyOneInTimeframe: boolean;
	oneCountryAtATime: boolean;
	findGeneration: boolean;
	generation: 1 | 23 | 4;
	getIntersection: boolean;
	pinpointSearch: boolean;
	pinpointAngle: number;
	selectMonths: boolean;
	fromMonth: string;
	toMonth: string;
	fromYear: string;
	toYear: string;
	findRegions: boolean;
	regionRadius: number;
	skipExisting: boolean;
	skipExistingRadius: number;
	randomInTimeline: boolean;
	showSearchOverlay: boolean;
	searchInDescription: boolean;
	searchTerms: string;
	searchMode: SearchMode;
	searchFilterType: "include" | "exclude";
	filterByLinks: boolean;
	minLinks: number;
	maxLinks: number;
	findCurves: boolean;
	minCurveAngle: number;
	adjustZoom: boolean;
	zoomLevel: number;
	/** How coverage-mode probes allocate over the road network: proportional to road
	 *  density, evenly per area, or halfway between. */
	distribution: "density" | "balanced" | "even";
	samplingMode: SamplingMode;
	/** Which street-view service a probe asks. Google tiles list a z17 photometa tile. */
	provider: StreetViewProvider;
	traverse: BaiduTraverseSettings;
	filterByAltitude: { enabled: boolean; min: number; max: number };
	filterByMinutes: { enabled: boolean; min: number; max: number };
	filterByProcdate: { enabled: boolean; from: string; to: string };
	findByAuthor: { enabled: boolean; author: string; filterType: "include" | "exclude" };
	findPhotospheres: boolean;
	findDrones: boolean;
	findNightCoverage: boolean;
	tags: GeneratorTagSettings;
	notification: GeneratorNotificationSettings;
}

/** Desktop and Discord notices for a Google run. */
export interface GeneratorNotificationSettings {
	enabled: boolean;
	anyLocation: boolean;
	onePolygonComplete: boolean;
	allPolygonsComplete: boolean;
	sendToDiscord: boolean;
	discordWebhook: string;
}

/** Automatic tags applied to each find, in addition to the sidebar's tag name. */
export interface GeneratorTagSettings {
	enabled: boolean;
	provider: boolean;
	year: boolean;
	/** `YY-MM` taken from the capture month. */
	month: boolean;
	/** `newroad`, `noblueline`, or `gen1update` / `gen2or3update` / `gen4update`. */
	updateType: boolean;
	country: boolean;
	countryCode: boolean;
	region: boolean;
	road: boolean;
	polygon: boolean;
	/** Last two characters of a Baidu pano id (the car code). */
	panoId: boolean;
	procdate: boolean;
}

export type StreetViewProvider =
	| "google"
	| "googleZoom"
	| "apple"
	| "yandex"
	| "baidu"
	| "tencent";

/** Google radius search and the photometa tile listing both speak Google pano ids. */
export function isGoogleProvider(provider: StreetViewProvider): boolean {
	return provider === "google" || provider === "googleZoom";
}

/** Provider stored on a location. Photometa (`googleZoom`) is still Google imagery.
 *  Anything else missing from this list is not a viewer provider, so it stays Google. */
export function storedProvider(
	provider: StreetViewProvider | null | undefined,
): "google" | "apple" | "yandex" | "baidu" | "tencent" {
	if (
		provider === "apple" ||
		provider === "baidu" ||
		provider === "tencent" ||
		provider === "yandex"
	) {
		return provider;
	}
	return "google";
}

export type SamplingMode = "random" | "poisson" | "grid" | "blueline" | "kernels" | "traverse";

/** Baidu id-range scan. Only used when `provider` is baidu and `samplingMode` is traverse. */
export interface BaiduTraverseSettings {
	startPanoId: string;
	endPanoId: string;
	/** Skip a capture that already has road links. */
	filterNormalCover: boolean;
	/** Skip a capture whose timeline lists more than one date. */
	filterTimelineCoverage: boolean;
	/** Sample a short window, then jump `scanStepMin` minutes, instead of every millisecond. */
	useRoughScan: boolean;
	scanStepMin: number;
	scanDurationSec: number;
	skipTimeEnabled: boolean;
	/** Minute of day, 0–1439. When start is after end the window wraps midnight. */
	skipStartMin: number;
	skipEndMin: number;
	/** In-flight sdata batches. Clamped to 50–500, matching various-map-gen. */
	concurrency: number;
	reqTimeoutSec: number;
	retryTimes: number;
	/** Log scanned-id progress every this many probes. */
	progressStep: number;
}

/** A region's supply of probe points, drawn `n` at a time; a draw waits while more are on
 *  the way, and an empty draw means it is used up. */
export type PointSource = (n: number) => Promise<LatLng[]>;

export type SearchMode = "contains" | "fullword" | "startswith" | "endswith" | "sectionmatch";

const now = new Date();
const pad = (n: number) => (n < 10 ? "0" : "") + n;

export const DEFAULT_SETTINGS: GeneratorSettings = {
	defaultTarget: 10,
	radius: 500,
	rejectUnofficial: true,
	rejectGen1: false,
	rejectOfficial: false,
	rejectNoDescription: true,
	rejectDescription: false,
	rejectDateless: true,
	adjustHeading: true,
	headingReference: "link",
	headingDeviation: 0,
	headingRangeMin: 0,
	headingRangeMax: 0,
	headingRandomInRange: false,
	adjustPitch: false,
	pitchDeviation: 10,
	fromDate: "2009-01",
	toDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}`,
	checkAllDates: false,
	checkLinks: false,
	linksDepth: 2,
	onlyOneInTimeframe: false,
	oneCountryAtATime: false,
	findGeneration: false,
	generation: 1,
	getIntersection: false,
	pinpointSearch: false,
	pinpointAngle: 145,
	selectMonths: false,
	fromMonth: "01",
	toMonth: "12",
	fromYear: "2007",
	toYear: String(now.getFullYear()),
	findRegions: false,
	regionRadius: 100,
	skipExisting: false,
	skipExistingRadius: 100,
	randomInTimeline: false,
	showSearchOverlay: false,
	searchInDescription: false,
	searchTerms: "",
	searchMode: "contains",
	searchFilterType: "include",
	filterByLinks: false,
	minLinks: 1,
	maxLinks: 5,
	findCurves: false,
	minCurveAngle: 30,
	adjustZoom: false,
	zoomLevel: 0,
	samplingMode: "random",
	distribution: "density",
	provider: "google",
	traverse: {
		startPanoId: "",
		endPanoId: "",
		filterNormalCover: false,
		filterTimelineCoverage: false,
		useRoughScan: false,
		scanStepMin: 1,
		scanDurationSec: 1,
		skipTimeEnabled: false,
		skipStartMin: 1110,
		skipEndMin: 390,
		concurrency: 200,
		reqTimeoutSec: 25,
		retryTimes: 2,
		progressStep: 100_000,
	},
	filterByAltitude: { enabled: false, min: 0, max: 1000 },
	filterByMinutes: { enabled: false, min: 0, max: 1439 },
	filterByProcdate: {
		enabled: false,
		from: "2007-01-01",
		to: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
	},
	findByAuthor: { enabled: false, author: "", filterType: "include" },
	findPhotospheres: false,
	findDrones: false,
	findNightCoverage: false,
	tags: {
		enabled: false,
		provider: false,
		year: false,
		month: false,
		updateType: false,
		country: false,
		countryCode: false,
		region: false,
		road: false,
		polygon: false,
		panoId: false,
		procdate: false,
	},
	notification: {
		enabled: false,
		anyLocation: false,
		onePolygonComplete: false,
		allPolygonsComplete: false,
		sendToDiscord: false,
		discordWebhook: "",
	},
};

/** How far a Baidu traverse has walked its pano-id range. */
export interface TraverseScanProgress {
	/** Ids actually sent. */
	finished: number;
	/** Ids the range will send, matching the scanner (a rough window may run past the end). */
	total: number;
	/** Average ids per second since the scan started. */
	perSec: number;
}

export interface GeneratorStats {
	probesPerSec: number;
	locsPerSec: number;
	hitRate: number | null;
	probes: number;
	found: number;
	duplicates: number;
	rejected: number;
	spread: number | null;
	/** Set for the whole of a traverse run, including after it stops. */
	traverse: TraverseScanProgress | null;
}

export interface GeneratorRegionMeta {
	target: number;
	found: GeneratedLocation[];
	checkedPanos: Set<string>;
	isProcessing: boolean;
}

export interface GeneratorRegion {
	id: string;
	name: string;
	polygon: PolygonGeometry;
	found: GeneratedLocation[];
	target: number;
	checkedPanos: Set<string>;
	isProcessing: boolean;
}

export type GeneratedLocation = PanoView &
	Pick<Location, "lat" | "lng"> & {
		imageDate: string | null;
		country?: string | null;
		region?: string | null;
		road?: string | null;
		procdate?: string | null;
		/** Polygon the find was kept in. */
		polygonName?: string | null;
		/** various-map-gen update tag: new road, no blue line, or a generation update. */
		updateType?: string | null;
		provider?: StreetViewProvider;
		/** Set on a traverse hit that is not normal coverage. Never both kinds at once. */
		baiduCoverage?: "hidden" | "timeline" | null;
	};

export interface GenerationCallbacks {
	onLocationsFound: (locs: GeneratedLocation[]) => void;
	onProgress: (regionId: string, found: number, target: number) => void;
	onRegionComplete: (regionId: string) => void;
	onError?: (error: Error) => void;
	onDone: () => void;
}
