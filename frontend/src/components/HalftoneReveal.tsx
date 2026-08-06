import { Mesh, Program, Renderer, Texture, Triangle } from "ogl";
import { type CSSProperties, useEffect, useRef } from "react";

type HalftoneMode = "mono" | "duotone" | "color";
type HalftoneShape = "circle" | "square" | "diamond" | "line";
type HalftoneTrigger = "off" | "hover" | "always";

type HalftoneRevealProps = {
  src: string;
  inkColor?: string;
  paperColor?: string;
  mode?: HalftoneMode;
  dotSize?: number;
  dotDensity?: number;
  angle?: number;
  shape?: HalftoneShape;
  contrast?: number;
  invert?: boolean;
  revealRadius?: number;
  edge?: number;
  follow?: number;
  idleReveal?: number;
  trigger?: HalftoneTrigger;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
};

type Uniforms = Record<string, { value: any }>;

const hexToRgb = (hex: string) => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match
    ? [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255]
    : [0, 0, 0];
};

const MODES: Record<HalftoneMode, number> = { mono: 0, duotone: 1, color: 2 };
const SHAPES: Record<HalftoneShape, number> = { circle: 0, square: 1, diamond: 2, line: 3 };
const TRIGGERS: Record<HalftoneTrigger, number> = { off: 0, hover: 1, always: 2 };

const vertex = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform vec2 iResolution;
uniform vec2 uImageSize;
uniform vec2 uMouse;
uniform float uActivity;
uniform float uDotSize;
uniform float uDensity;
uniform float uAngle;
uniform int uShape;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform int uMode;
uniform float uContrast;
uniform float uInvert;
uniform float uRevealRadius;
uniform float uEdge;
uniform float uIdleReveal;
uniform int uTrigger;

in vec2 vUv;
out vec4 fragColor;

vec2 uAspect() {
  return vec2(iResolution.x / max(iResolution.y, 1.0), 1.0);
}

vec2 coverUv(vec2 uv) {
  float ia = uImageSize.x / max(uImageSize.y, 1.0);
  float pa = iResolution.x / max(iResolution.y, 1.0);
  vec2 s = pa > ia ? vec2(1.0, ia / pa) : vec2(pa / ia, 1.0);
  return (uv - 0.5) * s + 0.5;
}

vec3 gradeRGB(vec3 c) {
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  return mix(c, 1.0 - c, uInvert);
}

float shapeDist(vec2 f) {
  if (uShape == 1) return max(abs(f.x), abs(f.y));
  if (uShape == 2) return abs(f.x) + abs(f.y);
  if (uShape == 3) return abs(f.y);
  return length(f);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec4 sampleCell(vec2 st, float dens, float ang) {
  vec2 rp = rot(ang) * st * dens;
  vec2 center = floor(rp) + 0.5;
  vec2 stC = rot(-ang) * (center / dens);
  vec2 uvC = stC / uAspect();
  return texture(tMap, clamp(coverUv(uvC), 0.0, 1.0));
}

float coverage(vec2 st, float dens, float ang, float ink, float rscale) {
  vec2 rp = rot(ang) * st * dens;
  vec2 f = fract(rp) - 0.5;
  float d = shapeDist(f);
  float r = sqrt(clamp(ink, 0.0, 1.0)) * 0.72 * rscale * uDotSize;
  float w = length(fwidth(rp)) * 0.6 + 1e-4;
  return smoothstep(r + w, r - w, d);
}

void main() {
  vec2 aspect = uAspect();
  vec2 st = vUv * aspect;
  float ang = radians(uAngle);
  vec2 duv = (vUv - uMouse) * aspect;
  float dist = length(duv);
  float act = uTrigger == 2 ? 1.0 : (uTrigger == 0 ? 0.0 : uActivity);
  float radius = max(uRevealRadius, 1e-4) * mix(0.4, 1.0, act);
  float px = 1.4 / max(iResolution.y, 1.0);
  float band = max(px, radius * (1.0 - clamp(uEdge, 0.0, 1.0)) * 0.45);
  float loupe = 1.0 - smoothstep(radius - band, radius + band, dist);
  float focus = clamp(max(loupe * act, uIdleReveal), 0.0, 1.0);
  float dens = uDensity;

  vec3 print;
  if (uMode == 2) {
    vec3 gc = gradeRGB(sampleCell(st, dens, ang + radians(15.0)).rgb);
    vec3 gm = gradeRGB(sampleCell(st, dens, ang + radians(75.0)).rgb);
    vec3 gy = gradeRGB(sampleCell(st, dens, ang).rgb);
    vec3 gk = gradeRGB(sampleCell(st, dens, ang + radians(45.0)).rgb);
    float c = 1.0 - gc.r;
    float m = 1.0 - gm.g;
    float y = 1.0 - gy.b;
    float k = 1.0 - dot(gk, vec3(0.299, 0.587, 0.114));
    float gcr = min(min(c, m), y) * 0.5;
    c = clamp(c - gcr, 0.0, 1.0);
    m = clamp(m - gcr, 0.0, 1.0);
    y = clamp(y - gcr, 0.0, 1.0);
    k = clamp(max(gcr, k * k * 0.9), 0.0, 1.0);
    float covC = coverage(st, dens, ang + radians(15.0), c, 0.82);
    float covM = coverage(st, dens, ang + radians(75.0), m, 0.82);
    float covY = coverage(st, dens, ang, y, 0.82);
    float covK = coverage(st, dens, ang + radians(45.0), k, 0.78);
    print = uPaper;
    print = mix(print, print * vec3(0.10, 0.72, 0.90), covC);
    print = mix(print, print * vec3(0.92, 0.10, 0.52), covM);
    print = mix(print, print * vec3(0.98, 0.86, 0.10), covY);
    print = mix(print, print * vec3(0.08), covK);
  } else if (uMode == 1) {
    vec3 ink2 = mix(uInk.gbr, vec3(0.90, 0.24, 0.30), 0.7);
    float lumA = dot(gradeRGB(sampleCell(st, dens, ang).rgb), vec3(0.299, 0.587, 0.114));
    float lumB = dot(gradeRGB(sampleCell(st, dens, ang + radians(38.0)).rgb), vec3(0.299, 0.587, 0.114));
    float covA = coverage(st, dens, ang, 1.0 - lumA, 1.0);
    float covB = coverage(st, dens, ang + radians(38.0), pow(1.0 - lumB, 1.4), 0.92);
    print = uPaper;
    print = mix(print, ink2, covB * 0.85);
    print = mix(print, uInk, covA);
  } else {
    float lum = dot(gradeRGB(sampleCell(st, dens, ang).rgb), vec3(0.299, 0.587, 0.114));
    float cov = coverage(st, dens, ang, 1.0 - lum, 1.0);
    print = mix(uPaper, uInk, cov);
  }

  float t = clamp(dist / radius, 0.0, 1.0);
  float bend = t * t * t * t;
  vec2 dir = dist > 1e-5 ? duv / dist : vec2(0.0);
  vec2 off = dir * bend * radius * 0.22 / aspect;
  vec2 ca = dir * bend * 0.0045 / aspect;
  vec3 sharp = gradeRGB(vec3(
    texture(tMap, clamp(coverUv(vUv - off - ca), 0.0, 1.0)).r,
    texture(tMap, clamp(coverUv(vUv - off), 0.0, 1.0)).g,
    texture(tMap, clamp(coverUv(vUv - off + ca), 0.0, 1.0)).b
  ));

  fragColor = vec4(mix(print, sharp, focus), 1.0);
}
`;

export function HalftoneReveal({
  src,
  inkColor = "#140205",
  paperColor = "#8f0c1d",
  mode = "mono",
  dotSize = 0.92,
  dotDensity = 88,
  angle = -18,
  shape = "circle",
  contrast = 1.18,
  invert = false,
  revealRadius = 0.28,
  edge = 0.72,
  follow = 0.28,
  idleReveal = 0.035,
  trigger = "hover",
  borderRadius = "0",
  className = "",
  style,
}: HalftoneRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<Uniforms | null>(null);
  const rafRef = useRef<number | null>(null);
  const staticRef = useRef(false);
  const followRef = useRef(follow);
  const mouseRef = useRef({ x: 0.5, y: 0.5, sx: 0.5, sy: 0.5, active: 0, target: 0 });

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const staticMode =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    staticRef.current = staticMode;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        dpr: staticMode ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
        alpha: false,
        antialias: true,
      });
    } catch {
      container.dataset.fallback = "true";
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    gl.canvas.style.display = "block";
    container.appendChild(gl.canvas);

    const texture = new Texture(gl, { generateMipmaps: false });
    const uniforms: Uniforms = {
      tMap: { value: texture },
      iResolution: { value: [1, 1] },
      uImageSize: { value: [1, 1] },
      uMouse: { value: [0.5, 0.5] },
      uActivity: { value: 0 },
      uDotSize: { value: dotSize },
      uDensity: { value: dotDensity },
      uAngle: { value: angle },
      uShape: { value: SHAPES[shape] },
      uInk: { value: hexToRgb(inkColor) },
      uPaper: { value: hexToRgb(paperColor) },
      uMode: { value: MODES[mode] },
      uContrast: { value: contrast },
      uInvert: { value: invert ? 1 : 0 },
      uRevealRadius: { value: revealRadius },
      uEdge: { value: edge },
      uIdleReveal: { value: idleReveal },
      uTrigger: { value: staticMode ? TRIGGERS.off : TRIGGERS[trigger] },
    };
    uniformsRef.current = uniforms;

    const program = new Program(gl, { vertex, fragment, uniforms });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const render = () => renderer.render({ scene: mesh });

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height);
      uniforms.iResolution.value = [gl.canvas.width, gl.canvas.height];
      if (staticMode) render();
    };

    const image = new Image();
    image.src = src;
    image.onload = () => {
      texture.image = image;
      uniforms.uImageSize.value = [image.naturalWidth, image.naturalHeight];
      render();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const onMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = (event.clientX - rect.left) / rect.width;
      mouseRef.current.y = 1 - (event.clientY - rect.top) / rect.height;
      mouseRef.current.target = 1;
    };
    const onLeave = () => {
      mouseRef.current.target = 0;
    };

    const interactionTarget = container.parentElement ?? container;
    if (!staticMode) {
      interactionTarget.addEventListener("pointermove", onMove, { passive: true });
      interactionTarget.addEventListener("pointerenter", onMove, { passive: true });
      interactionTarget.addEventListener("pointerleave", onLeave, { passive: true });

      let previous = performance.now();
      const loop = (now: number) => {
        rafRef.current = requestAnimationFrame(loop);
        const delta = Math.min(0.05, Math.max(0.001, (now - previous) / 1000));
        previous = now;
        const mouse = mouseRef.current;
        const followAmount = 1 - Math.exp(-delta / Math.max(0.001, followRef.current));
        mouse.sx += (mouse.x - mouse.sx) * followAmount;
        mouse.sy += (mouse.y - mouse.sy) * followAmount;
        const activityAmount = 1 - Math.exp(-delta / 0.18);
        mouse.active += (mouse.target - mouse.active) * activityAmount;
        uniforms.uMouse.value[0] = mouse.sx;
        uniforms.uMouse.value[1] = mouse.sy;
        uniforms.uActivity.value = mouse.active;
        render();
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      interactionTarget.removeEventListener("pointermove", onMove);
      interactionTarget.removeEventListener("pointerenter", onMove);
      interactionTarget.removeEventListener("pointerleave", onLeave);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      gl.canvas.remove();
      uniformsRef.current = null;
    };
    // The live props are written into the existing uniforms below. Rebuilding
    // the WebGL context is only necessary when the source image changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    uniforms.uDotSize.value = dotSize;
    uniforms.uDensity.value = dotDensity;
    uniforms.uAngle.value = angle;
    uniforms.uShape.value = SHAPES[shape];
    uniforms.uInk.value = hexToRgb(inkColor);
    uniforms.uPaper.value = hexToRgb(paperColor);
    uniforms.uMode.value = MODES[mode];
    uniforms.uContrast.value = contrast;
    uniforms.uInvert.value = invert ? 1 : 0;
    uniforms.uRevealRadius.value = revealRadius;
    uniforms.uEdge.value = edge;
    uniforms.uIdleReveal.value = idleReveal;
    uniforms.uTrigger.value = staticRef.current ? TRIGGERS.off : TRIGGERS[trigger];
  }, [angle, contrast, dotDensity, dotSize, edge, idleReveal, inkColor, invert, mode, paperColor, revealRadius, shape, trigger]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`halftone-reveal ${className}`.trim()}
      style={{ backgroundImage: `url(${src})`, borderRadius, ...style }}
    />
  );
}
