import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { CustomUniforms, SharedUniforms } from "../lib/uniforms";

const VERT = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

interface DrawState {
  program: WebGLProgram;
  uniformLocations: Map<string, WebGLUniformLocation | null>;
}

interface Props {
  code: string;
  uniformsRef: RefObject<SharedUniforms & CustomUniforms>;
  customUniformNames?: string[];
  onFrame?: (canvas: HTMLCanvasElement) => void;
  onError?: (error: string | null) => void;
}

export default function Preview({
  code,
  uniformsRef,
  customUniformNames,
  onFrame,
  onError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onFrameRef = useRef(onFrame);
  const drawRef = useRef<DrawState | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  // persistent render loop — always runs, always calls onFrame
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2");
    if (!gl) return;

    // fullscreen quad — two triangles covering clip space
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const observer = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);
    });
    observer.observe(canvas);

    let raf: number;

    function render() {
      if (!gl) return;

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);

      const draw = drawRef.current;
      if (!draw) return;

      const u = uniformsRef.current;
      const locs = draw.uniformLocations;

      gl.uniform2f(locs.get("u_resolution")!, canvas.width, canvas.height);
      gl.uniform1f(locs.get("u_time")!, u.u_time);
      gl.uniform1i(locs.get("u_frame")!, u.u_frame);
      gl.uniform3f(
        locs.get("u_bands")!,
        u.u_bands[0],
        u.u_bands[1],
        u.u_bands[2],
      );
      gl.uniform1f(locs.get("u_beat")!, u.u_beat);

      // Set custom uniforms
      for (const name of customUniformNames || []) {
        const value = u[name];
        if (value !== undefined) {
          gl.uniform1f(locs.get(name)!, value);
        }
      }
      onFrameRef.current?.(canvas);
    }

    render();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      gl.deleteBuffer(buf);
    };
  }, [uniformsRef, canvasRef, customUniformNames]);

  // recompile when code changes — updates drawRef if successful
  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2");
    if (!gl) return;

    function compile(type: number, src: string) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
        const log = gl!.getShaderInfoLog(shader);
        gl!.deleteShader(shader);
        return { shader: null, error: log };
      }
      return { shader, error: null };
    }

    const customUniformDeclarations = (customUniformNames || [])
      .map((name) => `uniform float ${name};`)
      .join("\n");

    const fragPrefix = `#version 300 es
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;
    uniform int u_frame;
    uniform vec3 u_bands;
    uniform float u_beat;
    ${customUniformDeclarations}

    out vec4 fragColor;

    `;

    const { shader: vert, error: vertError } = compile(gl.VERTEX_SHADER, VERT);
    const { shader: frag, error: fragError } = compile(
      gl.FRAGMENT_SHADER,
      fragPrefix + code,
    );

    if (!vert || !frag) {
      onError?.(vertError ?? fragError);
      return;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      onError?.(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    onError?.(null);
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const prev = drawRef.current;

    const uniformLocations = new Map<string, WebGLUniformLocation | null>();
    uniformLocations.set(
      "u_resolution",
      gl.getUniformLocation(program, "u_resolution"),
    );
    uniformLocations.set("u_time", gl.getUniformLocation(program, "u_time"));
    uniformLocations.set("u_frame", gl.getUniformLocation(program, "u_frame"));
    uniformLocations.set("u_bands", gl.getUniformLocation(program, "u_bands"));
    uniformLocations.set("u_beat", gl.getUniformLocation(program, "u_beat"));

    // Add custom uniforms
    for (const name of customUniformNames || []) {
      uniformLocations.set(name, gl.getUniformLocation(program, name));
    }

    drawRef.current = { program, uniformLocations };

    if (prev) gl.deleteProgram(prev.program);
  }, [code, customUniformNames, onError]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        backgroundColor: "black",
      }}
    />
  );
}
