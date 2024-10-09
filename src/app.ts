import * as WGPU from './wgpu.js'

const elements: {[x: string]: HTMLElement} = {}

window.onload = async function init() {
    // element selectors
    elements.display = document.querySelector("#display")!
    elements.source = document.querySelector("#source")!

    document.onkeydown = handleSave
    await WGPU.init(elements.display as HTMLCanvasElement) // ugh
}

/**
 * Intercepts the browser's save dialog, updating the visualization instead.
 * Adapted from https://stackoverflow.com/questions/11362106/how-do-i-capture-a-ctrl-s-without-jquery-or-any-other-library
 * @param event The keyboard event.
 */
function handleSave(event: KeyboardEvent) {
    // detects save keybinds for most operating systems
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        WGPU.compile(`
            // Fragment shader
            @group(0) @binding(0) var<uniform> frame: f32;

            @fragment
            fn fragment_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
                ${(elements.source as HTMLTextAreaElement).value}
            }
        `);
      }
}

/**
 * TODO: add syntax highlighting
 * https://css-tricks.com/creating-an-editable-textarea-that-supports-syntax-highlighted-code/
 * https://github.com/highlightjs/highlight.js
*/