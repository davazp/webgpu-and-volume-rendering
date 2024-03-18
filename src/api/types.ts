export type Vec3 = [number, number, number];

export interface ImageMetadata {
  columns: number;
  rows: number;
  slices: number;
  pixelSpacing: Vec3;
  positionPatient: Vec3;
  imageOrientationPatient: [Vec3, Vec3, Vec3];
}

export interface ImageVolume extends ImageMetadata {
  volume: Float32Array;
}
