import { useRef, useState, type RefObject } from "react";
import type { CustomUniforms, SharedUniforms } from "../lib/uniforms";
import Preview from "./Preview";
import { saveShader } from "../lib/persistence";

export default function Save({
  uniformsRef,
  getCode,
}: {
  uniformsRef: RefObject<SharedUniforms & CustomUniforms>;
  getCode: () => string;
}) {
  const [name, setName] = useState(new Date().toISOString());
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  function triggerSave() {
    savedRef.current = false;
    setCode(getCode());
  }

  function save(canvas: HTMLCanvasElement) {
    if (saving || savedRef.current) return;
    if (!canvas || canvas.width !== 100 || canvas.height !== 100) return;

    savedRef.current = true;
    setSaving(true);

    canvas.toBlob(async (preview) => {
      if (!preview) return;
      const code = getCode();

      await saveShader(code, preview, name);

      setCode("");
      setSaving(false);
      popoverRef.current?.hidePopover();
    });
  }
  return (
    <div
      ref={popoverRef}
      id="save-popover"
      popover="auto"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
        maxHeight: "500px",
        overflowY: "auto",
      }}
    >
      <label htmlFor="nameInput">name:</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginBottom: "1.25rem" }}
        id={"nameInput"}
      />
      <button onClick={triggerSave}>save</button>
      {code && (
        <div
          style={{
            width: "100px",
            height: "100px",
            position: "absolute",
            top: "-9999px",
            left: "-9999px",
          }}
        >
          <Preview code={code} uniformsRef={uniformsRef} onFrame={save} />
        </div>
      )}
    </div>
  );
}
