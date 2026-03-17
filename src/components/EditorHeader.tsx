import { useEffect, useState, type RefObject } from "react";
import { initializeSharedUniforms, type SharedUniforms } from "../lib/uniforms";

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

  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "0.2rem 0.5rem",
      }}
    >
      <span>satchel</span>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          fontSize: "var(--text-sm)",
        }}
      >
        <span>u_time {uniforms.u_time.toFixed(2)}</span>
        <span>u_frame {uniforms.u_frame}</span>
        <span>
          u_bands {uniforms.u_bands.map((b) => b.toFixed(2)).join(" / ")}
        </span>
      </div>
    </header>
  );
}
