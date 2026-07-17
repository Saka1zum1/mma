import { Layer, color, project32 } from "@deck.gl/core";
import { Model, Geometry } from "@luma.gl/engine";
import { sdfMarkerUniforms, type SDFMarkerProps } from "./sdf-marker-uniforms";
import { interiorMesh, MIN_OPAQUE_RADIUS_PX, SHAPE_TO_INT } from "./markerMesh";
import type { MarkerShape } from "./markerMesh";
import vs from "./sdf-marker-vertex.glsl";
import fs from "./sdf-marker-fragment.glsl";
import { log } from "@/lib/util/log";
import interiorVs from "./sdf-marker-interior-vertex.glsl";
import interiorFs from "./sdf-marker-interior-fragment.glsl";

import type {
	LayerProps,
	LayerDataSource,
	UpdateParameters,
	Accessor,
	Position,
	Color,
	DefaultProps,
} from "@deck.gl/core";

export type SDFShape = MarkerShape;

type _SDFMarkerLayerProps<DataT> = {
	data: LayerDataSource<DataT>;
	shape?: SDFShape;
	radiusPixels?: number;
	flattenOpacity?: number;
	/** Global draw-order slot of instance 0; instance i renders at orderBase + i. */
	orderBase?: number;
	/** Total draw-order slots this frame (shared by every marker layer). */
	orderTotal?: number;
	/** Depth-tested opaque interior pass + blended edge. Off = blended only (translucent
	 *  markers). Auto-disabled below MIN_OPAQUE_RADIUS_PX. */
	opaque?: boolean;
	getPosition?: Accessor<DataT, Position>;
	getFillColor?: Accessor<DataT, Color>;
	getAngle?: Accessor<DataT, number>;
};

export type SDFMarkerLayerProps<DataT = unknown> = _SDFMarkerLayerProps<DataT> & LayerProps;

const defaultProps: DefaultProps<SDFMarkerLayerProps> = {
	shape: "circle",
	radiusPixels: { type: "number", min: 0, value: 12 },
	flattenOpacity: { type: "number", min: 0, max: 1, value: 0 },
	orderBase: { type: "number", value: 0 },
	orderTotal: { type: "number", value: 1 },
	opaque: true,
	getPosition: { type: "accessor", value: [0, 0] },
	getFillColor: { type: "accessor", value: [0, 0, 0, 255] },
	getAngle: { type: "accessor", value: 0 },
};

/**
 * The one marker layer (pin / arrow / circle), replacing deck.gl GPU picking and
 * blending-only rendering with a draw-order-depth pipeline:
 * - Opaque interior pass: discard-free inscribed mesh, depth write ON. Stacked
 *   markers early-z-reject occluded fragments instead of blending them all.
 * - Blended full pass: the original SDF quad with AA edges, depth test against
 *   the interiors (no write), preserving painter's-order visuals.
 * Never pickable: hit-testing is CPU-side (storePick / markerDistancePx).
 */
export default class SDFMarkerLayer<
	DataT = unknown,
	ExtraPropsT extends Record<string, unknown> = Record<string, unknown>,
> extends Layer<ExtraPropsT & Required<_SDFMarkerLayerProps<DataT>>> {
	static defaultProps = defaultProps;
	static layerName = "SDFMarkerLayer";

	declare state: { models?: Model[]; opaqueActive?: boolean };

	private opaqueActive(): boolean {
		return this.props.opaque && this.props.radiusPixels >= MIN_OPAQUE_RADIUS_PX;
	}

	getShaders() {
		return super.getShaders({
			vs,
			fs,
			modules: [project32, color, sdfMarkerUniforms],
		});
	}

	private getInteriorShaders() {
		return super.getShaders({
			vs: interiorVs,
			fs: interiorFs,
			modules: [project32, color, sdfMarkerUniforms],
		});
	}

	initializeState() {
		this.getAttributeManager()!.addInstanced({
			instancePositions: {
				size: 3,
				type: "float64",
				fp64: this.use64bitPositions(),
				transition: true,
				accessor: "getPosition",
			},
			instanceFillColors: {
				size: this.props.colorFormat.length,
				transition: true,
				type: "unorm8",
				accessor: "getFillColor",
				defaultValue: [0, 0, 0, 255],
			},
			instanceAngles: {
				size: 1,
				transition: true,
				accessor: "getAngle",
			},
		});
	}

	updateState(params: UpdateParameters<this>) {
		super.updateState(params);
		const shapeChanged = params.props.shape !== params.oldProps.shape;
		const opaqueChanged = this.opaqueActive() !== this.state.opaqueActive;
		if (params.changeFlags.extensionsChanged || shapeChanged || opaqueChanged) {
			for (const m of this.state.models ?? []) m.destroy();
			this.state.models = this._buildModels();
			this.state.opaqueActive = this.opaqueActive();
			this.getAttributeManager()!.invalidateAll();
		}
	}

	draw() {
		const { radiusPixels, shape, flattenOpacity, orderBase, orderTotal } = this.props;
		const sdfProps: SDFMarkerProps = {
			radiusPixels,
			shapeType: SHAPE_TO_INT[shape] ?? 0,
			flattenOpacity,
			orderBase,
			orderTotal: Math.max(orderTotal, 1),
		};
		// deck's _postUpdate only sets the instance count on `state.model` (singular);
		// with a models array each model must be kept in sync here or it draws 0 instances.
		const numInstances = this.getNumInstances();
		for (const model of this.state.models!) {
			model.setInstanceCount(numInstances);
			model.shaderInputs.setProps({ sdfMarker: sdfProps });
			const ok = model.draw(this.context.renderPass);
			if (!ok && !this._drawFailLogged) {
				this._drawFailLogged = true;
				log.warn(`[sdf] model.draw returned false for ${model.id} (pipeline not ready?)`);
			}
		}
	}

	private _drawFailLogged = false;

	protected _buildModels(): Model[] {
		const models: Model[] = [];
		const bufferLayout = this.getAttributeManager()!.getBufferLayouts();
		if (this.opaqueActive()) {
			const mesh = interiorMesh(this.props.shape);
			models.push(
				new Model(this.context.device, {
					...this.getInteriorShaders(),
					id: `${this.props.id}-interior`,
					bufferLayout,
					geometry: new Geometry({
						topology: "triangle-list",
						attributes: {
							positions: { size: 3, value: mesh.positions },
							vertexNormals: { size: 2, value: mesh.normals },
						},
						indices: mesh.indices,
					}),
					isInstanced: true,
					parameters: {
						blend: false,
						depthWriteEnabled: true,
						depthCompare: "less-equal",
					},
				}),
			);
		}
		const quad = [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0];
		models.push(
			new Model(this.context.device, {
				...this.getShaders(),
				id: this.props.id,
				bufferLayout,
				geometry: new Geometry({
					topology: "triangle-strip",
					attributes: {
						positions: { size: 3, value: new Float32Array(quad) },
					},
				}),
				isInstanced: true,
				parameters: {
					depthWriteEnabled: false,
					depthCompare: "less-equal",
				},
			}),
		);
		return models;
	}
}
