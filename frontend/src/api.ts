export type CurrentUser = {
  id: string;
  username: string;
  name: string;
  avatarUrl?: string;
};

export type VideoItem = {
  id: string;
  title: string;
  pageUrl: string;
  downloadUrl: string;
  localPath: string;
  createdAt: string;
};

export type SubscriptionQr = {
  id: string;
  status: "pending" | "linked" | "expired" | "failed";
  qrCodeUrl: string;
  expiresAt: string;
  weixinAccountId?: string;
  weixinUserId?: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 401) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getCurrentUser(): Promise<{ user: CurrentUser | null }> {
    return request("/api/me");
  },
  getRecentVideos(): Promise<{ videos: VideoItem[] }> {
    return request("/api/videos/recent");
  },
  createSubscriptionQr(): Promise<{ subscription: SubscriptionQr }> {
    return request("/api/subscriptions/qrcode", { method: "POST" });
  },
  getSubscriptionStatus(id: string): Promise<{ subscription: SubscriptionQr | null }> {
    return request(`/api/subscriptions/qrcode/${id}`);
  },
};
