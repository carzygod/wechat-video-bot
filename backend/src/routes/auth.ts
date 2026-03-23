import { Router } from "express";

import { env } from "../config/env.js";
import { getSessionCookieName, signSessionToken } from "../middleware/auth.js";
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

    res.cookie(getSessionCookieName(), signSessionToken(String(user._id)), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${env.FRONTEND_URL}?login=success`);
  } catch (error) {
    res.redirect(`${env.FRONTEND_URL}?login=failed&reason=${encodeURIComponent(error instanceof Error ? error.message : "x-login-failed")}`);
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
