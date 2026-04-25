import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import {
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { shader } from "@codemirror/legacy-modes/mode/clike";
import { javascript } from "@codemirror/legacy-modes/mode/javascript";
import Preview from "./Preview";
import {
  initializeSharedUniforms,
  type CustomUniforms,
  type SharedUniforms,
} from "../lib/uniforms";
import EditorHeader from "./EditorHeader";
import { createSender } from "../lib/channel";
import Load from "./Load";
import Save from "./Save";
import { defaultOptions } from "../lib/options";
import { Options } from "./Options";

const INITIAL_SHADER = `// satchel - sam randa
// a glsl live coding environment with some bells and whistles

// click the microphone icon for audio analysis & beat detection
// click "view" to open just the shader output in another window
// additionally, highlight any expression and press Ctrl+P to open a preview

// use these uniforms to help create cool stuff:
// u_resolution (vec2): the screen resolution
// u_time (float): how long the editor has been open, in seconds
// u_frame (int): how many frames of the shader have been rendered
// u_bands (vec3): audio low/mid/high amplitudes
// u_beat (float): pulses from 0->1 every beat

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, abs(sin(u_time)), 1.0);
}`;

const INITIAL_PROCESS = `// custom uniforms
// runs once - declare persistent variables here
let bassAccumulator = 0;

// runs every frame - calculate custom uniforms here
// uniforms must be numbers, and integers will be converted to floats (for now)
function process(input) {
  bassAccumulator += input.u_bands[0];

  return {
    u_bassAccumulator: bassAccumulator
  };
}
`;

const GRADUATE =
  "vec4 graduate(float v) { return vec4(v, v, v, 1.0); }\n" +
  "vec4 graduate(vec2 v)  { return vec4(v, 0.0, 1.0); }\n" +
  "vec4 graduate(vec3 v)  { return vec4(v, 1.0); }\n" +
  "vec4 graduate(vec4 v)  { return v; }\n";

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: tags.typeName, color: "#82aaff" },
  { tag: tags.number, color: "#f78c6c" },
  { tag: tags.comment, color: "rgba(243,244,246,0.35)", fontStyle: "italic" },
  { tag: tags.operator, color: "#89ddff" },
  { tag: tags.punctuation, color: "#89ddff" },
  { tag: tags.variableName, color: "#f3f4f6" },
  { tag: tags.function(tags.variableName), color: "#82aaff" },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    background: "transparent",
    fontSize: "var(--text-sm)",
    fontFamily: "inherit",
  },
  ".cm-scroller": {
    overflow: "auto",
    background: "transparent",
  },
  ".cm-content": {
    background: "transparent",
    caretColor: "var(--accent)",
    padding: "0.5rem",
    fontFamily: "Necto Mono",
  },
  ".cm-line": {
    color: "#f3f4f6",
    backgroundColor: "rgba(0,0,0,0.6)",
    width: "fit-content",
  },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
});

export default function Editor() {
  const shaderEditorRef = useRef<HTMLDivElement>(null);
  const shaderViewRef = useRef<EditorView | null>(null);
  const processEditorRef = useRef<HTMLDivElement>(null);
  const processViewRef = useRef<EditorView | null>(null);
  const uniformsRef = useRef(initializeSharedUniforms());
  const startTimeRef = useRef(0);
  const senderRef = useRef<ReturnType<typeof createSender> | null>(null);
  const selectionRef = useRef<[number, number]>([0, 0]);
  const cursorPositionRef = useRef<[number, number]>([0, 0]);
  const processFnRef = useRef<
    ((input: SharedUniforms) => CustomUniforms) | null
  >(null);

  const [mode, setMode] = useState<"shader" | "process">("shader");
  const [shaderCode, setShaderCode] = useState(INITIAL_SHADER);
  const [processCode, setProcessCode] = useState(INITIAL_PROCESS);
  const [customUniformNames, setCustomUniformNames] = useState<string[]>([]);
  const [inspectCode, setInspectCode] = useState<null | string>(null);
  const [inspectPosition, setInspectPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [options, setOptions] = useState(defaultOptions);
  const ctrlEnterCompileRef = useRef<boolean>(false);

  function updateShaderCode(code: string) {
    const shaderView = shaderViewRef.current;
    if (!shaderView) return;

    shaderView.dispatch({
      changes: {
        from: 0,
        to: shaderView.state.doc.toString().length,
        insert: code,
      },
    });
  }

  function updateProcessCode(code: string) {
    const processView = processViewRef.current;
    if (!processView) return;

    processView.dispatch({
      changes: {
        from: 0,
        to: processView.state.doc.toString().length,
        insert: code,
      },
    });
  }

  // watch processCode
  useEffect(() => {
    try {
      processFnRef.current = eval(`
        ${processCode}
        process; // return the function
      `);
      setProcessError(null);
    } catch (err) {
      console.error("Process code error:", err);
      processFnRef.current = null;
    }
  }, [processCode]);

  // handle ctrl+enter compile
  useEffect(() => {
    ctrlEnterCompileRef.current = options.ctrl_enter_compile;
  }, [options]);

  // handle hotkeys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (mode !== "shader") return;

      // handle key down for inspect
      if ((event.ctrlKey || event.metaKey) && event.key === "p") {
        event.preventDefault();
        setInspectCode(null);
        setShaderError(null);

        const [from, to] = selectionRef.current;
        if (to - from == 0) return;

        // generate shader code for inspect, coercing into
        // vec4 and routing directly to fragColor
        const semicolonIdx = shaderCode.indexOf(";", to);
        const newCode =
          GRADUATE +
          shaderCode
            .slice(0, semicolonIdx + 1)
            .replace(/fragColor\s*=[^;]*;/gs, "") +
          `\nfragColor = graduate(${shaderCode.slice(from, to)});` +
          shaderCode
            .slice(semicolonIdx + 1)
            .replace(/fragColor\s*=[^;]*;/gs, "");

        setInspectCode(newCode);
        setInspectPosition([
          cursorPositionRef.current[0] - 50,
          cursorPositionRef.current[1] + 20,
        ]);
      }

      // handle ctrl+enter compile
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter" &&
        options.ctrl_enter_compile
      ) {
        const code = shaderViewRef.current?.state.doc.toString();
        if (code) {
          setShaderCode(code);
          senderRef.current?.sendShader(code);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [shaderCode, mode, options]);

  // kickstart time uniform
  useEffect(() => {
    startTimeRef.current = performance.now();
  }, []);

  // send shader and uniforms on mount
  useEffect(() => {
    senderRef.current = createSender();
    senderRef.current?.sendShader(INITIAL_SHADER);
    senderRef.current?.sendUniforms(uniformsRef.current);
    senderRef.current?.sendOptions(defaultOptions);

    return () => {
      senderRef.current?.close();
      senderRef.current = null;
    };
  }, []);

  // eval process code and extract custom uniform names
  useEffect(() => {
    try {
      const fn = new Function(`
        ${processCode}
        return process;
      `);
      processFnRef.current = fn() as (input: SharedUniforms) => CustomUniforms;

      // call with dummy data to get custom uniform names
      const dummyInput: SharedUniforms = {
        u_time: 0,
        u_frame: 0,
        u_bands: [0, 0, 0],
        u_beat: 0,
      };
      const result = processFnRef.current(dummyInput);
      const names = [];
      for (const name in result) {
        if (typeof result[name] !== "number") {
          setProcessError(`ERROR: custom uniform ${name} is not a number`);
        } else {
          names.push(name);
        }
      }

      setCustomUniformNames(names);
      senderRef.current?.sendCustomUniformNames(names);
    } catch (err) {
      setProcessError(
        "ERROR: " + (err instanceof Error ? err.message : String(err)),
      );
      processFnRef.current = null;
      setCustomUniformNames([]);
      senderRef.current?.sendCustomUniformNames([]);
    }
  }, [processCode]);

  // send options when changed
  useEffect(() => {
    senderRef.current?.sendOptions(options);
  }, [options]);

  // create codemirror views for shader & process editor
  useEffect(() => {
    const shaderView = new EditorView({
      parent: shaderEditorRef.current!,
      state: EditorState.create({
        doc: INITIAL_SHADER,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          StreamLanguage.define(shader),
          syntaxHighlighting(highlightStyle),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const code = update.state.doc.toString();

              if (!ctrlEnterCompileRef.current) {
                console.log("updating");
                setShaderCode(code);
                senderRef.current?.sendShader(code);
              }
            }
            if (update.selectionSet) {
              setInspectCode(null);
              const range = update.state.selection.main;
              selectionRef.current = [range.from, range.to];
            }
          }),
        ],
      }),
    });

    const processView = new EditorView({
      parent: processEditorRef.current!,
      state: EditorState.create({
        doc: INITIAL_PROCESS,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          StreamLanguage.define(javascript),
          syntaxHighlighting(highlightStyle),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const code = update.state.doc.toString();
              setProcessCode(code);
            }
          }),
        ],
      }),
    });

    shaderViewRef.current = shaderView;
    processViewRef.current = processView;
    return () => {
      shaderView.destroy();
      processView.destroy();
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <EditorHeader uniformsRef={uniformsRef} mode={mode} setMode={setMode} />
      <Options options={options} setOptions={setOptions} />
      <Load
        updateShaderCode={updateShaderCode}
        updateProcessCode={updateProcessCode}
      />
      <Save
        uniformsRef={uniformsRef}
        getShaderCode={() => shaderCode}
        getProcessCode={() => processCode}
        customUniformNames={customUniformNames}
      />
      <div
        style={{ position: "relative", width: "100vw", height: "0", flex: 1 }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          cursorPositionRef.current = [
            event.clientX - rect.left,
            event.clientY - rect.top,
          ];
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <Preview
            code={shaderCode}
            uniformsRef={uniformsRef}
            customUniformNames={customUniformNames}
            onFrame={() => {
              const u = uniformsRef.current;
              u.u_time = (performance.now() - startTimeRef.current) / 1000;
              u.u_frame += 1;

              // call the process function if it exists
              if (processFnRef.current) {
                try {
                  const customUniforms = processFnRef.current({
                    u_time: u.u_time,
                    u_frame: u.u_frame,
                    u_bands: u.u_bands,
                    u_beat: u.u_beat,
                  });

                  // merge custom uniforms into the uniform ref
                  for (const name of customUniformNames) {
                    if (customUniforms[name] !== undefined) {
                      u[name] = customUniforms[name];
                    }
                  }
                } catch (err) {
                  console.error("Process function error:", err);
                }
              }

              senderRef.current?.sendUniforms(uniformsRef.current);
            }}
            onError={setShaderError}
          />
        </div>
        <div
          ref={shaderEditorRef}
          style={{
            position: "absolute",
            inset: 0,
            display: mode === "shader" ? "block" : "none",
          }}
        />
        <div
          ref={processEditorRef}
          style={{
            position: "absolute",
            inset: 0,
            display: mode === "process" ? "block" : "none",
          }}
        />
        {(shaderError || processError) && (
          <pre
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              margin: 0,
              padding: "0.5rem 1rem",
              background: "rgba(0,0,0,0.75)",
              color: "#f87171",
              fontSize: "12px",
              fontFamily: "inherit",
              whiteSpace: "pre-wrap",
              pointerEvents: "none",
            }}
          >
            {mode === "shader" ? shaderError : processError}
          </pre>
        )}
        {inspectCode !== null && (
          <div
            style={{
              width: "100px",
              height: "100px",
              position: "absolute",
              top: inspectPosition[1] + "px",
              left: inspectPosition[0] + "px",
              border: "2px solid var(--bg)",
            }}
          >
            <Preview
              code={inspectCode}
              uniformsRef={uniformsRef}
              onError={(error) => {
                if (!error) return;
                setShaderError(`CAN'T INSPECT:\n${error}`);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
