import { useEffect, useRef, useState } from "react";
import Preview from "./Preview";
import { initializeSharedUniforms } from "../lib/uniforms";
import { createReceiver } from "../lib/channel";
import { defaultOptions } from "../lib/options";

const testShader = `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, abs(sin(u_time)), 1.0);
}`;

export default function Viewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef(initializeSharedUniforms());
  const [code, setCode] = useState(testShader);
  const [options, setOptions] = useState({ ...defaultOptions });
  const [customUniformNames, setCustomUniformNames] = useState<string[]>([]);
  const [hasSender, setHasSender] = useState(false);

  useEffect(() => {
    const receiver = createReceiver((msg) => {
      setHasSender(true);
      if (msg.type === "shader") setCode(msg.code);
      if (msg.type === "uniforms") uniformsRef.current = msg.uniforms;
      if (msg.type === "customUniformNames") setCustomUniformNames(msg.names);
      if (msg.type === "options") setOptions(msg.options);
    });
    return () => {
      receiver.close();
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(() => {
      //
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  if (!hasSender)
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2rem",
        }}
      >
        <p>Edit a shader in another window to view it here.</p>
      </div>
    );

  return (
    <div
      ref={containerRef}
      style={{ width: "100vw", height: "100vh", position: "relative" }}
    >
      <Preview
        code={code}
        uniformsRef={uniformsRef}
        customUniformNames={customUniformNames}
      />
      {options.show_code_overlay && (
        <pre
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            padding: "1rem",
          }}
        >
          <mark
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              color: "white",
            }}
          >
            {code}
          </mark>
        </pre>
      )}
    </div>
  );
}
