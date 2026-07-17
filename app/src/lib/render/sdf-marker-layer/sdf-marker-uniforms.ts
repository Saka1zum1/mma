import type { ShaderModule } from "@luma.gl/shadertools";

const glslUniformBlock = `\
layout(std140) uniform sdfMarkerUniforms {
  float radiusPixels;
  highp int shapeType;
  float flattenOpacity;
  float orderBase;
  float orderTotal;
} sdfMarker;
`;

export type SDFMarkerProps = {
	radiusPixels: number;
	shapeType: number;
	// > 0 enables layer-level translucency: output premultiplied color scaled by
	// this value, alpha left at full shape coverage (see markerLayer.ts blending).
	flattenOpacity: number;
	/** Global draw-order offset of this layer's instance 0. */
	orderBase: number;
	/** Total draw-order slots this frame; maps order to depth in (0, 1) NDC. */
	orderTotal: number;
};

export const sdfMarkerUniforms = {
	name: "sdfMarker",
	vs: glslUniformBlock,
	fs: glslUniformBlock,
	source: "",
	uniformTypes: {
		radiusPixels: "f32",
		shapeType: "i32",
		flattenOpacity: "f32",
		orderBase: "f32",
		orderTotal: "f32",
	},
} as const satisfies ShaderModule<SDFMarkerProps>;
