import type { Options } from "../lib/options";

interface Props {
  options: Options;
  setOptions: (options: Options) => void;
}
export function Options({ options, setOptions }: Props) {
  return (
    <div
      id="options-popover"
      popover="auto"
      style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
    >
      <label>
        <input
          type="checkbox"
          checked={options.show_code_overlay}
          style={{ marginRight: "0.5rem" }}
          onChange={(e) =>
            setOptions({ ...options, show_code_overlay: e.target.checked })
          }
        />
        Show Code Overlay
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.ctrl_enter_compile}
          style={{ marginRight: "0.5rem" }}
          onChange={(e) =>
            setOptions({ ...options, ctrl_enter_compile: e.target.checked })
          }
        />
        Ctrl+Enter Compile
      </label>
    </div>
  );
}
