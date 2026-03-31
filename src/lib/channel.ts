import type { SharedUniforms, CustomUniforms } from "./uniforms";

type Message =
  | { type: "shader"; code: string }
  | { type: "uniforms"; uniforms: SharedUniforms & CustomUniforms }
  | { type: "customUniformNames"; names: string[] };

const NAME = "satchel";

export function createSender() {
  const ch = new BroadcastChannel(NAME);
  return {
    sendShader: (code: string) => ch.postMessage({ type: "shader", code }),
    sendUniforms: (uniforms: SharedUniforms & CustomUniforms) =>
      ch.postMessage({ type: "uniforms", uniforms }),
    sendCustomUniformNames: (names: string[]) =>
      ch.postMessage({ type: "customUniformNames", names }),
    close: () => ch.close(),
  };
}

export function createReceiver(handler: (msg: Message) => void) {
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = (e) => handler(e.data as Message);
  return { close: () => ch.close() };
}
