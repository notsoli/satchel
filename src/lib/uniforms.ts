export type SharedUniforms = {
  u_time: number;
  u_frame: number;
  u_bands: [number, number, number];
  u_beat: number;
};

export type UniqueUniforms = {
  u_resolution: [number, number];
};

export type CustomUniforms = Record<string, number>;

export function initializeSharedUniforms(): SharedUniforms & CustomUniforms {
  return {
    u_time: 0,
    u_frame: 0,
    u_bands: [0, 0, 0],
    u_beat: 0,
  } as SharedUniforms & CustomUniforms;
}
