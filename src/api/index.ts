import fs from "fs/promises";
import path from "path";
import express from "express";
import { loadDICOMImage } from "./dicom";

const app = express();

const DATA_DIR = path.join(__dirname, "../../data/");

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get("/api/image/:imageId", (req, res, next) => {
  getImages(req.params.imageId)
    .then((image) => {
      const { volume, ...metadata } = image;
      res.header("X-Image-Metadata", JSON.stringify(metadata));
      res.header("Content-Type", "application/octet-stream");
      res.send(Buffer.from(volume.buffer));
    })
    .catch((err) => {
      console.error(err);
      next(err);
    });
});

app.use((_err, _req, res, _next) => {
  console.log("teset");
  res.status(404);
  res.send({
    message: "Not found",
  });
});

async function getImages(imageId: string) {
  const dir = path.join(DATA_DIR, imageId);
  const files = await fs
    .readdir(dir)
    .then((filenames) => filenames.map((filename) => path.join(dir, filename)));
  return loadDICOMImage(files);
}

app.listen(3000);
