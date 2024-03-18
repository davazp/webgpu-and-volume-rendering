import { ImageVolume } from "./api/types";

export async function getImage(): Promise<ImageVolume> {
  const response = await fetch("/api/eclipse-10.0.42-fsrt-brain");
  const arrayBuffer = await response.arrayBuffer();
  const volume = new Float32Array(arrayBuffer);

  const metadataRaw = response.headers.get("X-Image-Metadata");
  if (!metadataRaw) {
    throw new Error(`Missing metadata`);
  }
  const metadata = JSON.parse(metadataRaw);
  return {
    ...metadata,
    volume,
  };
}
