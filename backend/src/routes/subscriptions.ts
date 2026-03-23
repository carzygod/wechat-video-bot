import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { SubscriptionModel } from "../models/Subscription.js";
import type { WeixinHubService } from "../services/weixinHub.js";

function serializeSubscription(subscription: any) {
  return {
    id: String(subscription._id),
    status: subscription.status,
    qrCodeUrl: subscription.qrCodeUrl,
    expiresAt: subscription.qrExpiresAt,
    weixinAccountId: subscription.weixinAccountId,
    weixinUserId: subscription.weixinUserId,
  };
}

export function createSubscriptionRouter(weixinHub: WeixinHubService) {
  const router = Router();

  router.post("/qrcode", requireAuth, async (req, res) => {
    const subscription = await weixinHub.createPendingSubscription(req.auth!.userId);
    res.json({ subscription: serializeSubscription(subscription) });
  });

  router.get("/qrcode/:id", requireAuth, async (req, res) => {
    const subscription = await SubscriptionModel.findOne({
      _id: req.params.id,
      user: req.auth!.userId,
    }).lean();

    res.json({
      subscription: subscription ? serializeSubscription(subscription) : null,
    });
  });

  return router;
}
