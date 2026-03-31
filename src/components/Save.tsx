import { useRef, useState, type RefObject } from "react";
import type { CustomUniforms, SharedUniforms } from "../lib/uniforms";
import Preview from "./Preview";
import { saveShader } from "../lib/persistence";

export default function Save({
  uniformsRef,
  customUniformNames,
  getShaderCode,
  getProcessCode,
}: {
  uniformsRef: RefObject<SharedUniforms & CustomUniforms>;
  customUniformNames: string[];
  getShaderCode: () => string;
  getProcessCode: () => string;
}) {
  const [name, setName] = useState(new Date().toISOString());
  const [shaderCode, setShaderCode] = useState("");
  const [processCode, setProcessCode] = useState("");

  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  function triggerSave() {
    savedRef.current = false;
    setShaderCode(getShaderCode());
    setProcessCode(getProcessCode());
  }

  function save(canvas: HTMLCanvasElement) {
    if (saving || savedRef.current) return;
    if (!canvas || (canvas.width === 300 && canvas.height === 150)) return;

    savedRef.current = true;
    setSaving(true);

    canvas.toBlob(async (preview) => {
      if (!preview) return;
      const shaderCode = getShaderCode();

      await saveShader(shaderCode, processCode, preview, name);

      setShaderCode("");
      setProcessCode("");
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
      {shaderCode && processCode && (
        <div
          style={{
            width: "100px",
            height: "100px",
            position: "absolute",
            top: "-9999px",
            left: "-9999px",
          }}
        >
          <Preview
            code={shaderCode}
            customUniformNames={customUniformNames}
            uniformsRef={uniformsRef}
            onFrame={save}
          />
        </div>
      )}
    </div>
  );
}
