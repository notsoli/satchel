import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import {
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { shader } from "@codemirror/legacy-modes/mode/clike";
import Preview from "./Preview";
import { initializeSharedUniforms } from "../lib/uniforms";
import EditorHeader from "./EditorHeader";
import { createSender } from "../lib/channel";

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
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLineGutter": { background: "transparent" },
  ".cm-activeLine": { background: "rgba(255,255,255,0.04)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  ".cm-selectionBackground": { background: "rgba(62,156,86,0.3) !important" },
});

export default function Editor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const uniformsRef = useRef(initializeSharedUniforms());
  const startTimeRef = useRef(0);
  const senderRef = useRef<ReturnType<typeof createSender> | null>(null);
  const selectionRef = useRef<[number, number]>([0, 0]);
  const cursorPositionRef = useRef<[number, number]>([0, 0]);

  const [code, setCode] = useState(INITIAL_SHADER);
  const [inspectCode, setInspectCode] = useState<null | string>(null);
  const [inspectPosition, setInspectPosition] = useState<[number, number]>([
    0, 0,
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "p") {
        event.preventDefault();
        setInspectCode(null);
        setError(null);

        const [from, to] = selectionRef.current;
        if (to - from == 0) return;

        // generate shader code for inspect, coercing into
        // vec4 and routing directly to fragColor
        const semicolonIdx = code.indexOf(";", to);
        const newCode =
          GRADUATE +
          code.slice(0, semicolonIdx + 1).replace(/fragColor\s*=[^;]*;/gs, "") +
          `\nfragColor = graduate(${code.slice(from, to)});` +
          code.slice(semicolonIdx + 1).replace(/fragColor\s*=[^;]*;/gs, "");

        setInspectCode(newCode);
        setInspectPosition([
          cursorPositionRef.current[0] - 50,
          cursorPositionRef.current[1] + 20,
        ]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [code]);

  useEffect(() => {
    startTimeRef.current = performance.now();
  }, []);

  useEffect(() => {
    senderRef.current = createSender();
    senderRef.current?.sendShader(INITIAL_SHADER);
    senderRef.current?.sendUniforms(uniformsRef.current);

    return () => {
      senderRef.current?.close();
      senderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = new EditorView({
      parent: editorRef.current!,
      state: EditorState.create({
        doc: INITIAL_SHADER,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          lineNumbers(),
          StreamLanguage.define(shader),
          syntaxHighlighting(highlightStyle),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const code = update.state.doc.toString();
              setCode(code);
              senderRef.current?.sendShader(code);
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

    viewRef.current = view;
    return () => view.destroy();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <EditorHeader uniformsRef={uniformsRef} />
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
            code={code}
            uniformsRef={uniformsRef}
            onFrame={() => {
              const u = uniformsRef.current;
              u.u_time = (performance.now() - startTimeRef.current) / 1000;
              u.u_frame += 1;
              // TODO: u.u_bands = readAudioBands()
              senderRef.current?.sendUniforms(uniformsRef.current);
            }}
            onError={setError}
          />
        </div>
        <div ref={editorRef} style={{ position: "absolute", inset: 0 }} />
        {error && (
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
            {error}
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
                setError(`CAN'T INSPECT:\n${error}`);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
