import { FormEvent, useEffect, useState } from "react";

import { adminApi, getAdminToken, setAdminToken, type AdminMessage, type AdminUser } from "./api";

type AdminIdentity = { username: string } | null;

export default function App() {
  const [admin, setAdmin] = useState<AdminIdentity>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [composeText, setComposeText] = useState("");
  const [broadcastText, setBroadcastText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ linkedUsers: 0, totalUsers: 0, totalMessages: 0 });

  useEffect(() => {
    if (!getAdminToken()) return;

    void adminApi.me()
      .then((payload) => setAdmin(payload.admin))
      .catch(() => {
        setAdminToken(null);
        setAdmin(null);
      });
  }, []);

  useEffect(() => {
    if (!admin) return;
    void loadDashboard();
  }, [admin]);

  useEffect(() => {
    if (!admin || !selectedUserId) return;

    void loadMessages(selectedUserId);
    const timer = window.setInterval(() => {
      void loadMessages(selectedUserId);
      void refreshUsers();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [admin, selectedUserId]);

  async function loadDashboard() {
    await Promise.all([refreshUsers(), refreshStats()]);
  }

  async function refreshUsers() {
    const payload = await adminApi.listUsers();
    setUsers(payload.users);
    if (!selectedUserId && payload.users[0]) {
      setSelectedUserId(payload.users[0].id);
    }
  }

  async function refreshStats() {
    const payload = await adminApi.stats();
    setStats(payload);
  }

  async function loadMessages(subscriptionId: string) {
    const payload = await adminApi.listMessages(subscriptionId);
    setMessages(payload.messages);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const payload = await adminApi.login(loginForm.username, loginForm.password);
      setAdminToken(payload.token);
      setAdmin(payload.admin);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Login failed");
    }
  }

  async function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedUserId || !composeText.trim()) return;
    setError(null);
    try {
      await adminApi.sendMessage(selectedUserId, composeText.trim());
      setComposeText("");
      await loadMessages(selectedUserId);
      await refreshUsers();
      await refreshStats();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Send failed");
    }
  }

  async function handleBroadcast(event: FormEvent) {
    event.preventDefault();
    if (!broadcastText.trim()) return;
    setError(null);
    try {
      await adminApi.broadcast(broadcastText.trim());
      setBroadcastText("");
      await refreshUsers();
      await refreshStats();
      if (selectedUserId) {
        await loadMessages(selectedUserId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Broadcast failed");
    }
  }

  function handleLogout() {
    setAdminToken(null);
    setAdmin(null);
    setUsers([]);
    setMessages([]);
    setSelectedUserId(null);
  }

  if (!admin) {
    return (
      <div className="admin-shell">
        <div className="login-card">
          <div className="eyebrow">91bot Admin</div>
          <h1>Admin Login</h1>
          <p>Use the fixed backend credentials from `.env` to access the control panel.</p>
          <form onSubmit={handleLogin} className="stack">
            <input
              value={loginForm.username}
              onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="Username"
            />
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Password"
            />
            <button type="submit">Login</button>
          </form>
          {error ? <div className="error-banner">{error}</div> : null}
        </div>
      </div>
    );
  }

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div>
            <div className="eyebrow">Signed in</div>
            <div className="admin-name">{admin.username}</div>
          </div>
          <button className="ghost-button" onClick={handleLogout}>Logout</button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Linked Users</span>
            <strong>{stats.linkedUsers}</strong>
          </div>
          <div className="stat-card">
            <span>X Users</span>
            <strong>{stats.totalUsers}</strong>
          </div>
          <div className="stat-card">
            <span>Messages</span>
            <strong>{stats.totalMessages}</strong>
          </div>
        </div>

        <form onSubmit={handleBroadcast} className="broadcast-card">
          <div className="section-title">Broadcast</div>
          <textarea
            value={broadcastText}
            onChange={(event) => setBroadcastText(event.target.value)}
            rows={4}
            placeholder="Send a message to all linked users"
          />
          <button type="submit">Send Broadcast</button>
        </form>

        <div className="user-list">
          <div className="section-title">Users</div>
          {users.map((user) => (
            <button
              key={user.id}
              className={`user-card ${selectedUserId === user.id ? "selected" : ""}`}
              onClick={() => setSelectedUserId(user.id)}
            >
              <div className="user-name">{user.xUser?.name ?? "Unknown user"}</div>
              <div className="user-handle">@{user.xUser?.username ?? "unknown"}</div>
              <div className="user-sub">{user.weixinUserId ?? "No Weixin ID"}</div>
              {user.lastMessage ? (
                <div className="user-preview">
                  <span>{user.lastMessage.direction === "inbound" ? "IN" : "OUT"}</span>
                  <span>{user.lastMessage.text}</span>
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-panel">
        <div className="chat-head">
          <div>
            <div className="eyebrow">Realtime chat window</div>
            <h2>{selectedUser?.xUser?.name ?? "Select a user"}</h2>
            <div className="chat-meta">{selectedUser?.weixinUserId ?? "No active subscription selected"}</div>
          </div>
        </div>

        <div className="message-list">
          {messages.map((message) => (
            <div key={message.id} className={`message-bubble ${message.direction === "outbound" ? "outbound" : "inbound"}`}>
              <div className="message-source">{message.source}</div>
              <div>{message.text}</div>
              <div className="message-time">{new Date(message.createdAt).toLocaleString()}</div>
            </div>
          ))}
          {!messages.length ? <div className="empty-state">No conversation selected or no messages yet.</div> : null}
        </div>

        <form onSubmit={handleSendMessage} className="composer">
          <textarea
            value={composeText}
            onChange={(event) => setComposeText(event.target.value)}
            rows={3}
            placeholder="Send a direct message to the selected user"
            disabled={!selectedUserId}
          />
          <button type="submit" disabled={!selectedUserId || !composeText.trim()}>
            Send
          </button>
        </form>

        {error ? <div className="error-banner">{error}</div> : null}
      </main>
    </div>
  );
}
