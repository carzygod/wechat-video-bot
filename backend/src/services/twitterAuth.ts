import { randomUUID } from "node:crypto";

import { Client, auth } from "twitter-api-sdk";

import { env } from "../config/env.js";
import { UserModel } from "../models/User.js";

type PendingAuthEntry = {
  authClient: InstanceType<typeof auth.OAuth2User>;
  expiresAt: number;
};

const pendingAuth = new Map<string, PendingAuthEntry>();
const AUTH_TTL_MS = 10 * 60 * 1000;

function createAuthClient() {
  return new auth.OAuth2User({
    client_id: env.X_CLIENT_ID,
    client_secret: env.X_CLIENT_SECRET,
    callback: env.X_CALLBACK_URL,
    scopes: ["tweet.read", "users.read", "offline.access"],
  });
}

export function createTwitterLoginUrl(): string {
  const authClient = createAuthClient();
  const state = randomUUID();
  const authUrl = authClient.generateAuthURL({
    code_challenge_method: "s256",
    state,
  });

  pendingAuth.set(state, {
    authClient,
    expiresAt: Date.now() + AUTH_TTL_MS,
  });

  return authUrl.toString();
}

export async function handleTwitterCallback(params: { state?: string; code?: string }) {
  const state = params.state?.trim() || "";
  const code = params.code?.trim() || "";
  const pending = pendingAuth.get(state);

  if (!state || !code || !pending || pending.expiresAt < Date.now()) {
    throw new Error("Invalid or expired X auth state");
  }

  pendingAuth.delete(state);
  await pending.authClient.requestAccessToken(code);

  const client = new Client(pending.authClient as any);
  const me = await (client as any).users.findMyUser({
    "user.fields": ["profile_image_url", "name", "username"],
  });

  const current = me?.data;
  if (!current?.id) {
    throw new Error("X login completed but user profile is unavailable");
  }

  const user = await UserModel.findOneAndUpdate(
    { xId: current.id },
    {
      xId: current.id,
      username: current.username ?? current.id,
      name: current.name ?? current.username ?? current.id,
      avatarUrl: current.profile_image_url,
      accessToken: (pending.authClient as any).token?.access_token,
      refreshToken: (pending.authClient as any).token?.refresh_token,
    },
    { new: true, upsert: true },
  );

  return user;
}
