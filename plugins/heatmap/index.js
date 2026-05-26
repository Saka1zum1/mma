var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// mma-ext:@deck.gl/google-maps
var require_google_maps = __commonJS({
  "mma-ext:@deck.gl/google-maps"(exports, module) {
    module.exports = globalThis.__mma_require("@deck.gl/google-maps");
  }
});

// mma-ext:@deck.gl/core
var require_core = __commonJS({
  "mma-ext:@deck.gl/core"(exports, module) {
    module.exports = globalThis.__mma_require("@deck.gl/core");
  }
});

// mma-ext:@luma.gl/engine
var require_engine = __commonJS({
  "mma-ext:@luma.gl/engine"(exports, module) {
    module.exports = globalThis.__mma_require("@luma.gl/engine");
  }
});

// mma-ext:react
var require_react = __commonJS({
  "mma-ext:react"(exports, module) {
    module.exports = globalThis.__mma_require("react");
  }
});

// mma-ext:react/jsx-runtime
var require_jsx_runtime = __commonJS({
  "mma-ext:react/jsx-runtime"(exports, module) {
    module.exports = globalThis.__mma_require("react/jsx-runtime");
  }
});

// src/heatmap.ts
var import_google_maps = __toESM(require_google_maps());

// node_modules/@deck.gl/aggregation-layers/dist/common/utils/color-utils.js
var defaultColorRange = [
  [255, 255, 178],
  [254, 217, 118],
  [254, 178, 76],
  [253, 141, 60],
  [240, 59, 32],
  [189, 0, 38]
];
function colorRangeToFlatArray(colorRange, normalize = false, ArrayType = Float32Array) {
  let flatArray;
  if (Number.isFinite(colorRange[0])) {
    flatArray = new ArrayType(colorRange);
  } else {
    flatArray = new ArrayType(colorRange.length * 4);
    let index = 0;
    for (let i = 0; i < colorRange.length; i++) {
      const color = colorRange[i];
      flatArray[index++] = color[0];
      flatArray[index++] = color[1];
      flatArray[index++] = color[2];
      flatArray[index++] = Number.isFinite(color[3]) ? color[3] : 255;
    }
  }
  if (normalize) {
    for (let i = 0; i < flatArray.length; i++) {
      flatArray[i] /= 255;
    }
  }
  return flatArray;
}

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/heatmap-layer-utils.js
function getBounds(points) {
  const x = points.map((p) => p[0]);
  const y = points.map((p) => p[1]);
  const xMin = Math.min.apply(null, x);
  const xMax = Math.max.apply(null, x);
  const yMin = Math.min.apply(null, y);
  const yMax = Math.max.apply(null, y);
  return [xMin, yMin, xMax, yMax];
}
function boundsContain(currentBounds, targetBounds) {
  if (targetBounds[0] >= currentBounds[0] && targetBounds[2] <= currentBounds[2] && targetBounds[1] >= currentBounds[1] && targetBounds[3] <= currentBounds[3]) {
    return true;
  }
  return false;
}
var scratchArray = new Float32Array(12);
function packVertices(points, dimensions = 2) {
  let index = 0;
  for (const point of points) {
    for (let i = 0; i < dimensions; i++) {
      scratchArray[index++] = point[i] || 0;
    }
  }
  return scratchArray;
}
function scaleToAspectRatio(boundingBox, width, height) {
  const [xMin, yMin, xMax, yMax] = boundingBox;
  const currentWidth = xMax - xMin;
  const currentHeight = yMax - yMin;
  let newWidth = currentWidth;
  let newHeight = currentHeight;
  if (currentWidth / currentHeight < width / height) {
    newWidth = width / height * currentHeight;
  } else {
    newHeight = height / width * currentWidth;
  }
  if (newWidth < width) {
    newWidth = width;
    newHeight = height;
  }
  const xCenter = (xMax + xMin) / 2;
  const yCenter = (yMax + yMin) / 2;
  return [
    xCenter - newWidth / 2,
    yCenter - newHeight / 2,
    xCenter + newWidth / 2,
    yCenter + newHeight / 2
  ];
}
function getTextureCoordinates(point, bounds) {
  const [xMin, yMin, xMax, yMax] = bounds;
  return [(point[0] - xMin) / (xMax - xMin), (point[1] - yMin) / (yMax - yMin)];
}

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/heatmap-layer.js
var import_engine2 = __toESM(require_engine(), 1);
var import_core3 = __toESM(require_core(), 1);

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/triangle-layer.js
var import_engine = __toESM(require_engine(), 1);
var import_core = __toESM(require_core(), 1);

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/triangle-layer-vertex.glsl.js
var triangle_layer_vertex_glsl_default = `#version 300 es
#define SHADER_NAME heatp-map-layer-vertex-shader
uniform sampler2D maxTexture;
in vec3 positions;
in vec2 texCoords;
out vec2 vTexCoords;
out float vIntensityMin;
out float vIntensityMax;
void main(void) {
gl_Position = project_position_to_clipspace(positions, vec3(0.0), vec3(0.0));
vTexCoords = texCoords;
vec4 maxTexture = texture(maxTexture, vec2(0.5));
float maxValue = triangle.aggregationMode < 0.5 ? maxTexture.r : maxTexture.g;
float minValue = maxValue * triangle.threshold;
if (triangle.colorDomain[1] > 0.) {
maxValue = triangle.colorDomain[1];
minValue = triangle.colorDomain[0];
}
vIntensityMax = triangle.intensity / maxValue;
vIntensityMin = triangle.intensity / minValue;
}
`;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/triangle-layer-fragment.glsl.js
var triangle_layer_fragment_glsl_default = `#version 300 es
#define SHADER_NAME triangle-layer-fragment-shader
precision highp float;
uniform sampler2D weightsTexture;
uniform sampler2D colorTexture;
in vec2 vTexCoords;
in float vIntensityMin;
in float vIntensityMax;
out vec4 fragColor;
vec4 getLinearColor(float value) {
float factor = clamp(value * vIntensityMax, 0., 1.);
vec4 color = texture(colorTexture, vec2(factor, 0.5));
color.a *= min(value * vIntensityMin, 1.0);
return color;
}
void main(void) {
vec4 weights = texture(weightsTexture, vTexCoords);
float weight = weights.r;
if (triangle.aggregationMode > 0.5) {
weight /= max(1.0, weights.a);
}
if (weight <= 0.) {
discard;
}
vec4 linearColor = getLinearColor(weight);
linearColor.a *= layer.opacity;
fragColor = linearColor;
}
`;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/triangle-layer-uniforms.js
var uniformBlock = `layout(std140) uniform triangleUniforms {
  float aggregationMode;
  vec2 colorDomain;
  float intensity;
  float threshold;
} triangle;
`;
var triangleUniforms = {
  name: "triangle",
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    aggregationMode: "f32",
    colorDomain: "vec2<f32>",
    intensity: "f32",
    threshold: "f32"
  }
};

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/triangle-layer.js
var TriangleLayer = class extends import_core.Layer {
  getShaders() {
    return super.getShaders({ vs: triangle_layer_vertex_glsl_default, fs: triangle_layer_fragment_glsl_default, modules: [import_core.project32, triangleUniforms] });
  }
  initializeState({ device }) {
    this.setState({ model: this._getModel(device) });
  }
  _getModel(device) {
    const { vertexCount, data } = this.props;
    return new import_engine.Model(device, {
      ...this.getShaders(),
      id: this.props.id,
      attributes: data.attributes,
      bufferLayout: [
        { name: "positions", format: "float32x3" },
        { name: "texCoords", format: "float32x2" }
      ],
      topology: "triangle-strip",
      vertexCount
    });
  }
  draw() {
    const { model } = this.state;
    const { aggregationMode, colorDomain, intensity, threshold, colorTexture, maxTexture, weightsTexture } = this.props;
    const triangleProps = {
      aggregationMode,
      colorDomain,
      intensity,
      threshold,
      colorTexture,
      maxTexture,
      weightsTexture
    };
    model.shaderInputs.setProps({ triangle: triangleProps });
    model.draw(this.context.renderPass);
  }
};
TriangleLayer.layerName = "TriangleLayer";
var triangle_layer_default = TriangleLayer;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/aggregation-layer.js
var import_core2 = __toESM(require_core(), 1);

// node_modules/@deck.gl/aggregation-layers/dist/common/utils/prop-utils.js
function filterProps(props, filterKeys) {
  const filteredProps = {};
  for (const key in props) {
    if (!filterKeys.includes(key)) {
      filteredProps[key] = props[key];
    }
  }
  return filteredProps;
}

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/aggregation-layer.js
var AggregationLayer = class extends import_core2.CompositeLayer {
  initializeAggregationLayer(dimensions) {
    super.initializeState(this.context);
    this.setState({
      // Layer props , when changed doesn't require updating aggregation
      ignoreProps: filterProps(this.constructor._propTypes, dimensions.data.props),
      dimensions
    });
  }
  updateState(opts) {
    super.updateState(opts);
    const { changeFlags } = opts;
    if (changeFlags.extensionsChanged) {
      const shaders = this.getShaders({});
      if (shaders && shaders.defines) {
        shaders.defines.NON_INSTANCED_MODEL = 1;
      }
      this.updateShaders(shaders);
    }
    this._updateAttributes();
  }
  updateAttributes(changedAttributes) {
    this.setState({ changedAttributes });
  }
  getAttributes() {
    return this.getAttributeManager().getAttributes();
  }
  getModuleSettings() {
    const { viewport, mousePosition, device } = this.context;
    const moduleSettings = Object.assign(Object.create(this.props), {
      viewport,
      mousePosition,
      picking: {
        isActive: 0
      },
      // @ts-expect-error TODO - assuming WebGL context
      devicePixelRatio: device.canvasContext.cssToDeviceRatio()
    });
    return moduleSettings;
  }
  updateShaders(shaders) {
  }
  /**
   * Checks if aggregation is dirty
   * @param {Object} updateOpts - object {props, oldProps, changeFlags}
   * @param {Object} params - object {dimension, compareAll}
   * @param {Object} params.dimension - {props, accessors} array of props and/or accessors
   * @param {Boolean} params.compareAll - when `true` it will include non layer props for comparision
   * @returns {Boolean} - returns true if dimensions' prop or accessor is changed
   **/
  isAggregationDirty(updateOpts, params = {}) {
    const { props, oldProps, changeFlags } = updateOpts;
    const { compareAll = false, dimension } = params;
    const { ignoreProps } = this.state;
    const { props: dataProps, accessors = [] } = dimension;
    const { updateTriggersChanged } = changeFlags;
    if (changeFlags.dataChanged) {
      return true;
    }
    if (updateTriggersChanged) {
      if (updateTriggersChanged.all) {
        return true;
      }
      for (const accessor of accessors) {
        if (updateTriggersChanged[accessor]) {
          return true;
        }
      }
    }
    if (compareAll) {
      if (changeFlags.extensionsChanged) {
        return true;
      }
      return (0, import_core2._compareProps)({
        oldProps,
        newProps: props,
        ignoreProps,
        propTypes: this.constructor._propTypes
      });
    }
    for (const name of dataProps) {
      if (props[name] !== oldProps[name]) {
        return true;
      }
    }
    return false;
  }
  /**
   * Checks if an attribute is changed
   * @param {String} name - name of the attribute
   * @returns {Boolean} - `true` if attribute `name` is changed, `false` otherwise,
   *                       If `name` is not passed or `undefiend`, `true` if any attribute is changed, `false` otherwise
   **/
  isAttributeChanged(name) {
    const { changedAttributes } = this.state;
    if (!name) {
      return !isObjectEmpty(changedAttributes);
    }
    return changedAttributes && changedAttributes[name] !== void 0;
  }
  // Private
  // override Composite layer private method to create AttributeManager instance
  _getAttributeManager() {
    return new import_core2.AttributeManager(this.context.device, {
      id: this.props.id,
      stats: this.context.stats
    });
  }
};
AggregationLayer.layerName = "AggregationLayer";
var aggregation_layer_default = AggregationLayer;
function isObjectEmpty(obj) {
  let isEmpty = true;
  for (const key in obj) {
    isEmpty = false;
    break;
  }
  return isEmpty;
}

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/weights-vs.glsl.js
var weights_vs_glsl_default = `#version 300 es
in vec3 positions;
in vec3 positions64Low;
in float weights;
out vec4 weightsTexture;
void main()
{
weightsTexture = vec4(weights * weight.weightsScale, 0., 0., 1.);
float radiusTexels = project_pixel_size(weight.radiusPixels) * weight.textureWidth / (weight.commonBounds.z - weight.commonBounds.x);
gl_PointSize = radiusTexels * 2.;
vec3 commonPosition = project_position(positions, positions64Low);
gl_Position.xy = (commonPosition.xy - weight.commonBounds.xy) / (weight.commonBounds.zw - weight.commonBounds.xy) ;
gl_Position.xy = (gl_Position.xy * 2.) - (1.);
gl_Position.w = 1.0;
}
`;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/weights-fs.glsl.js
var weights_fs_glsl_default = `#version 300 es
in vec4 weightsTexture;
out vec4 fragColor;
float gaussianKDE(float u){
return pow(2.71828, -u*u/0.05555)/(1.77245385*0.166666);
}
void main()
{
float dist = length(gl_PointCoord - vec2(0.5, 0.5));
if (dist > 0.5) {
discard;
}
fragColor = weightsTexture * gaussianKDE(2. * dist);
DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/max-vs.glsl.js
var max_vs_glsl_default = `#version 300 es
uniform sampler2D inTexture;
out vec4 outTexture;
void main()
{
int yIndex = gl_VertexID / int(maxWeight.textureSize);
int xIndex = gl_VertexID - (yIndex * int(maxWeight.textureSize));
vec2 uv = (0.5 + vec2(float(xIndex), float(yIndex))) / maxWeight.textureSize;
outTexture = texture(inTexture, uv);
gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
gl_PointSize = 1.0;
}
`;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/max-fs.glsl.js
var max_fs_glsl_default = `#version 300 es
in vec4 outTexture;
out vec4 fragColor;
void main() {
fragColor = outTexture;
fragColor.g = outTexture.r / max(1.0, outTexture.a);
}
`;

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/heatmap-layer-uniforms.js
var uniformBlock2 = `layout(std140) uniform weightUniforms {
  vec4 commonBounds;
  float radiusPixels;
  float textureWidth;
  float weightsScale;
} weight;
`;
var weightUniforms = {
  name: "weight",
  vs: uniformBlock2,
  uniformTypes: {
    commonBounds: "vec4<f32>",
    radiusPixels: "f32",
    textureWidth: "f32",
    weightsScale: "f32"
  }
};
var maxWeightUniforms = {
  name: "maxWeight",
  vs: `layout(std140) uniform maxWeightUniforms {
  float textureSize;
} maxWeight;
`,
  uniformTypes: {
    textureSize: "f32"
  }
};

// node_modules/@deck.gl/aggregation-layers/dist/heatmap-layer/heatmap-layer.js
var RESOLUTION = 2;
var TEXTURE_PROPS = {
  format: "rgba8unorm",
  dimension: "2d",
  width: 1,
  height: 1,
  sampler: {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge"
  }
};
var DEFAULT_COLOR_DOMAIN = [0, 0];
var AGGREGATION_MODE = {
  SUM: 0,
  MEAN: 1
};
var defaultProps = {
  getPosition: { type: "accessor", value: (x) => x.position },
  getWeight: { type: "accessor", value: 1 },
  intensity: { type: "number", min: 0, value: 1 },
  radiusPixels: { type: "number", min: 1, max: 100, value: 50 },
  colorRange: defaultColorRange,
  threshold: { type: "number", min: 0, max: 1, value: 0.05 },
  colorDomain: { type: "array", value: null, optional: true },
  // 'SUM' or 'MEAN'
  aggregation: "SUM",
  weightsTextureSize: { type: "number", min: 128, max: 2048, value: 2048 },
  debounceTimeout: { type: "number", min: 0, max: 1e3, value: 500 }
};
var FLOAT_TARGET_FEATURES = [
  "float32-renderable-webgl",
  // ability to render to float texture
  "texture-blend-float-webgl"
  // ability to blend when rendering to float texture
];
var DIMENSIONS = {
  data: {
    props: ["radiusPixels"]
  }
};
var HeatmapLayer = class extends aggregation_layer_default {
  getShaders(shaders) {
    let modules = [import_core3.project32];
    if (shaders.modules) {
      modules = [...modules, ...shaders.modules];
    }
    return super.getShaders({ ...shaders, modules });
  }
  initializeState() {
    super.initializeAggregationLayer(DIMENSIONS);
    this.setState({ colorDomain: DEFAULT_COLOR_DOMAIN });
    this._setupTextureParams();
    this._setupAttributes();
    this._setupResources();
  }
  shouldUpdateState({ changeFlags }) {
    return changeFlags.somethingChanged;
  }
  /* eslint-disable max-statements,complexity */
  updateState(opts) {
    super.updateState(opts);
    this._updateHeatmapState(opts);
  }
  _updateHeatmapState(opts) {
    const { props, oldProps } = opts;
    const changeFlags = this._getChangeFlags(opts);
    if (changeFlags.dataChanged || changeFlags.viewportChanged) {
      changeFlags.boundsChanged = this._updateBounds(changeFlags.dataChanged);
      this._updateTextureRenderingBounds();
    }
    if (changeFlags.dataChanged || changeFlags.boundsChanged) {
      clearTimeout(this.state.updateTimer);
      this.setState({ isWeightMapDirty: true });
      if (changeFlags.dataChanged) {
        const weightsTransformShaders = this.getShaders({ vs: weights_vs_glsl_default, fs: weights_fs_glsl_default });
        this._createWeightsTransform(weightsTransformShaders);
      }
    } else if (changeFlags.viewportZoomChanged) {
      this._debouncedUpdateWeightmap();
    }
    if (props.colorRange !== oldProps.colorRange) {
      this._updateColorTexture(opts);
    }
    if (this.state.isWeightMapDirty) {
      this._updateWeightmap();
    }
    this.setState({ zoom: opts.context.viewport.zoom });
  }
  renderLayers() {
    const { weightsTexture, triPositionBuffer, triTexCoordBuffer, maxWeightsTexture, colorTexture, colorDomain } = this.state;
    const { updateTriggers, intensity, threshold, aggregation } = this.props;
    const TriangleLayerClass = this.getSubLayerClass("triangle", triangle_layer_default);
    return new TriangleLayerClass(this.getSubLayerProps({
      id: "triangle-layer",
      updateTriggers
    }), {
      // position buffer is filled with world coordinates generated from viewport.unproject
      // i.e. LNGLAT if geospatial, CARTESIAN otherwise
      coordinateSystem: "default",
      data: {
        attributes: {
          positions: triPositionBuffer,
          texCoords: triTexCoordBuffer
        }
      },
      vertexCount: 4,
      maxTexture: maxWeightsTexture,
      colorTexture,
      aggregationMode: AGGREGATION_MODE[aggregation] || 0,
      weightsTexture,
      intensity,
      threshold,
      colorDomain
    });
  }
  finalizeState(context) {
    super.finalizeState(context);
    const { weightsTransform, weightsTexture, maxWeightTransform, maxWeightsTexture, triPositionBuffer, triTexCoordBuffer, colorTexture, updateTimer } = this.state;
    weightsTransform?.destroy();
    weightsTexture?.destroy();
    maxWeightTransform?.destroy();
    maxWeightsTexture?.destroy();
    triPositionBuffer?.destroy();
    triTexCoordBuffer?.destroy();
    colorTexture?.destroy();
    if (updateTimer) {
      clearTimeout(updateTimer);
    }
  }
  // PRIVATE
  // override Composite layer private method to create AttributeManager instance
  _getAttributeManager() {
    return new import_core3.AttributeManager(this.context.device, {
      id: this.props.id,
      stats: this.context.stats
    });
  }
  _getChangeFlags(opts) {
    const changeFlags = {};
    const { dimensions } = this.state;
    changeFlags.dataChanged = this.isAttributeChanged() && "attribute changed" || // if any attribute is changed
    this.isAggregationDirty(opts, {
      compareAll: true,
      dimension: dimensions.data
    }) && "aggregation is dirty";
    changeFlags.viewportChanged = opts.changeFlags.viewportChanged;
    const { zoom } = this.state;
    if (!opts.context.viewport || opts.context.viewport.zoom !== zoom) {
      changeFlags.viewportZoomChanged = true;
    }
    return changeFlags;
  }
  _createTextures() {
    const { textureSize, format } = this.state;
    this.setState({
      weightsTexture: this.context.device.createTexture({
        ...TEXTURE_PROPS,
        width: textureSize,
        height: textureSize,
        format
      }),
      maxWeightsTexture: this.context.device.createTexture({
        ...TEXTURE_PROPS,
        width: 1,
        height: 1,
        format
      })
    });
  }
  _setupAttributes() {
    const attributeManager = this.getAttributeManager();
    attributeManager.add({
      positions: { size: 3, type: "float64", accessor: "getPosition" },
      weights: { size: 1, accessor: "getWeight" }
    });
    this.setState({ positionAttributeName: "positions" });
  }
  _setupTextureParams() {
    const { device } = this.context;
    const { weightsTextureSize } = this.props;
    const textureSize = Math.min(weightsTextureSize, device.limits.maxTextureDimension2D);
    const floatTargetSupport = FLOAT_TARGET_FEATURES.every((feature) => device.features.has(feature));
    const format = floatTargetSupport ? "rgba32float" : "rgba8unorm";
    const weightsScale = floatTargetSupport ? 1 : 1 / 255;
    this.setState({ textureSize, format, weightsScale });
    if (!floatTargetSupport) {
      import_core3.log.warn(`HeatmapLayer: ${this.id} rendering to float texture not supported, falling back to low precision format`)();
    }
  }
  _createWeightsTransform(shaders) {
    let { weightsTransform } = this.state;
    const { weightsTexture } = this.state;
    const attributeManager = this.getAttributeManager();
    weightsTransform?.destroy();
    weightsTransform = new import_engine2.TextureTransform(this.context.device, {
      id: `${this.id}-weights-transform`,
      ...shaders,
      bufferLayout: attributeManager.getBufferLayouts(),
      vertexCount: 1,
      targetTexture: weightsTexture,
      parameters: {
        depthWriteEnabled: false,
        blend: true,
        blendColorOperation: "add",
        blendColorSrcFactor: "one",
        blendColorDstFactor: "one",
        blendAlphaSrcFactor: "one",
        blendAlphaDstFactor: "one"
      },
      topology: "point-list",
      modules: [...shaders.modules, weightUniforms]
    });
    this.setState({ weightsTransform });
  }
  _setupResources() {
    this._createTextures();
    const { device } = this.context;
    const { textureSize, weightsTexture, maxWeightsTexture } = this.state;
    const weightsTransformShaders = this.getShaders({
      vs: weights_vs_glsl_default,
      fs: weights_fs_glsl_default
    });
    this._createWeightsTransform(weightsTransformShaders);
    const maxWeightsTransformShaders = this.getShaders({
      vs: max_vs_glsl_default,
      fs: max_fs_glsl_default,
      modules: [maxWeightUniforms]
    });
    const maxWeightTransform = new import_engine2.TextureTransform(device, {
      id: `${this.id}-max-weights-transform`,
      targetTexture: maxWeightsTexture,
      ...maxWeightsTransformShaders,
      vertexCount: textureSize * textureSize,
      topology: "point-list",
      parameters: {
        depthWriteEnabled: false,
        blend: true,
        blendColorOperation: "max",
        blendAlphaOperation: "max",
        blendColorSrcFactor: "one",
        blendColorDstFactor: "one",
        blendAlphaSrcFactor: "one",
        blendAlphaDstFactor: "one"
      }
    });
    const maxWeightProps = { inTexture: weightsTexture, textureSize };
    maxWeightTransform.model.shaderInputs.setProps({
      maxWeight: maxWeightProps
    });
    this.setState({
      weightsTexture,
      maxWeightsTexture,
      maxWeightTransform,
      zoom: null,
      triPositionBuffer: device.createBuffer({ byteLength: 48 }),
      triTexCoordBuffer: device.createBuffer({ byteLength: 48 })
    });
  }
  // overwrite super class method to update transform model
  updateShaders(shaderOptions) {
    this._createWeightsTransform({
      vs: weights_vs_glsl_default,
      fs: weights_fs_glsl_default,
      ...shaderOptions
    });
  }
  _updateMaxWeightValue() {
    const { maxWeightTransform } = this.state;
    maxWeightTransform.run({
      parameters: { viewport: [0, 0, 1, 1] },
      clearColor: [0, 0, 0, 0]
    });
  }
  // Computes world bounds area that needs to be processed for generate heatmap
  _updateBounds(forceUpdate = false) {
    const { viewport } = this.context;
    const viewportCorners = [
      viewport.unproject([0, 0]),
      viewport.unproject([viewport.width, 0]),
      viewport.unproject([0, viewport.height]),
      viewport.unproject([viewport.width, viewport.height])
    ].map((p) => p.map(Math.fround));
    const visibleWorldBounds = getBounds(viewportCorners);
    const newState = { visibleWorldBounds, viewportCorners };
    let boundsChanged = false;
    if (forceUpdate || !this.state.worldBounds || !boundsContain(this.state.worldBounds, visibleWorldBounds)) {
      const scaledCommonBounds = this._worldToCommonBounds(visibleWorldBounds);
      const worldBounds = this._commonToWorldBounds(scaledCommonBounds);
      if (this.props.coordinateSystem === "lnglat") {
        worldBounds[1] = Math.max(worldBounds[1], -85.051129);
        worldBounds[3] = Math.min(worldBounds[3], 85.051129);
        worldBounds[0] = Math.max(worldBounds[0], -360);
        worldBounds[2] = Math.min(worldBounds[2], 360);
      }
      const normalizedCommonBounds = this._worldToCommonBounds(worldBounds);
      newState.worldBounds = worldBounds;
      newState.normalizedCommonBounds = normalizedCommonBounds;
      boundsChanged = true;
    }
    this.setState(newState);
    return boundsChanged;
  }
  _updateTextureRenderingBounds() {
    const { triPositionBuffer, triTexCoordBuffer, normalizedCommonBounds, viewportCorners } = this.state;
    const { viewport } = this.context;
    triPositionBuffer.write(packVertices(viewportCorners, 3));
    const textureBounds = viewportCorners.map((p) => getTextureCoordinates(viewport.projectPosition(p), normalizedCommonBounds));
    triTexCoordBuffer.write(packVertices(textureBounds, 2));
  }
  _updateColorTexture(opts) {
    const { colorRange } = opts.props;
    let { colorTexture } = this.state;
    const colors = colorRangeToFlatArray(colorRange, false, Uint8Array);
    colorTexture?.destroy();
    colorTexture = this.context.device.createTexture({
      ...TEXTURE_PROPS,
      data: colors,
      width: colorRange.length,
      height: 1
    });
    this.setState({ colorTexture });
  }
  _updateWeightmap() {
    const { radiusPixels, colorDomain, aggregation } = this.props;
    const { worldBounds, textureSize, weightsScale, weightsTexture } = this.state;
    const weightsTransform = this.state.weightsTransform;
    this.state.isWeightMapDirty = false;
    const commonBounds = this._worldToCommonBounds(worldBounds, {
      useLayerCoordinateSystem: true
    });
    if (colorDomain && aggregation === "SUM") {
      const { viewport: viewport2 } = this.context;
      const metersPerPixel = viewport2.distanceScales.metersPerUnit[2] * (commonBounds[2] - commonBounds[0]) / textureSize;
      this.state.colorDomain = [
        colorDomain[0] * metersPerPixel * weightsScale,
        colorDomain[1] * metersPerPixel * weightsScale
      ];
    } else {
      this.state.colorDomain = colorDomain || DEFAULT_COLOR_DOMAIN;
    }
    const attributeManager = this.getAttributeManager();
    const attributes = attributeManager.getAttributes();
    const moduleSettings = this.getModuleSettings();
    this._setModelAttributes(weightsTransform.model, attributes);
    weightsTransform.model.setVertexCount(this.getNumInstances());
    const weightProps = {
      radiusPixels,
      commonBounds,
      textureWidth: textureSize,
      weightsScale,
      weightsTexture
    };
    const { viewport, devicePixelRatio, coordinateSystem, coordinateOrigin } = moduleSettings;
    const { modelMatrix } = this.props;
    weightsTransform.model.shaderInputs.setProps({
      project: { viewport, devicePixelRatio, modelMatrix, coordinateSystem, coordinateOrigin },
      weight: weightProps
    });
    weightsTransform.run({
      parameters: { viewport: [0, 0, textureSize, textureSize] },
      clearColor: [0, 0, 0, 0]
    });
    this._updateMaxWeightValue();
  }
  _debouncedUpdateWeightmap(fromTimer = false) {
    let { updateTimer } = this.state;
    const { debounceTimeout } = this.props;
    if (fromTimer) {
      updateTimer = null;
      this._updateBounds(true);
      this._updateTextureRenderingBounds();
      this.setState({ isWeightMapDirty: true });
    } else {
      this.setState({ isWeightMapDirty: false });
      clearTimeout(updateTimer);
      updateTimer = setTimeout(this._debouncedUpdateWeightmap.bind(this, true), debounceTimeout);
    }
    this.setState({ updateTimer });
  }
  // input: worldBounds: [minLong, minLat, maxLong, maxLat]
  // input: opts.useLayerCoordinateSystem : layers coordiante system is used
  // optput: commonBounds: [minX, minY, maxX, maxY] scaled to fit the current texture
  _worldToCommonBounds(worldBounds, opts = {}) {
    const { useLayerCoordinateSystem = false } = opts;
    const [minLong, minLat, maxLong, maxLat] = worldBounds;
    const { viewport } = this.context;
    const { textureSize } = this.state;
    const { coordinateSystem } = this.props;
    const offsetMode = useLayerCoordinateSystem && (coordinateSystem === "lnglat-offsets" || coordinateSystem === "meter-offsets");
    const offsetOriginCommon = offsetMode ? viewport.projectPosition(this.props.coordinateOrigin) : [0, 0];
    const size = textureSize * RESOLUTION / viewport.scale;
    let bottomLeftCommon;
    let topRightCommon;
    if (useLayerCoordinateSystem && !offsetMode) {
      bottomLeftCommon = this.projectPosition([minLong, minLat, 0]);
      topRightCommon = this.projectPosition([maxLong, maxLat, 0]);
    } else {
      bottomLeftCommon = viewport.projectPosition([minLong, minLat, 0]);
      topRightCommon = viewport.projectPosition([maxLong, maxLat, 0]);
    }
    return scaleToAspectRatio([
      bottomLeftCommon[0] - offsetOriginCommon[0],
      bottomLeftCommon[1] - offsetOriginCommon[1],
      topRightCommon[0] - offsetOriginCommon[0],
      topRightCommon[1] - offsetOriginCommon[1]
    ], size, size);
  }
  // input commonBounds: [xMin, yMin, xMax, yMax]
  // output worldBounds: [minLong, minLat, maxLong, maxLat]
  _commonToWorldBounds(commonBounds) {
    const [xMin, yMin, xMax, yMax] = commonBounds;
    const { viewport } = this.context;
    const bottomLeftWorld = viewport.unprojectPosition([xMin, yMin]);
    const topRightWorld = viewport.unprojectPosition([xMax, yMax]);
    return bottomLeftWorld.slice(0, 2).concat(topRightWorld.slice(0, 2));
  }
};
HeatmapLayer.layerName = "HeatmapLayer";
HeatmapLayer.defaultProps = defaultProps;
var heatmap_layer_default = HeatmapLayer;

// src/heatmap.ts
var DEFAULT_SETTINGS = {
  intensity: 1,
  radiusPixels: 30,
  opacity: 0.6,
  threshold: 0.05,
  filterTags: null
};
var overlay = null;
var allLocations = [];
var settings = { ...DEFAULT_SETTINGS };
var onSettingsChange = null;
function getSettings() {
  return settings;
}
function getLocationCount() {
  return filterLocations().length;
}
function setOnSettingsChange(cb) {
  onSettingsChange = cb;
}
function updateSettings(patch) {
  settings = { ...settings, ...patch };
  rebuild();
  onSettingsChange?.();
}
function filterLocations() {
  const tags = settings.filterTags;
  if (!tags || tags.size === 0) return allLocations;
  return allLocations.filter((loc) => loc.tags.some((t) => tags.has(t)));
}
function rebuild() {
  if (!overlay) return;
  const data = filterLocations();
  const layer = new heatmap_layer_default({
    id: "mma-heatmap",
    data,
    getPosition: (d) => [d.lng, d.lat],
    getWeight: 1,
    radiusPixels: settings.radiusPixels,
    intensity: settings.intensity,
    threshold: settings.threshold,
    opacity: settings.opacity
  });
  overlay.setProps({ layers: [layer] });
}
async function init() {
  const map = MMA.getGoogleMap();
  if (!map) throw new Error("No map instance");
  allLocations = (await MMA.fetchAllLocations()).map((l) => ({
    lat: l.lat,
    lng: l.lng,
    tags: l.tags
  }));
  overlay = new import_google_maps.GoogleMapsOverlay({ layers: [] });
  overlay.setMap(map);
  rebuild();
  const unsubs = [
    MMA.on("location:add", async () => {
      allLocations = (await MMA.fetchAllLocations()).map((l) => ({
        lat: l.lat,
        lng: l.lng,
        tags: l.tags
      }));
      rebuild();
      onSettingsChange?.();
    }),
    MMA.on("location:remove", async () => {
      allLocations = (await MMA.fetchAllLocations()).map((l) => ({
        lat: l.lat,
        lng: l.lng,
        tags: l.tags
      }));
      rebuild();
      onSettingsChange?.();
    })
  ];
  return () => {
    unsubs.forEach((u) => u());
    if (overlay) {
      overlay.setMap(null);
      overlay.finalize();
      overlay = null;
    }
    allLocations = [];
    settings = { ...DEFAULT_SETTINGS };
    onSettingsChange = null;
  };
}

// src/HeatmapSidebar.tsx
var import_react = __toESM(require_react());
var import_jsx_runtime = __toESM(require_jsx_runtime());
var CSS = `
.heatmap-sidebar { overflow: auto; }
.heatmap-sidebar__header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px; border-bottom: 1px solid var(--color-divider, #333);
}
.heatmap-sidebar__title { margin: 0; font-size: 14px; font-weight: 600; }
.heatmap-sidebar__body {
  padding: 12px; display: flex; flex-direction: column; gap: 12px;
}
.heatmap-sidebar__section {
  border-bottom: 1px solid var(--color-divider, #333);
  padding-bottom: 10px;
}
.heatmap-sidebar__section:last-child { border-bottom: none; padding-bottom: 0; }
.heatmap-sidebar__section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  color: var(--text-secondary, #999); margin: 0 0 6px;
}
.heatmap-sidebar__control {
  display: flex; align-items: center; gap: 8px; padding: 2px 0;
}
.heatmap-sidebar__control label {
  flex: 1; font-size: 13px;
}
.heatmap-sidebar__control input[type="range"] {
  width: 100px;
}
.heatmap-sidebar__control .heatmap-sidebar__value {
  min-width: 36px; text-align: right; font-size: 12px;
  color: var(--text-secondary, #999); font-variant-numeric: tabular-nums;
}
.heatmap-sidebar__tags {
  display: flex; flex-direction: column; gap: 2px;
  max-height: 200px; overflow-y: auto;
}
.heatmap-sidebar__tag {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0; font-size: 13px; cursor: pointer;
}
.heatmap-sidebar__tag-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.heatmap-sidebar__count {
  font-size: 12px; color: var(--text-secondary, #999);
  padding: 4px 0;
}
.heatmap-sidebar__reset {
  font-size: 12px; color: var(--text-secondary, #999);
  background: none; border: none; cursor: pointer; padding: 0;
  text-decoration: underline;
}
.heatmap-sidebar__reset:hover { color: var(--text-primary, #fff); }
`;
var styleEl = null;
function injectCSS() {
  if (styleEl) return;
  styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);
}
function removeCSS() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}
var ARROW_LEFT = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
function Icon({ path, size = 20 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { viewBox: "0 0 24 24", width: size, height: size, fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: path }) });
}
function HeatmapSidebar({ onClose }) {
  const [, rerender] = (0, import_react.useState)(0);
  const s = getSettings();
  const tags = MMA.getCurrentMap()?.meta.tags ?? {};
  (0, import_react.useEffect)(() => {
    injectCSS();
    setOnSettingsChange(() => rerender((n) => n + 1));
    return () => {
      setOnSettingsChange(null);
      removeCSS();
    };
  }, []);
  const setSlider = (0, import_react.useCallback)(
    (key, value) => updateSettings({ [key]: value }),
    []
  );
  const toggleTag = (0, import_react.useCallback)(
    (tagId) => {
      const current = s.filterTags;
      const next = new Set(current ?? []);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      updateSettings({ filterTags: next.size > 0 ? next : null });
    },
    [s.filterTags]
  );
  const clearFilters = (0, import_react.useCallback)(() => {
    updateSettings({ filterTags: null });
  }, []);
  const reset = (0, import_react.useCallback)(() => {
    updateSettings({ ...DEFAULT_SETTINGS });
  }, []);
  const tagEntries = Object.entries(tags).map(([id, tag]) => ({
    id: Number(id),
    name: tag.name,
    color: tag.color
  }));
  const count = getLocationCount();
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "map-sidebar heatmap-sidebar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "heatmap-sidebar__header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "icon-button", onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { path: ARROW_LEFT }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "heatmap-sidebar__title", children: "Heatmap" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "heatmap-sidebar__reset", onClick: reset, children: "Reset" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "heatmap-sidebar__body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "heatmap-sidebar__count", children: [
        count.toLocaleString(),
        " location",
        count !== 1 ? "s" : ""
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "heatmap-sidebar__section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "heatmap-sidebar__section-title", children: "Settings" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Slider,
          {
            label: "Intensity",
            value: s.intensity,
            min: 0.1,
            max: 10,
            step: 0.1,
            onChange: (v) => setSlider("intensity", v)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Slider,
          {
            label: "Radius",
            value: s.radiusPixels,
            min: 1,
            max: 100,
            step: 1,
            onChange: (v) => setSlider("radiusPixels", v),
            format: (v) => `${v}px`
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Slider,
          {
            label: "Opacity",
            value: s.opacity,
            min: 0,
            max: 1,
            step: 0.05,
            onChange: (v) => setSlider("opacity", v)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          Slider,
          {
            label: "Threshold",
            value: s.threshold,
            min: 0,
            max: 1,
            step: 0.01,
            onChange: (v) => setSlider("threshold", v)
          }
        )
      ] }),
      tagEntries.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "heatmap-sidebar__section", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "heatmap-sidebar__section-title", children: [
          "Filter by tag",
          s.filterTags && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "heatmap-sidebar__reset", onClick: clearFilters, children: "clear" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "heatmap-sidebar__tags", children: tagEntries.map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "heatmap-sidebar__tag", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              checked: s.filterTags?.has(tag.id) ?? false,
              onChange: () => toggleTag(tag.id)
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              className: "heatmap-sidebar__tag-dot",
              style: { background: tag.color }
            }
          ),
          tag.name
        ] }, tag.id)) })
      ] })
    ] })
  ] });
}
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format
}) {
  const display = format ? format(value) : String(Math.round(value * 100) / 100);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "heatmap-sidebar__control", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        type: "range",
        min,
        max,
        step,
        value,
        onChange: (e) => onChange(Number(e.target.value))
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "heatmap-sidebar__value", children: display })
  ] });
}

// src/index.tsx
MMA.registerPlugin({
  activate() {
    let cancelled = false;
    let teardown = null;
    (async () => {
      if (cancelled) return;
      teardown = await init();
    })();
    return () => {
      cancelled = true;
      teardown?.();
    };
  },
  sidebar: HeatmapSidebar
});
