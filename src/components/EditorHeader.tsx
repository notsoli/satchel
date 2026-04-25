import { useEffect, useState, type RefObject } from "react";
import {
  initializeSharedUniforms,
  type CustomUniforms,
  type SharedUniforms,
} from "../lib/uniforms";
import Analyzer from "./Analyzer";

export default function EditorHeader({
  uniformsRef,
  mode,
  setMode,
}: {
  uniformsRef: RefObject<SharedUniforms>;
  mode: "shader" | "process";
  setMode: (mode: "shader" | "process") => void;
}) {
  const [uniforms, setUniforms] = useState(initializeSharedUniforms());

  useEffect(() => {
    let raf: number;
    function tick() {
      raf = requestAnimationFrame(tick);
      setUniforms({ ...uniformsRef.current } as SharedUniforms &
        CustomUniforms);
    }
    tick();
    return () => cancelAnimationFrame(raf);
  }, [uniformsRef]);

  function onUpdate(result: {
    u_bands: [number, number, number];
    u_beat: number;
  }) {
    const uniforms = uniformsRef.current;
    uniforms.u_bands = result.u_bands;
    uniforms.u_beat = result.u_beat;
  }

  return (
    <header
      style={{
        display: "flex",
        gap: "1rem",
        padding: "0.2rem 0.5rem",
      }}
    >
      <span>satchel</span>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => setMode("shader")}
          className="linkButton"
          style={{
            color: mode === "shader" ? "var(--accent)" : "var(--text-subtle)",
          }}
        >
          shader
        </button>
        <button
          onClick={() => setMode("process")}
          className="linkButton"
          style={{
            color: mode === "process" ? "var(--accent)" : "var(--text-subtle)",
          }}
        >
          process
        </button>
      </div>
      <button
        popoverTarget="options-popover"
        className="linkButton"
        style={{ marginLeft: "0.5rem" }}
      >
        options
      </button>
      <a
        href="/view/"
        target="_blank"
        style={{ marginLeft: "auto", color: "var(--accent)" }}
      >
        view
      </a>{" "}
      <button popoverTarget="save-popover" className="linkButton">
        save
      </button>
      <button popoverTarget="load-popover" className="linkButton">
        load
      </button>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          fontSize: "var(--text-sm)",
          color: "var(--text-subtle)",
        }}
      >
        <span>
          u_time:
          <span style={{ color: "var(--text)", marginLeft: "0.25rem" }}>
            {uniforms.u_time.toFixed(2)}
          </span>
        </span>
        <span>
          u_frame:
          <span style={{ color: "var(--text)", marginLeft: "0.25rem" }}>
            {uniforms.u_frame}
          </span>
        </span>
        <span style={{ display: "flex", gap: "0.25rem" }}>
          levels:
          <div
            style={{
              display: "flex",
              gap: "0.25rem",
              alignItems: "flex-end",
            }}
          >
            {uniforms.u_bands.map((band, i) => (
              <div
                key={i}
                style={{
                  width: "10px",
                  height: 1 + 19 * band + "px",
                  backgroundColor: "var(--accent)",
                }}
              />
            ))}
          </div>
        </span>
      </div>
      <Analyzer onUpdate={onUpdate} uniformsRef={uniformsRef} />
    </header>
  );
}
