import { useEffect, useRef, useState } from "react";
import {
  listShaders,
  deleteShader,
  loadShader,
  type ShaderListItem,
} from "../lib/persistence";

export default function Load({
  updateShaderCode,
  updateProcessCode,
}: {
  updateShaderCode: (code: string) => void;
  updateProcessCode: (code: string) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ShaderListItem[]>([]);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const handleToggle = (e: ToggleEvent) => {
      if (e.newState === "open") {
        // Refetch when popover opens
        listShaders().then(setItems);
      }
    };

    popover.addEventListener("toggle", handleToggle);
    return () => popover.removeEventListener("toggle", handleToggle);
  }, []);

  async function deleteItem(id: number) {
    await deleteShader(id);
    listShaders().then(setItems);
  }

  async function loadItem(id: number) {
    const item = await loadShader(id);
    updateShaderCode(item.shaderCode);
    updateProcessCode(item.processCode);
    popoverRef.current?.hidePopover();
  }

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  return (
    <div
      ref={popoverRef}
      id="load-popover"
      popover="auto"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        width: "400px",
        maxHeight: "600px",
        overflowY: "auto",
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ display: "flex", gap: "0.5rem" }}>
          <img
            key={item.id}
            src={URL.createObjectURL(item.preview)}
            width={100}
            height={100}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
              flexGrow: 1,
            }}
          >
            <span>{item.name}</span>
            <span>{formattedDate.format(new Date(item.createdAt))}</span>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto" }}>
              <button onClick={() => loadItem(item.id)} style={{ flexGrow: 1 }}>
                load
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="linkButton"
                style={{ color: "var(--text-subtle)" }}
              >
                delete
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
