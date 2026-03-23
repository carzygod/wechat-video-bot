import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VideoModel, type VideoDocument } from "../models/Video.js";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const videoRoot = path.join(appRoot, "video");

export class VideoLibraryService {
  async ensureVideoDir(): Promise<void> {
    await fs.mkdir(videoRoot, { recursive: true });
  }

  resolveAbsolutePath(localPath: string): string {
    return path.resolve(appRoot, localPath);
  }

  async getRecent(limit = 10) {
    return VideoModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }

  async pickRandomVideo(): Promise<VideoDocument | null> {
    const [video] = await VideoModel.aggregate([{ $sample: { size: 1 } }]);
    return (video ?? null) as VideoDocument | null;
  }

  getVideoRoot(): string {
    return videoRoot;
  }
}
