import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import {
  api,
  apiUrl,
  getAuthToken,
  setAuthToken,
  type CurrentUser,
  type SubscriptionQr,
  type VideoItem,
} from "./api";

function formatRemaining(expiresAt: string) {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return `${Math.floor(diff / 60_000)}m ${Math.floor((diff % 60_000) / 1000)}s`;
}

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [qr, setQr] = useState<SubscriptionQr | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const xLoginUrl = useMemo(() => apiUrl("/api/auth/x/login"), []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const loginToken = currentUrl.searchParams.get("token");
    const loginStatus = currentUrl.searchParams.get("login");
    const loginReason = currentUrl.searchParams.get("reason");

    if (loginToken) {
      setAuthToken(loginToken);
    }

    if (loginStatus === "failed") {
      setError(loginReason || "X login failed");
    }

    if (loginToken || loginStatus || loginReason) {
      currentUrl.searchParams.delete("token");
      currentUrl.searchParams.delete("login");
      currentUrl.searchParams.delete("reason");
      window.history.replaceState({}, document.title, currentUrl.toString());
    }

    void api.getCurrentUser()
      .then((payload) => {
        setUser(payload.user);
        if (!payload.user && getAuthToken()) {
          setAuthToken(null);
        }
      })
      .catch(() => {
        setUser(null);
        setAuthToken(null);
      });

    void api.getRecentVideos()
      .then((payload) => setVideos(payload.videos))
      .catch(() => setVideos([]));
  }, []);

  useEffect(() => {
    if (!qr || qr.status !== "pending") return;

    const timer = window.setInterval(() => {
      void api.getSubscriptionStatus(qr.id)
        .then((payload) => {
          if (payload.subscription) {
            setQr(payload.subscription);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => window.clearInterval(timer);
  }, [qr]);

  useEffect(() => {
    if (!qr?.qrCodeUrl) {
      setQrImageUrl(null);
      return;
    }

    let cancelled = false;
    void QRCode.toDataURL(qr.qrCodeUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    })
      .then((nextUrl: string) => {
        if (!cancelled) {
          setQrImageUrl(nextUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrImageUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qr?.qrCodeUrl]);

  const statusLabel = useMemo(() => {
    if (!qr) return "Not generated";
    if (qr.status === "pending") return `Active for ${formatRemaining(qr.expiresAt)}`;
    if (qr.status === "linked") return "Weixin linked";
    if (qr.status === "expired") return "QR expired";
    return "Link failed";
  }, [qr]);

  async function handleGenerateQr() {
    setLoadingQr(true);
    setError(null);
    try {
      const payload = await api.createSubscriptionQr();
      setQr(payload.subscription);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to generate QR");
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="backdrop-orb orb-a" />
      <div className="backdrop-orb orb-b" />

      <header className="hero-card glass">
        <div className="brand-line">
          <span className="brand-pill">X Login + Weixin Subscription</span>
          <span className="brand-pill muted">Random Video Feed</span>
        </div>
        <div className="hero-grid">
          <div>
            <h1>91bot</h1>
            <p className="lede">
              任何人都可以通过 X 登录，然后生成微信订阅二维码，把自己关联到一个自动推送 Bot。
              后端会每 15 分钟抓取一个合法视频源中的随机视频，并把新内容同步给已关联用户。
            </p>
            <div className="cta-row">
              {!user ? (
                <a className="cta-primary" href={xLoginUrl}>
                  使用 X 登录
                </a>
              ) : (
                <button className="cta-primary" onClick={() => void handleGenerateQr()} disabled={loadingQr}>
                  {loadingQr ? "生成中..." : "生成微信订阅 QR Code"}
                </button>
              )}
              <a className="cta-secondary" href="#feed">
                查看最新内容
              </a>
            </div>
          </div>

          <div className="dashboard-panel neu">
            <div className="panel-head">
              <span>Subscriber Console</span>
              <span className={`status-dot ${user ? "online" : "offline"}`} />
            </div>

            <div className="account-box glass-inset">
              {user ? (
                <>
                  <div className="account-row">
                    <div>
                      <div className="eyebrow">Logged in with X</div>
                      <div className="account-name">{user.name}</div>
                      <div className="account-handle">@{user.username}</div>
                    </div>
                    {user.avatarUrl ? <img className="avatar" src={user.avatarUrl} alt={user.name} /> : null}
                  </div>

                  <div className="qr-block">
                    <div className="eyebrow">Weixin subscription QR</div>
                    <div className="status-line">{statusLabel}</div>
                    {qr ? (
                      <div className="qr-frame glass">
                        <div className="qr-visual">
                          {qrImageUrl ? <img src={qrImageUrl} alt="Weixin subscription QR" /> : <div className="qr-loading">Generating QR...</div>}
                          <a className="qr-link" href={qr.qrCodeUrl} target="_blank" rel="noreferrer">
                            Open raw subscription link
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="qr-placeholder">Generate a 5-minute QR link to bind your Weixin bot.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="locked-box">
                  <div className="eyebrow">Authentication required</div>
                  <p>先使用 X 登录，之后才能生成订阅二维码并查看你的绑定状态。</p>
                </div>
              )}
            </div>

            {error ? <div className="error-banner">{error}</div> : null}
          </div>
        </div>
      </header>

      <main className="content-grid">
        <section className="feature-strip" id="feed">
          <article className="feature-card glass">
            <h2>Feature Surface</h2>
            <ul>
              <li>X OAuth login</li>
              <li>5-minute Weixin subscription QR</li>
              <li>MongoDB persistence for users, videos, bot bindings</li>
              <li>Automatic random-video crawl every 15 minutes</li>
              <li>Push new videos to linked users</li>
            </ul>
          </article>
          <article className="feature-card neu">
            <h2>Bot Behavior</h2>
            <ul>
              <li>绑定成功后排队发送欢迎视频</li>
              <li>新视频入库时自动尝试推送</li>
              <li>用户在微信里发任何消息，自动回复一个随机视频</li>
              <li>支持未建立上下文时的待发送队列</li>
            </ul>
          </article>
        </section>

        <section className="feed-card glass">
          <div className="section-head">
            <h2>Latest Crawled Videos</h2>
            <span>{videos.length} items</span>
          </div>
          <div className="video-list">
            {videos.map((video) => (
              <a key={video.id} className="video-item neu" href={video.pageUrl} target="_blank" rel="noreferrer">
                <div className="video-meta">
                  <div className="eyebrow">Random source crawl</div>
                  <div className="video-title">{video.title}</div>
                  <div className="video-subtitle">{new Date(video.createdAt).toLocaleString()}</div>
                </div>
                <div className="video-action">Source</div>
              </a>
            ))}
            {!videos.length ? <div className="empty-state">Crawler has not stored a video yet.</div> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
