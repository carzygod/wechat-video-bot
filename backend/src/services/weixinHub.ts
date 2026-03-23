import { MissingContextTokenError, WeixinBot } from "weixin-claw-bot-sdk";
import type { WeixinBotMessage, WeixinSession } from "weixin-claw-bot-sdk";

import { env } from "../config/env.js";
import { SubscriptionModel } from "../models/Subscription.js";
import { VideoModel, type VideoDocument } from "../models/Video.js";
import { VideoLibraryService } from "./videoLibrary.js";

type PendingLoginJob = {
  subscriptionId: string;
  bot: WeixinBot;
};

type SubscriptionLike = {
  _id: unknown;
  status?: string | null;
  qrCodeUrl?: string | null;
  qrExpiresAt?: Date | null;
  linkedAt?: Date | null;
  errorMessage?: string | null;
  weixinAccountId?: string | null;
  weixinUserId?: string | null;
  botSession?: unknown;
  pendingVideoIds?: unknown[];
};

export class WeixinHubService {
  private readonly pendingJobs = new Map<string, PendingLoginJob>();
  private readonly activeBots = new Map<string, WeixinBot>();

  constructor(private readonly library: VideoLibraryService) {}

  async initialize(): Promise<void> {
    const linkedSubscriptions = await SubscriptionModel.find({
      status: "linked",
      botSession: { $ne: null },
    }).lean();

    for (const subscription of linkedSubscriptions) {
      await this.attachStoredSubscription(subscription as any);
    }
  }

  async createPendingSubscription(userId: string) {
    const bot = new WeixinBot();
    const loginSession = await bot.createLoginSession();

    const subscription = await SubscriptionModel.create({
      user: userId,
      status: "pending",
      qrSessionId: loginSession.sessionKey,
      qrCodeUrl: loginSession.qrCodeUrl,
      qrExpiresAt: new Date(Date.now() + env.QR_TIMEOUT_MS),
      pendingVideoIds: [],
    });

    this.pendingJobs.set(String(subscription._id), {
      subscriptionId: String(subscription._id),
      bot,
    });

    void this.awaitLogin(String(subscription._id), bot, loginSession.sessionKey);

    return subscription;
  }

  async notifyNewVideo(video: VideoDocument): Promise<void> {
    const subscriptions = await SubscriptionModel.find({ status: "linked" });
    for (const subscription of subscriptions) {
      await this.pushOrQueueVideo(subscription, video);
    }
  }

  private async awaitLogin(subscriptionId: string, bot: WeixinBot, sessionKey: string): Promise<void> {
    try {
      const result = await bot.waitForLogin(sessionKey, {
        timeoutMs: env.QR_TIMEOUT_MS,
      });

      if (!result.connected || !result.session) {
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
          status: result.message.toLowerCase().includes("expired") ? "expired" : "failed",
          errorMessage: result.message,
        });
        return;
      }

      const session = result.session;
      const subscription = await SubscriptionModel.findByIdAndUpdate(
        subscriptionId,
        {
          status: "linked",
          linkedAt: new Date(),
          errorMessage: null,
          weixinAccountId: session.accountId,
          weixinUserId: session.userId,
          botSession: session,
        },
        { new: true },
      );

      if (subscription) {
        await this.attachBot(subscription, bot, session);
        await this.queueRandomWelcomeVideo(subscription);
      }
    } catch (error) {
      await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Weixin login failed",
      });
    } finally {
      this.pendingJobs.delete(subscriptionId);
    }
  }

  private async attachStoredSubscription(subscription: any): Promise<void> {
    const bot = new WeixinBot({ session: subscription.botSession as WeixinSession });
    await this.attachBot(subscription, bot, subscription.botSession as WeixinSession);
  }

  private async attachBot(subscription: SubscriptionLike, bot: WeixinBot, session: WeixinSession): Promise<void> {
    await bot.useSession(session);
    const subscriptionId = String(subscription._id);
    this.activeBots.set(subscriptionId, bot);

    bot.on("message", (message: WeixinBotMessage) => {
      void this.handleInboundMessage(subscriptionId, message, session.accountId);
    });

    bot.on("polling_error", (error: unknown) => {
      console.error("[weixin] polling error", { subscriptionId, error });
    });

    void bot.startPolling().catch((error: unknown) => {
      console.error("[weixin] failed to start polling", { subscriptionId, error });
    });
  }

  private async handleInboundMessage(subscriptionId: string, message: WeixinBotMessage, selfAccountId: string): Promise<void> {
    if (message.from.id === selfAccountId) {
      return;
    }

    await this.flushPendingVideos(subscriptionId, message.chat.id);
    const randomVideo = await this.library.pickRandomVideo();
    if (randomVideo) {
      const subscription = await SubscriptionModel.findById(subscriptionId);
      if (subscription) {
        await this.pushOrQueueVideo(subscription, randomVideo, message.chat.id);
      }
    }
  }

  private async queueRandomWelcomeVideo(subscription: SubscriptionLike): Promise<void> {
    const randomVideo = await this.library.pickRandomVideo();
    if (randomVideo) {
      await this.pushOrQueueVideo(subscription, randomVideo);
    }
  }

  private async flushPendingVideos(subscriptionId: string, chatId: string): Promise<void> {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription || !subscription.pendingVideoIds.length) return;

    const pendingVideos = await VideoModel.find({
      _id: { $in: subscription.pendingVideoIds },
    }).sort({ createdAt: 1 });

    const deliveredIds: string[] = [];
    for (const video of pendingVideos) {
      const delivered = await this.trySendVideo(subscription, video as any, chatId);
      if (delivered) {
        deliveredIds.push(String(video._id));
      } else {
        break;
      }
    }

    if (deliveredIds.length) {
      await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
        $pull: {
          pendingVideoIds: { $in: deliveredIds },
        },
      });
    }
  }

  private async pushOrQueueVideo(
    subscription: SubscriptionLike,
    video: VideoDocument,
    chatId?: string,
  ): Promise<void> {
    const delivered = await this.trySendVideo(subscription, video, chatId);
    if (!delivered) {
      await SubscriptionModel.findByIdAndUpdate(subscription._id, {
        $addToSet: { pendingVideoIds: video._id },
      });
    }
  }

  private async trySendVideo(
    subscription: SubscriptionLike,
    video: VideoDocument,
    chatId?: string,
  ): Promise<boolean> {
    const bot = this.activeBots.get(String(subscription._id));
    if (!bot) {
      return false;
    }

    const targetChatId = chatId ?? subscription.weixinUserId ?? undefined;
    if (!targetChatId) {
      return false;
    }

    try {
      await bot.sendDocument(targetChatId, this.library.resolveAbsolutePath(video.localPath), {
        caption: video.title,
      });
      return true;
    } catch (error) {
      if (error instanceof MissingContextTokenError) {
        return false;
      }
      console.error("[weixin] push failed", {
        subscriptionId: String(subscription._id),
        videoId: String(video._id),
        error,
      });
      return false;
    }
  }
}
