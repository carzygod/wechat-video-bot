import { MissingContextTokenError, WeixinBot } from "weixin-claw-bot-sdk";
import type { WeixinBotMessage, WeixinSession } from "weixin-claw-bot-sdk";

import { env } from "../config/env.js";
import { MessageModel } from "../models/Message.js";
import { SubscriptionModel } from "../models/Subscription.js";
import type { SubscriptionDocument } from "../models/Subscription.js";
import type { UserDocument } from "../models/User.js";
import { VideoModel, type VideoDocument } from "../models/Video.js";
import { VideoLibraryService } from "./videoLibrary.js";

const WELCOME_MESSAGE =
  "欢迎订阅 wikig's channel，本频道当前演示微信订阅、消息收发与管理后台能力。【反诈中心测试】";

type PendingLoginJob = {
  subscriptionId: string;
  bot: WeixinBot;
};

type MessageSource = "bot" | "admin" | "broadcast";

type SubscriptionLike = {
  _id: unknown;
  user?: unknown;
  status?: string | null;
  qrCodeUrl?: string | null;
  qrExpiresAt?: Date | null;
  linkedAt?: Date | null;
  errorMessage?: string | null;
  weixinAccountId?: string | null;
  weixinUserId?: string | null;
  botSession?: unknown;
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

  async notifyNewVideo(_video: VideoDocument): Promise<void> {
    // The crawler still stores videos locally, but outbound behavior is now text-only.
  }

  async sendAdminText(subscriptionId: string, text: string, source: MessageSource = "admin") {
    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const sent = await this.trySendText(subscription, text, subscription.weixinUserId ?? undefined, source);
    return { ok: sent };
  }

  async broadcastAdminText(text: string) {
    const subscriptions = await SubscriptionModel.find({ status: "linked" });
    let sent = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      const ok = await this.trySendText(subscription, text, subscription.weixinUserId ?? undefined, "broadcast");
      if (ok) sent++;
      else failed++;
    }

    return { sent, failed };
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
        await this.sendWelcomeMessage(subscription);
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

    const subscription = await SubscriptionModel.findById(subscriptionId);
    if (!subscription) {
      return;
    }

    await this.recordInboundMessage(subscription, message);
    await this.trySendText(subscription, WELCOME_MESSAGE, message.chat.id, "bot");
  }

  private async sendWelcomeMessage(subscription: SubscriptionLike): Promise<void> {
    await this.trySendText(subscription, WELCOME_MESSAGE, subscription.weixinUserId ?? undefined, "bot");
  }

  private async trySendText(
    subscription: SubscriptionLike | SubscriptionDocument,
    text: string,
    chatId?: string,
    source: MessageSource = "bot",
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
      const result = await bot.sendMessage(targetChatId, text);
      await this.recordOutboundMessage(subscription, targetChatId, text, result.messageId, source);
      console.info("[weixin] text sent", {
        subscriptionId: String(subscription._id),
        messageId: result.messageId,
        targetChatId,
        source,
      });
      return true;
    } catch (error) {
      if (error instanceof MissingContextTokenError) {
        return false;
      }
      console.error("[weixin] text push failed", {
        subscriptionId: String(subscription._id),
        targetChatId,
        source,
        error,
      });
      return false;
    }
  }

  private async recordInboundMessage(subscription: SubscriptionDocument | SubscriptionLike, message: WeixinBotMessage) {
    const subscriptionDoc =
      "user" in subscription && subscription.user
        ? subscription
        : await SubscriptionModel.findById(subscription._id).lean();
    if (!subscriptionDoc?.user) return;

    const text = this.extractMessageText(message);
    if (!text) return;

    await MessageModel.create({
      subscription: subscriptionDoc._id,
      user: subscriptionDoc.user,
      direction: "inbound",
      source: "user",
      weixinUserId: message.chat.id,
      text,
      messageId: message.messageId,
      metadata: {
        type: message.type,
      },
    });
  }

  private async recordOutboundMessage(
    subscription: SubscriptionDocument | SubscriptionLike,
    weixinUserId: string,
    text: string,
    messageId: string,
    source: MessageSource,
  ) {
    const subscriptionDoc =
      "user" in subscription && subscription.user
        ? subscription
        : await SubscriptionModel.findById(subscription._id).lean();
    if (!subscriptionDoc?.user) return;

    await MessageModel.create({
      subscription: subscriptionDoc._id,
      user: subscriptionDoc.user,
      direction: "outbound",
      source,
      weixinUserId,
      text,
      messageId,
    });
  }

  private extractMessageText(message: WeixinBotMessage): string {
    if (typeof message.text === "string" && message.text.trim()) {
      return message.text.trim();
    }

    if (message.caption && message.caption.trim()) {
      return message.caption.trim();
    }

    return `[${message.type}]`;
  }
}
