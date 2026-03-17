import type { SharedUniforms } from "./uniforms";

type Message =
  | { type: "shader"; code: string }
  | { type: "uniforms"; uniforms: SharedUniforms };

const NAME = "satchel";

export function createSender() {
  const ch = new BroadcastChannel(NAME);
  return {
    sendShader: (code: string) => ch.postMessage({ type: "shader", code }),
    sendUniforms: (uniforms: SharedUniforms) =>
      ch.postMessage({ type: "uniforms", uniforms }),
    close: () => ch.close(),
  };
}

export function createReceiver(handler: (msg: Message) => void) {
  const ch = new BroadcastChannel(NAME);
  ch.onmessage = (e) => handler(e.data as Message);
  return { close: () => ch.close() };
}
