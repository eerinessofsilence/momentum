import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";

type SpecularRimProps = {
  radius?: number;
  lineColor?: string;
  baseColor?: string;
  intensity?: number;
  shineSize?: number;
  shineFade?: number;
  thickness?: number;
  speed?: number;
  proximity?: number;
  autoAnimate?: boolean;
  className?: string;
};

const PADDING = 20;

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float roundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 offset = abs(point) - halfSize + radius;
  return length(max(offset, 0.0)) + min(max(offset.x, offset.y), 0.0) - radius;
}

float gaussianLine(float distance, float sigma) {
  float value = distance / (sigma + 1e-6);
  float falloff = mix(1.0, 1.6, smoothstep(0.0, 1.5, value));
  return exp(-falloff * value * value);
}

void main() {
  vec2 point = gl_FragCoord.xy - uCenter;
  float distance = roundedRect(point, uHalfSize, uRadius);
  vec2 light = vec2(cos(uAngle), sin(uAngle));
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(distance))) * 0.38;
  vec2 normal = normalize(point / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(normal, light)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(distance, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(distance));
  float highlight = line * rim * edgeClamp * uIntensity;
  vec3 color = uBaseColor * base + uLineColor * highlight;
  fragColor = vec4(color, clamp(base + highlight, 0.0, 1.0));
}
`;

export function SpecularRim({
  radius = 16,
  lineColor = "#ff909b",
  baseColor = "#7d2730",
  intensity = 0.6,
  shineSize = 6,
  shineFade = 30,
  thickness = 0.75,
  speed = 0.28,
  proximity = 105,
  autoAnimate = false,
  className = "",
}: SpecularRimProps) {
  const effectRef = useRef<HTMLSpanElement>(null);
  const propsRef = useRef({
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    proximity,
    autoAnimate,
  });

  propsRef.current = {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    proximity,
    autoAnimate,
  };

  useEffect(() => {
    const effect = effectRef.current;
    const target = effect?.parentElement;
    if (!effect || !target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr });
    } catch {
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.56, 0.17, 0.21] },
        uIntensity: { value: 0 },
        uShineSize: { value: 0.16 },
        uShineFade: { value: 0.66 },
        uThickness: { value: dpr },
        uBaseWidth: { value: dpr },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    effect.appendChild(gl.canvas);

    const size = { width: 1, height: 1 };
    const resize = () => {
      const rect = target.getBoundingClientRect();
      size.width = rect.width;
      size.height = rect.height;
      renderer.setSize(rect.width + PADDING * 2, rect.height + PADDING * 2);
      program.uniforms.uCenter.value = [
        (PADDING + rect.width / 2) * dpr,
        (PADDING + rect.height / 2) * dpr,
      ];
      program.uniforms.uHalfSize.value = [(rect.width / 2) * dpr, (rect.height / 2) * dpr];
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(target);
    resize();

    let pointerAngle: number | null = null;
    let proximityAmount = 0;
    const onPointerMove = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const deltaY = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const distance = Math.hypot(deltaX, deltaY);

      if (distance === 0) {
        const normalizedX = (event.clientX - centerX) / (rect.width / 2);
        const normalizedY = (centerY - event.clientY) / (rect.height / 2);
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + normalizedX * 0.3 + normalizedY * 0.15;
      } else {
        pointerAngle = Math.atan2(centerY - event.clientY, event.clientX - centerX);
      }

      const proximityValue = Math.max(0, 1 - distance / Math.max(propsRef.current.proximity, 1));
      proximityAmount = proximityValue * proximityValue * (3 - 2 * proximityValue);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let angle = 2.4;
    let idleAngle = 2.4;
    let brightness = 0;
    let previous = performance.now();
    let frame = 0;
    const line = new Color();
    const base = new Color();

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const settings = propsRef.current;
      idleAngle += settings.speed * delta;
      const followsPointer = pointerAngle !== null && (!settings.autoAnimate || proximityAmount > 0);
      const targetAngle = followsPointer ? pointerAngle! : idleAngle;
      const angleDifference = ((targetAngle - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      angle += angleDifference * (1 - Math.exp(-delta * 7));
      const brightnessTarget = settings.autoAnimate ? 1 : proximityAmount;
      brightness += (brightnessTarget - brightness) * (1 - Math.exp(-delta * 8));

      line.set(settings.lineColor);
      base.set(settings.baseColor);
      program.uniforms.uAngle.value = angle;
      program.uniforms.uRadius.value = Math.min(settings.radius, Math.min(size.width, size.height) / 2) * dpr;
      program.uniforms.uLineColor.value = [line.r, line.g, line.b];
      program.uniforms.uBaseColor.value = [base.r, base.g, base.b];
      program.uniforms.uIntensity.value = settings.intensity * brightness;
      program.uniforms.uShineSize.value = (settings.shineSize * Math.PI) / 180;
      program.uniforms.uShineFade.value = (settings.shineFade * Math.PI) / 180;
      program.uniforms.uThickness.value = settings.thickness * dpr;
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      gl.canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <span ref={effectRef} className={`specular-rim ${className}`.trim()} aria-hidden="true" />;
}
