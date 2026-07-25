/**
 * Bridge pbf@5 `PbfReader` → `@mapbox/vector-tile`, which expects pbf@4's
 * `readVarint64`. Without the shim, every MVT parse throws and coverage paints blank.
 */
import { PbfReader } from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

export function vectorTileFromBytes(bytes: Uint8Array): VectorTile {
	const pbf = new PbfReader(bytes) as PbfReader & { readVarint64?: () => number };
	pbf.readVarint64 ??= function readVarint64(this: PbfReader) {
		return this.readVarint();
	};
	return new VectorTile(pbf as never);
}
