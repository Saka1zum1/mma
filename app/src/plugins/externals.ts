import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactJSXRuntime from "react/jsx-runtime";
import * as ReactJSXDevRuntime from "react/jsx-dev-runtime";
import * as DeckCore from "@deck.gl/core";
import * as DeckLayers from "@deck.gl/layers";
import * as DeckGoogleMaps from "@deck.gl/google-maps";
import * as LumaCore from "@luma.gl/core";
import * as LumaEngine from "@luma.gl/engine";
import * as LumaShadertools from "@luma.gl/shadertools";
import * as LumaWebGL from "@luma.gl/webgl";

const eager: Record<string, unknown> = {
	react: React,
	"react-dom": ReactDOM,
	"react/jsx-runtime": ReactJSXRuntime,
	"react/jsx-dev-runtime": ReactJSXDevRuntime,
	"@deck.gl/core": DeckCore,
	"@deck.gl/layers": DeckLayers,
	"@deck.gl/google-maps": DeckGoogleMaps,
	"@luma.gl/core": LumaCore,
	"@luma.gl/engine": LumaEngine,
	"@luma.gl/shadertools": LumaShadertools,
	"@luma.gl/webgl": LumaWebGL,
};

const lazy: Record<string, () => Promise<unknown>> = {};

const loaded: Record<string, unknown> = {};

export function mmaRequire(id: string): unknown {
	if (id in eager) return eager[id];
	if (id in loaded) return loaded[id];
	if (id in lazy) {
		throw new Error(
			`Module "${id}" is lazy-loaded. ` +
				`Call await MMA.preloadModules(["${id}"]) in your activate() first.`,
		);
	}
	throw new Error(`Module "${id}" is not available as an MMA external.`);
}

export async function preloadModules(ids: string[]): Promise<void> {
	await Promise.all(
		ids.map(async (id) => {
			if (id in eager || id in loaded) return;
			const loader = lazy[id];
			if (!loader) throw new Error(`Module "${id}" is not available as an MMA external.`);
			loaded[id] = await loader();
		}),
	);
}

export function getAvailableExternals(): string[] {
	return [...Object.keys(eager), ...Object.keys(lazy)];
}

declare global {
	 
	var __mma_require: typeof mmaRequire;
}

globalThis.__mma_require = mmaRequire;
