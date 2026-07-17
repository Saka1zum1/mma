export default /* glsl */ `\
#version 300 es
#define SHADER_NAME sdf-marker-interior-fragment-shader

precision highp float;

in vec4 vFillColor;

out vec4 fragColor;

// Opaque interior pass: no SDF, no discard — early-z rejects occluded fragments.
void main(void) {
  fragColor = vFillColor;
}
`;
