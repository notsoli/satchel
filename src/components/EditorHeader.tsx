import { useEffect, useState, type RefObject } from "react";
import { initializeSharedUniforms, type SharedUniforms } from "../lib/uniforms";
import Analyzer from "./Analyzer";

export default function EditorHeader({
  uniformsRef,
}: {
  uniformsRef: RefObject<SharedUniforms>;
}) {
  const [uniforms, setUniforms] = useState(initializeSharedUniforms());

  useEffect(() => {
    let raf: number;
    function tick() {
      raf = requestAnimationFrame(tick);
      setUniforms({ ...uniformsRef.current });
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
      <span style={{ marginRight: "auto" }}>satchel</span>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          fontSize: "var(--text-sm)",
        }}
      >
        <span>u_time {uniforms.u_time.toFixed(2)}</span>
        <span>u_frame {uniforms.u_frame}</span>
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
                width: "20px",
                height: 2 + 18 * band + "px",
                backgroundColor: "lightblue",
              }}
            />
          ))}
        </div>
      </div>
      <Analyzer onUpdate={onUpdate} uniformsRef={uniformsRef} />
    </header>
  );
}
