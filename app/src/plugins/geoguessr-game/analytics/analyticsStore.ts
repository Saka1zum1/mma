import { getSessions } from "../gameSessionStore";
import type { GameSession, MovementMode } from "../GameState";
import { computeBestStreak } from "../streakValidator";

export interface AnalyticsOverview {
	gamesPlayed: number;
	totalRounds: number;
	averageScore: number;
	bestScore: number;
	bestStreak: number;
	perfectRounds: number;
}

export interface CountryStat {
	countryCode: string;
	countryName: string;
	rounds: number;
	hits: number;
	accuracy: number;
	avgScore: number;
}

export interface MapStat {
	mapId: string;
	mapName: string;
	games: number;
	avgScore: number;
	bestScore: number;
}

export interface ModeStat {
	mode: MovementMode;
	games: number;
	avgScore: number;
}

export interface AnalyticsData {
	overview: AnalyticsOverview;
	byCountry: CountryStat[];
	byMap: MapStat[];
	byMode: ModeStat[];
	recent: GameSession[];
	scoreTrend: { at: number; score: number; mapName: string }[];
}

function countryHit(r: {
	streakHit: boolean | null;
	guessCountryCode: string | null;
	countryCode: string | null;
}): boolean {
	if (r.streakHit === true) return true;
	return !!r.guessCountryCode && !!r.countryCode && r.guessCountryCode === r.countryCode;
}

export function computeAnalytics(filterMapId?: string | null): AnalyticsData {
	let sessions = getSessions();
	if (filterMapId) sessions = sessions.filter((s) => s.mapId === filterMapId);

	const overview: AnalyticsOverview = {
		gamesPlayed: sessions.length,
		totalRounds: 0,
		averageScore: 0,
		bestScore: 0,
		bestStreak: 0,
		perfectRounds: 0,
	};

	let scoreSum = 0;
	const countryMap = new Map<
		string,
		{ name: string; rounds: number; hits: number; scoreSum: number }
	>();
	const mapMap = new Map<string, { name: string; games: number; scoreSum: number; best: number }>();
	const modeMap = new Map<MovementMode, { games: number; scoreSum: number }>();

	for (const s of sessions) {
		overview.totalRounds += s.rounds.length;
		scoreSum += s.totalScore;
		overview.bestScore = Math.max(overview.bestScore, s.totalScore);
		overview.bestStreak = Math.max(overview.bestStreak, s.streak, s.stateStreak ?? 0, computeBestStreak(s.rounds));

		const mm = mapMap.get(s.mapId) ?? {
			name: s.mapName,
			games: 0,
			scoreSum: 0,
			best: 0,
		};
		mm.games++;
		mm.scoreSum += s.totalScore;
		mm.best = Math.max(mm.best, s.totalScore);
		mapMap.set(s.mapId, mm);

		const mode = s.config.movementMode;
		const md = modeMap.get(mode) ?? { games: 0, scoreSum: 0 };
		md.games++;
		md.scoreSum += s.totalScore;
		modeMap.set(mode, md);

		for (const r of s.rounds) {
			if (r.score >= 5000) overview.perfectRounds++;
			const code = r.countryCode ?? "??";
			const c = countryMap.get(code) ?? {
				name: r.countryName?.trim() || "Unknown",
				rounds: 0,
				hits: 0,
				scoreSum: 0,
			};
			c.rounds++;
			c.scoreSum += r.score;
			if (countryHit(r)) c.hits++;
			countryMap.set(code, c);
		}
	}

	overview.averageScore = sessions.length > 0 ? Math.round(scoreSum / sessions.length) : 0;

	const byCountry: CountryStat[] = [...countryMap.entries()]
		.map(([countryCode, v]) => ({
			countryCode,
			countryName: v.name,
			rounds: v.rounds,
			hits: v.hits,
			accuracy: v.rounds > 0 ? Math.round((v.hits / v.rounds) * 100) : 0,
			avgScore: v.rounds > 0 ? Math.round(v.scoreSum / v.rounds) : 0,
		}))
		.sort((a, b) => b.rounds - a.rounds);

	const byMap: MapStat[] = [...mapMap.entries()]
		.map(([mapId, v]) => ({
			mapId,
			mapName: v.name,
			games: v.games,
			avgScore: Math.round(v.scoreSum / v.games),
			bestScore: v.best,
		}))
		.sort((a, b) => b.games - a.games);

	const byMode: ModeStat[] = [...modeMap.entries()].map(([mode, v]) => ({
		mode,
		games: v.games,
		avgScore: Math.round(v.scoreSum / v.games),
	}));

	const scoreTrend = [...sessions]
		.reverse()
		.slice(-30)
		.map((s) => ({
			at: s.finishedAt ?? s.startedAt,
			score: s.totalScore,
			mapName: s.mapName,
		}));

	return {
		overview,
		byCountry,
		byMap,
		byMode,
		recent: sessions.slice(0, 20),
		scoreTrend,
	};
}
