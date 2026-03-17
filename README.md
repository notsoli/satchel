# satchel

A GLSL fragment shader editor built for live coding and performance to the specific desires of [Sam Randa](https://samranda.com). Supports live updates and multiple output windows, with audio analysis, debug previews, and save/load down the road.

## How it works

The editor (`/`) renders a CodeMirror instance overlaid on a WebGL canvas. As you type, the fragment shader is recompiled and the canvas updates in place. If compilation fails, the last valid shader continues rendering and the error is shown at the bottom of the screen.

The viewer (`/view`) is a fullscreen WebGL canvas intended for display or projection. It receives shader code and uniform updates from the editor via the [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel), meaning both windows must be open in the same browser on the same machine.

Shared uniforms available in every shader:

```glsl
uniform vec2  u_resolution; // canvas size in pixels
uniform float u_time;       // seconds since the editor was opened
uniform int   u_frame;      // frame count
uniform vec3  u_bands;      // audio band amplitudes: x = low, y = mid, z = high (not functional yet)
```

## Running

Go to [satchel.samranda.com](https://satchel.samranda.com), or run locally:

```
npm install
npm run dev
```
