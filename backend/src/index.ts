import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";

import { env } from "./config/env.js";
import { requireAuth } from "./middleware/auth.js";
import { UserModel } from "./models/User.js";
import { authRouter } from "./routes/auth.js";
import { createSubscriptionRouter } from "./routes/subscriptions.js";
import { createVideoRouter } from "./routes/videos.js";
import { VideoCrawlerService } from "./services/videoCrawler.js";
import { VideoLibraryService } from "./services/videoLibrary.js";
import { WeixinHubService } from "./services/weixinHub.js";

const app = express();
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const library = new VideoLibraryService();
const weixinHub = new WeixinHubService(library);
const crawler = new VideoCrawlerService(library, async (video) => {
  await weixinHub.notifyNewVideo(video);
});

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/video", express.static(path.join(appRoot, "video")));
app.use("/api/auth", authRouter);
app.use("/api/subscriptions", createSubscriptionRouter(weixinHub));
app.use("/api/videos", createVideoRouter(library));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", (req, res, next) => {
  if (!req.cookies?.["91bot_auth"]) {
    res.json({ user: null });
    return;
  }
  requireAuth(req, res, () => next());
}, async (req, res) => {
  const user = await UserModel.findById(req.auth!.userId).lean();
  if (!user) {
    res.json({ user: null });
    return;
  }

  res.json({
    user: {
      id: String(user._id),
      username: user.username,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
  });
});

async function bootstrap() {
  await mongoose.connect(env.MONGODB_URI);
  await weixinHub.initialize();
  await crawler.start();

  app.listen(env.PORT, () => {
    console.info(`[91bot] backend listening on http://localhost:${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("[91bot] failed to start backend", error);
  process.exit(1);
});
