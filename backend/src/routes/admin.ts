import { Router } from "express";

import { env } from "../config/env.js";
import { requireAdmin, signAdminToken } from "../middleware/auth.js";
import { MessageModel } from "../models/Message.js";
import { SubscriptionModel } from "../models/Subscription.js";
import { UserModel } from "../models/User.js";
import type { WeixinHubService } from "../services/weixinHub.js";

function serializeMessage(message: any) {
  return {
    id: String(message._id),
    direction: message.direction,
    source: message.source,
    text: message.text,
    messageId: message.messageId ?? null,
    createdAt: message.createdAt,
  };
}

export function createAdminRouter(weixinHub: WeixinHubService) {
  const router = Router();

  router.post("/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};
    if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    res.json({
      token: signAdminToken(username),
      admin: { username },
    });
  });

  router.get("/me", requireAdmin, (req, res) => {
    res.json({ admin: req.admin ?? null });
  });

  router.get("/users", requireAdmin, async (_req, res) => {
    const subscriptions = await SubscriptionModel.find({ status: "linked" })
      .populate("user")
      .sort({ linkedAt: -1 })
      .lean();

    const users = await Promise.all(
      subscriptions.map(async (subscription: any) => {
        const lastMessage = await MessageModel.findOne({ subscription: subscription._id })
          .sort({ createdAt: -1 })
          .lean();

        return {
          id: String(subscription._id),
          status: subscription.status,
          linkedAt: subscription.linkedAt,
          weixinUserId: subscription.weixinUserId ?? null,
          weixinAccountId: subscription.weixinAccountId ?? null,
          xUser: subscription.user
            ? {
                id: String(subscription.user._id),
                name: subscription.user.name,
                username: subscription.user.username,
                avatarUrl: subscription.user.avatarUrl ?? null,
              }
            : null,
          lastMessage: lastMessage
            ? {
                text: lastMessage.text,
                direction: lastMessage.direction,
                createdAt: lastMessage.createdAt,
              }
            : null,
        };
      }),
    );

    res.json({ users });
  });

  router.get("/users/:subscriptionId/messages", requireAdmin, async (req, res) => {
    const subscription = await SubscriptionModel.findById(req.params.subscriptionId).lean();
    if (!subscription) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const messages = await MessageModel.find({ subscription: subscription._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      subscription: {
        id: String(subscription._id),
        weixinUserId: subscription.weixinUserId ?? null,
        status: subscription.status,
      },
      messages: messages.reverse().map(serializeMessage),
    });
  });

  router.post("/users/:subscriptionId/messages", requireAdmin, async (req, res) => {
    const subscriptionId = Array.isArray(req.params.subscriptionId)
      ? req.params.subscriptionId[0]
      : req.params.subscriptionId;
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    const result = await weixinHub.sendAdminText(subscriptionId, text, "admin");
    res.json(result);
  });

  router.post("/broadcast", requireAdmin, async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }

    const result = await weixinHub.broadcastAdminText(text);
    res.json(result);
  });

  router.get("/stats", requireAdmin, async (_req, res) => {
    const [linkedUsers, totalUsers, totalMessages] = await Promise.all([
      SubscriptionModel.countDocuments({ status: "linked" }),
      UserModel.countDocuments({}),
      MessageModel.countDocuments({}),
    ]);
    res.json({ linkedUsers, totalUsers, totalMessages });
  });

  return router;
}
