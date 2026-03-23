import { Router } from "express";

import { env } from "../config/env.js";
import { signSessionToken } from "../middleware/auth.js";
import { UserModel } from "../models/User.js";
import { createTwitterLoginUrl, handleTwitterCallback } from "../services/twitterAuth.js";

export const authRouter = Router();

authRouter.get("/x/login", (_req, res) => {
  res.redirect(createTwitterLoginUrl());
});

authRouter.get("/x/callback", async (req, res) => {
  try {
    const user = await handleTwitterCallback({
      state: typeof req.query.state === "string" ? req.query.state : undefined,
      code: typeof req.query.code === "string" ? req.query.code : undefined,
    });

    const token = signSessionToken(String(user._id));
    const redirectUrl = new URL(env.FRONTEND_URL);
    redirectUrl.searchParams.set("login", "success");
    redirectUrl.searchParams.set("token", token);
    res.redirect(redirectUrl.toString());
  } catch (error) {
    const redirectUrl = new URL(env.FRONTEND_URL);
    redirectUrl.searchParams.set("login", "failed");
    redirectUrl.searchParams.set("reason", error instanceof Error ? error.message : "x-login-failed");
    res.redirect(redirectUrl.toString());
  }
});

authRouter.get("/me", async (req, res) => {
  if (!req.auth?.userId) {
    res.json({ user: null });
    return;
  }

  const user = await UserModel.findById(req.auth.userId).lean();
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
