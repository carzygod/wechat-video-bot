import mongoose from "mongoose";

import { env } from "../config/env.js";
import { VideoCrawlerService } from "../services/videoCrawler.js";
import { VideoLibraryService } from "../services/videoLibrary.js";

async function main() {
  await mongoose.connect(env.MONGODB_URI);

  const library = new VideoLibraryService();
  const crawler = new VideoCrawlerService(library, async () => {});
  const video = await crawler.crawlOnce({ forceDownload: true });

  if (!video) {
    throw new Error("No video was downloaded");
  }

  console.log("[test:download] downloaded one random video");
  console.log(
    JSON.stringify(
      {
        id: String(video._id),
        title: video.title,
        localPath: video.localPath,
        downloadUrl: video.downloadUrl,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[test:download] failed", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
