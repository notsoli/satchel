# satchel

A GLSL fragment shader editor built for live coding and performance to the specific desires of [Sam Randa](https://samranda.com).

Supports:
- live updates
- multiple output windows
- debug/inspection previews
- audio analysis w/ live beat detection
- save/load w/ preview images
- [lygia](https://lygia.xyz) shader library support (via `#include` directives)

## Keybinds

Highlight an expression and press `Ctrl+P` to "inspect" it, opening a preview window with that expression routed directly to `fragColor`.

## How it works

The editor (`/`) renders a CodeMirror instance overlaid on a WebGL canvas. As you type, the fragment shader is recompiled and the canvas updates in place. If compilation fails, the last valid shader continues rendering and the error is shown at the bottom of the screen.

The viewer (`/view`) is a fullscreen WebGL canvas intended for display or projection. It receives shader code and uniform updates from the editor via the [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel), meaning both windows must be open in the same browser on the same machine.

## Notes

Keep in mind that if the editor is open in other tab (not window) as the viewer, it may lazily reload uniforms and cause very infrequent updates to view windows. Make sure the editor is visible in a separate window to make sure it's recomputed each frame.

Shared uniforms available in every shader:

```glsl
uniform vec2  u_resolution; // canvas size in pixels
uniform float u_time;       // seconds since the editor was opened
uniform int   u_frame;      // frame count
uniform vec3  u_bands;      // audio band amplitudes: x = low, y = mid, z = high
uniform float u_beat;       // 0 -> 1 as beat progresses, using live beat detection
```

## Running

Go to [satchel.samranda.com](https://satchel.samranda.com), or run locally:

```
npm install
npm run dev
```
