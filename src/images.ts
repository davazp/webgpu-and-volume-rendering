import fg from "fast-glob";
import { loadDICOMImage } from "./dicom";

export async function getImage1() {
  const files = await fg(
    "/Users/davazp/Projects/SlicerRtData/eclipse-10.0.42-fsrt-brain/CT.PYFSRT01*.dcm",
  );
  const image = await loadDICOMImage(files);
  console.log(image);
}

getImage1();
