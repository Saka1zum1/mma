export default /* glsl */ `\
#version 300 es
#define SHADER_NAME sdf-marker-interior-vertex-shader

in vec3 positions;
in vec2 vertexNormals;

in vec3 instancePositions;
in vec3 instancePositions64Low;
in vec4 instanceFillColors;
in float instanceAngles;

out vec4 vFillColor;

vec2 rotate_by_angle(vec2 vertex, float angle) {
  float angle_radian = angle * PI / 180.0;
  float cos_angle = cos(angle_radian);
  float sin_angle = sin(angle_radian);
  mat2 rotationMatrix = mat2(cos_angle, -sin_angle, sin_angle, cos_angle);
  return rotationMatrix * vertex;
}

void main(void) {
  if (instanceFillColors.a == 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  geometry.worldPosition = instancePositions;

  float r = sdfMarker.radiusPixels;
  // Shrink the inscribed outline inward past the AA band (mesh normals are miter
  // vectors), so the opaque interior never pokes into the blended edge.
  float margin = (SMOOTH_EDGE_RADIUS + 1.0) / r;
  vec2 unit = positions.xy - vertexNormals * margin;

  vec2 pixelOffset = unit * r;
  pixelOffset = rotate_by_angle(pixelOffset, instanceAngles);
  pixelOffset.y *= -1.0;
  if (sdfMarker.shapeType == 2) {
    pixelOffset.y += 0.9 * r;
  }

  gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);
  vec3 offset = vec3(pixelOffset, 0.0);
  DECKGL_FILTER_SIZE(offset, geometry);
  gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);

  float order = sdfMarker.orderBase + float(gl_InstanceID);
  gl_Position.z = ((sdfMarker.orderTotal - order) / (sdfMarker.orderTotal + 1.0)) * gl_Position.w;

  vFillColor = vec4(instanceFillColors.rgb, 1.0);
  DECKGL_FILTER_COLOR(vFillColor, geometry);
}
`;
