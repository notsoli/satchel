const lygiaFiles = import.meta.glob("/node_modules/lygia/**/*.glsl", {
  query: "?raw",
});

// #include lygia/math/pi  or  #include "lygia/math/pi.glsl"  or  #include "../other.glsl"
const INCLUDE_RE = /^#include\s+"?([^"\s]+)"?\s*$/gm;

const cache = new Map<string, Promise<string>>();

function resolveLygiaPath(
  importPath: string,
  currentFile: string,
): string | null {
  if (importPath.startsWith("lygia/")) return importPath.slice("lygia/".length);
  if (currentFile === "") return null;
  const dir = currentFile.substring(0, currentFile.lastIndexOf("/") + 1);
  const parts = (dir + importPath).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return out.join("/");
}

function fetchLygia(path: string): Promise<string> {
  if (cache.has(path)) return cache.get(path)!;
  const normalized = path.endsWith(".glsl") ? path : `${path}.glsl`;
  const key = `/node_modules/lygia/${normalized}`;
  const loader = lygiaFiles[key];
  if (!loader)
    return Promise.reject(new Error(`lygia: file not found: ${path}`));
  const promise = (loader() as Promise<{ default: string }>).then((mod) =>
    resolveImports(mod.default, normalized),
  );
  cache.set(path, promise);
  return promise;
}

async function resolveImports(
  code: string,
  currentFile: string = "",
): Promise<string> {
  const matches = [...code.matchAll(INCLUDE_RE)].flatMap((m) => {
    const lygiaPath = resolveLygiaPath(m[1], currentFile);
    return lygiaPath ? [{ full: m[0], path: lygiaPath }] : [];
  });

  if (matches.length === 0) return code;

  const resolved = await Promise.all(
    matches.map(async ({ full, path }) => ({
      full,
      content: await fetchLygia(path),
    })),
  );

  let result = code;
  for (const { full, content } of resolved) {
    result = result.replace(full, content);
  }
  return result;
}

/**
 * Preprocesses the shader code by resolving any `#include` directives
 * and adding custom uniform declarations. In practice, transforms the
 * shader code from the editor into a valid GLSL shader.
 *
 * @param code shader code from the editor
 * @param customUniformNames any custom uniform names to include in the shader
 * @returns the preprocessed shader code
 */
export async function preprocess(
  code: string,
  customUniformNames: string[] | undefined,
): Promise<string> {
  const customUniformDeclarations = (customUniformNames || [])
    .map((name) => `uniform float ${name};`)
    .join("\n");

  const fragPrefix = `#version 300 es
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform int u_frame;
  uniform vec3 u_bands;
  uniform float u_beat;
  ${customUniformDeclarations}

  out vec4 fragColor;

  `;

  const fragBody = await resolveImports(code);

  return fragPrefix + fragBody;
}
