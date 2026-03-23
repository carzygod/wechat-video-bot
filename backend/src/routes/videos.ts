import { Router } from "express";

import type { VideoLibraryService } from "../services/videoLibrary.js";

export function createVideoRouter(library: VideoLibraryService) {
  const router = Router();

  router.get("/recent", async (_req, res) => {
    const videos = await library.getRecent(10);
    res.json({
      videos: videos.map((video) => ({
        id: String(video._id),
        title: video.title,
        pageUrl: video.pageUrl,
        downloadUrl: video.downloadUrl,
        localPath: video.localPath,
        createdAt: video.createdAt,
      })),
    });
  });

  return router;
}
