// Shaders for the tapestry, from the prototype, retuned for the daylight redesign
// (brighter yarn lighting, livelier silent threads and preview bars).
// Each crossing of a warp thread and a weft pick is one texel of a data
// texture; the fragment shader draws the yarns, their twist and sheen.

export const TAP_VS = `varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

export const TAP_FS = `
uniform sampler2D uTex; uniform float uRows; uniform float uFell; uniform float uScroll;
uniform vec3 uPal[12]; uniform vec3 uBg; uniform vec3 uWarp; uniform vec3 uWarp2; uniform vec3 uCam;
varying vec3 vW;
const float PICK = 0.08; const float CELL = 0.1; const float COLS = 96.0;
const vec3 LIGHT = vec3(-0.42, 0.5, 0.76);          // cloth-local: x right, y away from the weaver, z up
vec4 cellAt(float c, float r){
  if (r < 0.0 || r >= uRows || c < 0.0 || c >= COLS) return vec4(0.0);
  return floor(texture2D(uTex, vec2((c + 0.5) / COLS, (r + 0.5) / uRows)) * 255.0 + 0.5);
}
vec3 palette(float i){ vec3 c = uPal[0]; for (int j = 0; j < 12; j++) { if (abs(float(j) - i) < 0.5) c = uPal[j]; } return c; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
bool is(float v, float k){ return abs(v - k) < 0.5; }
// one round, twisted yarn. across: -1..1 across its width; along: runs with it; T: its direction
vec3 yarn(vec3 base, float across, float along, vec3 T, vec3 V, float seed, float detail, float sheen){
  float prof = sqrt(max(0.0, 1.0 - across * across));
  vec3 side = T.x > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 n = normalize(side * across + vec3(0.0, 0.0, 1.0) * prof);
  vec3 l = normalize(LIGHT);
  float diff = 0.36 + 0.64 * max(dot(n, l), 0.0);
  float twist = sin(6.2831 * (along * 3.0 + across * 0.7) + seed * 6.2831);
  float fibre = 1.0 + detail * (0.08 * twist + 0.06 * (hash(vec2(floor(along * 12.0), floor(across * 3.0) + seed)) - 0.5));
  vec3 h = normalize(l + V);
  float th = dot(T, h);
  float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 26.0) * sheen * prof;
  return base * diff * fibre + vec3(spec);
}
void main(){
  vec3 V = normalize(vec3(uCam.x - vW.x, vW.z - uCam.z, uCam.y - vW.y));
  float c = (vW.x + COLS * CELL * 0.5) / CELL;
  float d = (uFell - vW.z) / PICK;                  // picks from the weaving edge; positive is woven cloth
  float r = d + uScroll;
  float fw = max(fwidth(c), fwidth(d));
  float detail = 1.0 - smoothstep(0.22, 0.7, fw);
  vec3 gap = uBg * 0.5;
  vec3 col; vec3 flatC;
  if (c < 0.0 || c >= COLS) { col = uBg; flatC = uBg; }
  else {
    float ci = floor(c), fx = fract(c);
    float wa = (fx - 0.5) / 0.36;
    vec3 warpC = mod(ci, 24.0) < 0.5 ? uWarp2 : uWarp;
    float rowi = floor(r), fy = fract(r);
    vec4 t = d < 0.0 ? vec4(0.0) : cellAt(ci, rowi);
    if (t.g < 0.5) {                                 // bare warp, waiting to be woven
      col = abs(wa) < 1.0 ? yarn(warpC, wa, d * 0.8, vec3(0.0, 1.0, 0.0), V, ci * 0.37, detail, 0.12) : gap;
      flatC = mix(warpC * 0.8, gap, 0.3);
    } else {
      float flags = t.b;
      bool ghost = mod(floor(flags / 4.0), 2.0) > 0.5;
      bool muted = mod(floor(flags / 8.0), 2.0) > 0.5;
      float par = mod(floor(flags / 16.0), 2.0);
      bool fl = t.g > 2.5;
      vec3 base = palette(t.r);
      if (muted) base = mix(base, uPal[0], 0.5);   // a silent layer: its thread, woven quietly
      else if (!fl) base = mix(base, uPal[0], 0.42);   // between hits: a softer tint, so each hit stands out in full colour
      if (fl) base = mix(base, vec3(1.0), t.a / 255.0 * 0.4); // sounding: full colour, paler for higher notes
      // weft-faced tapestry: each pick is a round yarn packed tight, rising over every other warp,
      // with neighbouring picks offset by one warp. That offset makes the pebbled rib of tapestry.
      float ang = 6.2831 * (fx + 0.5 * par);
      float und = cos(ang);
      float across = (fy - 0.5) / 0.5;
      float prof = sqrt(max(0.0, 1.0 - across * across));
      vec3 n = normalize(vec3(-sin(ang) * 0.5 * detail, across * 0.95, prof + 0.05));
      vec3 l = normalize(LIGHT);
      float diff = 0.5 + 0.5 * max(dot(n, l), 0.0);
      float twist = sin(6.2831 * (c * 2.0 + across * 0.8) + rowi * 1.7);
      float fibre = 1.0 + detail * (0.07 * twist + 0.05 * (hash(vec2(floor(c * 8.0), rowi)) - 0.5));
      vec3 h = normalize(l + V);
      float th = h.x;
      float spec = pow(sqrt(max(0.0, 1.0 - th * th)), 22.0) * (fl ? 0.5 : 0.16) * prof * (0.6 + 0.4 * und);
      col = base * diff * fibre * (0.86 + 0.14 * und * detail) + vec3(spec);
      if (fl) col *= 1.12; else col *= 0.96 + 0.1 * (t.a / 255.0);   // small dye-lot variation from yarn to yarn
      // where a sounding thread starts or stops, the weft turns around a warp and leaves a small slit
      if (fl && mod(flags, 2.0) > 0.5) col *= mix(0.45, 1.0, smoothstep(0.0, 0.09, fx));
      if (fl && mod(floor(flags / 2.0), 2.0) > 0.5) col *= mix(0.45, 1.0, smoothstep(0.0, 0.09, 1.0 - fx));
      flatC = base * 0.82;
      if (!fl && cellAt(ci, rowi + 1.0).g > 2.5) {        // a raised thread just beyond casts a soft shadow
        float sh = 1.0 - 0.3 * smoothstep(0.35, 1.0, fy);
        col *= sh; flatC *= sh;
      }
      if (ghost) { col = mix(col, uBg, 0.32); flatC = mix(flatC, uBg, 0.32); }
    }
    col = mix(flatC, col, detail);
  }
  col = mix(col, uBg, smoothstep(16.0, 36.0, distance(uCam, vW)) * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;
