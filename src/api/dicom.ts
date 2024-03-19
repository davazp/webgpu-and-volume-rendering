import dicomParser from "dicom-parser";
import fs from "fs/promises";
import { ImageVolume, Vec3 } from "./types";

// https://dicom.innolitics.com/ciods/ct-image/image-pixel

enum Tags {
  SliceLocation = "x00201041",
  Rows = "x00280010",
  Columns = "x00280011",
  BitsAllocated = "x00280100",
  PixelRepresentation = "x00280103",
  ImagePositionPatient = "x00200032",
  ImageOrientationPatient = "x00200037",
  PixelSpacing = "x00280030",
  PixelData = "x7fe00010",

  RescaleType = "x00281054",
  RescaleIntercept = "x00281052",
  RescaleSlope = "x00281053",
}

export async function loadDICOMImage(files: string[]): Promise<ImageVolume> {
  const slices = await Promise.all(
    files.map(async (file) => {
      try {
        const buffer = await fs.readFile(file);
        return readSingleImage(buffer);
      } catch (err) {
        throw new Error(`Could not parse file ${file}: ${err}`);
      }
    }),
  );

  slices.sort((sliceA, sliceB) => {
    return sliceA.sliceLocation - sliceB.sliceLocation;
  });

  const firstSlice = slices.at(0);
  const lastSlice = slices.at(-1);
  if (firstSlice === undefined || lastSlice === undefined) {
    throw new Error(`Need at least two slices`);
  }

  const columns = consistentValue(
    slices.map((d) => d.columns),
    "columns",
  );
  const rows = consistentValue(
    slices.map((d) => d.rows),
    "rows",
  );

  const pixelSpacing2D = consistentValue(
    slices.map((d) => d.pixelSpacing),
    "pixelSpacing",
    JSON.stringify,
  );

  // Ensure the slices align correctly.

  let intersliceVector: Vec3 = [
    (lastSlice.positionPatient[0] - firstSlice.positionPatient[0]) /
      (slices.length - 1),
    (lastSlice.positionPatient[1] - firstSlice.positionPatient[1]) /
      (slices.length - 1),
    (lastSlice.positionPatient[2] - firstSlice.positionPatient[2]) /
      (slices.length - 1),
  ];
  let pixelSpacingZ = Math.sqrt(
    intersliceVector[0] ** 2 +
      intersliceVector[1] ** 2 +
      intersliceVector[2] ** 2,
  );

  const pixelSpacing: Vec3 = [
    pixelSpacing2D[0],
    pixelSpacing2D[1],
    pixelSpacingZ,
  ];

  for (const [sliceIdx, slice] of slices.entries()) {
    const expected: Vec3 = [
      firstSlice.positionPatient[0] + sliceIdx * intersliceVector[0],
      firstSlice.positionPatient[1] + sliceIdx * intersliceVector[1],
      firstSlice.positionPatient[2] + sliceIdx * intersliceVector[2],
    ];

    const tolerance = 0.001;

    if (
      Math.abs(slice.positionPatient[0] - expected[0]) > tolerance ||
      Math.abs(slice.positionPatient[1] - expected[1]) > tolerance ||
      Math.abs(slice.positionPatient[2] - expected[2]) > tolerance
    ) {
      throw new Error(
        `Slice ${sliceIdx} expected position was ${JSON.stringify(
          expected,
        )}, but was found at ${JSON.stringify(slice.positionPatient)}`,
      );
    }
  }

  const imageOrientationPatient2D = consistentValue(
    slices.map((slice) => slice.imageOrientationPatient),
    "imageOrientationPatient",
    JSON.stringify,
  );

  const imageOrientationPatient: [Vec3, Vec3, Vec3] = [
    imageOrientationPatient2D[0],
    imageOrientationPatient2D[1],
    [
      intersliceVector[0] / pixelSpacingZ,
      intersliceVector[1] / pixelSpacingZ,
      intersliceVector[2] / pixelSpacingZ,
    ],
  ];

  const positionPatient = firstSlice.positionPatient;

  const sliceSize = columns * rows;
  const volume = new Float32Array(sliceSize * slices.length);

  for (const [sliceIdx, slice] of slices.entries()) {
    volume.set(slice.image, sliceIdx * sliceSize);
  }

  return {
    columns,
    rows,
    slices: slices.length,
    pixelSpacing,
    positionPatient,
    imageOrientationPatient,
    volume,
  };
}

function readSingleImage(buffer: ArrayBuffer) {
  const dataset = dicomParser.parseDicom(new Uint8Array(buffer));

  const columns = dataset.uint16(Tags.Columns);
  if (columns === undefined) {
    throw new Error(`Missing required Columns tag.`);
  }

  const rows = dataset.uint16(Tags.Rows);
  if (rows === undefined) {
    throw new Error(`Missing required Rows tag.`);
  }

  const positionPatientL = dataset.floatString(Tags.ImagePositionPatient, 0);
  const positionPatientP = dataset.floatString(Tags.ImagePositionPatient, 1);
  const positionPatientS = dataset.floatString(Tags.ImagePositionPatient, 2);

  if (
    positionPatientL === undefined ||
    positionPatientP === undefined ||
    positionPatientS === undefined
  ) {
    throw new Error(`Missing image position patient`);
  }

  const sliceLocation =
    dataset.floatString(Tags.SliceLocation) ?? positionPatientS;
  if (sliceLocation === undefined) {
    throw new Error(`Missing slice location tag`);
  }

  const bitsAllocated = dataset.uint16(Tags.BitsAllocated);
  if (bitsAllocated !== 16) {
    throw new Error(`Unsupported BitsAllocated ${bitsAllocated}`);
  }

  const pixelRepresentation = dataset.uint16(Tags.PixelRepresentation);

  const pixelSpacingX = dataset.floatString(Tags.PixelSpacing, 0);
  const pixelSpacingY = dataset.floatString(Tags.PixelSpacing, 1);
  if (pixelSpacingX === undefined || pixelSpacingY === undefined) {
    throw new Error(`Missing pixel spacing`);
  }
  const pixelSpacing: [number, number] = [pixelSpacingX, pixelSpacingY];

  const positionPatient: Vec3 = [
    positionPatientL,
    positionPatientP,
    positionPatientS,
  ];

  const orientationU0 = dataset.floatString(Tags.ImageOrientationPatient, 0);
  const orientationU1 = dataset.floatString(Tags.ImageOrientationPatient, 1);
  const orientationU2 = dataset.floatString(Tags.ImageOrientationPatient, 2);
  const orientationV0 = dataset.floatString(Tags.ImageOrientationPatient, 3);
  const orientationV1 = dataset.floatString(Tags.ImageOrientationPatient, 4);
  const orientationV2 = dataset.floatString(Tags.ImageOrientationPatient, 5);

  if (
    orientationU0 === undefined ||
    orientationU1 === undefined ||
    orientationU2 === undefined ||
    orientationV0 === undefined ||
    orientationV1 === undefined ||
    orientationV2 === undefined
  ) {
    throw new Error(`Missing image orientation patient`);
  }

  const imageOrientationPatient: [Vec3, Vec3] = [
    [orientationU0, orientationU1, orientationU2],
    [orientationV0, orientationV1, orientationV2],
  ];

  const pixelDataElement = dataset.elements[Tags.PixelData];

  if (!pixelDataElement) {
    throw new Error(`Missing pixel data`);
  }

  let arrayType = pixelRepresentation === 0 ? Uint16Array : Int16Array;

  const pixelData = new arrayType(
    dataset.byteArray.buffer.slice(
      pixelDataElement.dataOffset,
      pixelDataElement.dataOffset + pixelDataElement.length,
    ),
  );

  if (pixelData.length !== rows * columns) {
    throw new Error(`Unexpected image size`);
  }

  const rescaleType = dataset.string(Tags.RescaleType);
  if (rescaleType !== "HU" && rescaleType !== undefined) {
    throw new Error(`Unsupported rescaleType ${rescaleType}`);
  }

  const rescaleSlope = dataset.floatString(Tags.RescaleSlope) ?? 1;
  const rescaleIntercept = dataset.floatString(Tags.RescaleIntercept) ?? 0;

  const image = new Float32Array(rows * columns);
  for (let i = 0; i < pixelData.length; i++) {
    image[i] = pixelData[i]! * rescaleSlope + rescaleIntercept;
  }

  return {
    columns,
    rows,
    sliceLocation,
    pixelSpacing,
    dataset,
    positionPatient,
    imageOrientationPatient,
    image,
  };
}

/** Ensure all values of an array are equal accoding to byKey. */
export function consistentValue<T>(
  array: T[],
  tag: string,
  byKey: (x: T) => unknown = (x) => x,
): T {
  const first = array[0];
  if (first === undefined) {
    throw new Error(`Empty array`);
  }
  const firstKey = byKey(first);
  for (const x of array) {
    if (byKey(x) !== firstKey) {
      throw new Error(`Inconsistent value for ${tag}: ${x}`);
    }
  }
  return first;
}
