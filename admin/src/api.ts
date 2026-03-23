export type AdminUser = {
  id: string;
  status: string;
  linkedAt?: string;
  weixinUserId?: string | null;
  weixinAccountId?: string | null;
  xUser?: {
    id: string;
    name: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
  lastMessage?: {
    text: string;
    direction: "inbound" | "outbound";
    createdAt: string;
  } | null;
};

export type AdminMessage = {
  id: string;
  direction: "inbound" | "outbound";
  source: "user" | "bot" | "admin" | "broadcast";
  text: string;
  messageId?: string | null;
  createdAt: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const ADMIN_TOKEN_KEY = "91bot_admin_token";

export function getAdminToken(): string | null {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export const adminApi = {
  login(username: string, password: string) {
    return request<{ token: string; admin: { username: string } }>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  me() {
    return request<{ admin: { username: string } | null }>("/api/admin/me");
  },
  stats() {
    return request<{ linkedUsers: number; totalUsers: number; totalMessages: number }>("/api/admin/stats");
  },
  listUsers() {
    return request<{ users: AdminUser[] }>("/api/admin/users");
  },
  listMessages(subscriptionId: string) {
    return request<{ subscription: { id: string; weixinUserId?: string | null; status: string }; messages: AdminMessage[] }>(
      `/api/admin/users/${subscriptionId}/messages`,
    );
  },
  sendMessage(subscriptionId: string, text: string) {
    return request<{ ok: boolean }>(`/api/admin/users/${subscriptionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
  broadcast(text: string) {
    return request<{ sent: number; failed: number }>("/api/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
};
