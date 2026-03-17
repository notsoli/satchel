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

const INITIAL_SHADER = `void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, abs(sin(u_time)), 1.0);
}`;

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
  const [code, setCode] = useState(INITIAL_SHADER);
  const [error, setError] = useState<string | null>(null);
  const uniformsRef = useRef(initializeSharedUniforms());
  const startTimeRef = useRef(0);
  const senderRef = useRef<ReturnType<typeof createSender> | null>(null);

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
      </div>
    </div>
  );
}
