import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { load } from "cheerio";

import { env } from "../config/env.js";
import { VideoModel, type VideoDocument } from "../models/Video.js";
import { VideoLibraryService } from "./videoLibrary.js";

type OnNewVideo = (video: VideoDocument) => Promise<void>;

type VideoCandidate = {
  title: string;
  pageUrl: string;
  downloadUrl: string;
};

export class VideoCrawlerService {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly library: VideoLibraryService,
    private readonly onNewVideo: OnNewVideo,
  ) {}

  async start(): Promise<void> {
    await this.library.ensureVideoDir();
    await this.crawlOnce().catch((error) => {
      console.error("[crawler] initial crawl failed", error);
    });

    this.timer = setInterval(() => {
      void this.crawlOnce().catch((error) => {
        console.error("[crawler] scheduled crawl failed", error);
      });
    }, env.CRAWLER_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async crawlOnce(options?: { forceDownload?: boolean }): Promise<VideoDocument | null> {
    const response = await fetch(env.CRAWLER_SOURCE_URL);
    if (!response.ok) {
      throw new Error(`Source page fetch failed: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const candidates = this.extractCandidates(html, env.CRAWLER_SOURCE_URL);
    if (!candidates.length) {
      throw new Error("No downloadable video candidates were found on the configured source page");
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    const sourceHash = crypto.createHash("sha1").update(selected.downloadUrl).digest("hex");
    const existing = await VideoModel.findOne({ sourceId: sourceHash });
    if (existing && !options?.forceDownload) {
      return existing as unknown as VideoDocument;
    }

    const fileResponse = await fetch(selected.downloadUrl);
    if (!fileResponse.ok) {
      throw new Error(`Video download failed: ${fileResponse.status} ${fileResponse.statusText}`);
    }

    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const ext = path.extname(new URL(selected.downloadUrl).pathname) || ".mp4";
    const timestamp = Date.now();
    const fileName = await this.createTimestampFileName(ext, timestamp);
    const absolutePath = path.join(this.library.getVideoRoot(), fileName);
    await fs.writeFile(absolutePath, buffer);
    const sourceId = options?.forceDownload ? `${sourceHash}-${timestamp}` : sourceHash;

    const video = await VideoModel.create({
      sourceId,
      title: selected.title,
      pageUrl: selected.pageUrl,
      downloadUrl: selected.downloadUrl,
      localPath: `video/${fileName}`,
      mimeType: fileResponse.headers.get("content-type") || "video/mp4",
      sizeBytes: buffer.byteLength,
      sourceSite: new URL(env.CRAWLER_SOURCE_URL).hostname,
    });

    await this.onNewVideo(video as unknown as VideoDocument);
    console.info("[crawler] stored new video", {
      title: video.title,
      localPath: video.localPath,
    });

    return video as unknown as VideoDocument;
  }

  private async createTimestampFileName(ext: string, timestamp: number): Promise<string> {
    let candidate = `${timestamp}${ext}`;
    let suffix = 1;

    while (true) {
      try {
        await fs.access(path.join(this.library.getVideoRoot(), candidate));
        candidate = `${timestamp}-${suffix}${ext}`;
        suffix += 1;
      } catch {
        return candidate;
      }
    }
  }

  private extractCandidates(html: string, pageUrl: string): VideoCandidate[] {
    const $ = load(html);
    const candidates = new Map<string, VideoCandidate>();

    $("a[href$='.mp4'], source[src$='.mp4'], video[src$='.mp4']").each((_, element) => {
      const href = $(element).attr("href") || $(element).attr("src");
      if (!href) return;
      const downloadUrl = new URL(href, pageUrl).toString();
      const title =
        $(element).text().trim() ||
        path.basename(new URL(downloadUrl).pathname) ||
        "Random video";

      candidates.set(downloadUrl, {
        title,
        pageUrl,
        downloadUrl,
      });
    });

    const regexMatches = html.match(/https?:\/\/[^"'`\s>]+\.mp4/gi) ?? [];
    for (const match of regexMatches) {
      const downloadUrl = new URL(match, pageUrl).toString();
      if (candidates.has(downloadUrl)) continue;
      candidates.set(downloadUrl, {
        title: path.basename(new URL(downloadUrl).pathname),
        pageUrl,
        downloadUrl,
      });
    }

    return [...candidates.values()];
  }
}
