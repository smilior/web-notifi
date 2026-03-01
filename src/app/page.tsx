"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Session = {
  id: number;
  url: string;
  dir: string | null;
  created_at: number;
};

type NotifStatus =
  | "idle"
  | "need-pwa"
  | "subscribing"
  | "subscribed"
  | "error";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as never)["standalone"] === true)
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function Home() {
  const [notifStatus, setNotifStatus] = useState<NotifStatus>("idle");
  const [notifError, setNotifError] = useState("");
  const [notifyUrl, setNotifyUrl] = useState("");
  const [swRegistration, setSwRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const subscriptionRef = useRef<PushSubscriptionJSON | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) setSessions(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const timer = setInterval(fetchSessions, 10000);
    return () => clearInterval(timer);
  }, [fetchSessions]);

  const buildNotifyUrl = (sub: PushSubscriptionJSON) => {
    const json = JSON.stringify(sub);
    const data = btoa(json)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `${window.location.origin}/api/push/notify?data=${data}`;
  };

  useEffect(() => {
    if (isIOS() && !isStandalone()) {
      setNotifStatus("need-pwa");
      return;
    }

    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      setNotifStatus("error");
      setNotifError("このブラウザは通知に対応していません");
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        setSwRegistration(reg);
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const subJson = sub.toJSON();
          subscriptionRef.current = subJson;
          setNotifyUrl(buildNotifyUrl(subJson));
          setNotifStatus("subscribed");
        }
      } catch (err) {
        setNotifError((err as Error).message);
        setNotifStatus("error");
      }
    };

    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
      return () => window.removeEventListener("load", registerSW);
    }
  }, []);

  const subscribe = async () => {
    if (!swRegistration) return;
    setNotifStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setNotifError("通知の許可が拒否されました");
        setNotifStatus("error");
        return;
      }
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });
      const subJson = sub.toJSON();
      subscriptionRef.current = subJson;
      setNotifyUrl(buildNotifyUrl(subJson));
      setNotifStatus("subscribed");
    } catch (err) {
      setNotifError((err as Error).message);
      setNotifStatus("error");
    }
  };

  const sendTest = async () => {
    if (!subscriptionRef.current || sending) return;
    setSending(true);
    try {
      await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Notifi",
          body: "接続確認: 通知は正常に動作しています",
          subscription: subscriptionRef.current,
        }),
      });
    } finally {
      setSending(false);
    }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(notifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // iOS PWA install screen
  if (notifStatus === "need-pwa") {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-[#111] border border-[#222] flex items-center justify-center mx-auto">
              <BellIcon size={28} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Notifi</h1>
              <p className="text-sm text-[#666] mt-1">
                プッシュ通知を受け取るには
                <br />
                ホーム画面に追加してください
              </p>
            </div>
          </div>
          <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-5">
            <ol className="space-y-4">
              {[
                <>
                  画面下の
                  <span className="text-white font-medium"> 共有ボタン </span>
                  をタップ
                </>,
                <>
                  <span className="text-white font-medium">
                    ホーム画面に追加
                  </span>
                  を選択
                </>,
                <>ホーム画面のアイコンから起動</>,
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1e1e1e] text-[#555] text-xs flex items-center justify-center font-medium mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[#888]">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
    );
  }

  const isSubscribed = notifStatus === "subscribed";

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-md mx-auto px-4 pt-14 pb-10 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#111] border border-[#1e1e1e] flex items-center justify-center">
              <BellIcon size={14} />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Notifi
            </span>
          </div>
          <button
            onClick={() => setShowNotifPanel(!showNotifPanel)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer"
            style={{
              background: isSubscribed ? "#052e16" : "#141414",
              color: isSubscribed ? "#4ade80" : "#666",
              border: `1px solid ${isSubscribed ? "#166534" : "#1e1e1e"}`,
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isSubscribed ? "bg-green-400" : "bg-[#444]"
              }`}
            />
            {isSubscribed
              ? "通知 ON"
              : notifStatus === "subscribing"
              ? "設定中..."
              : "通知 OFF"}
          </button>
        </div>

        {/* Notification panel */}
        {showNotifPanel && (
          <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-4 space-y-3">
            {notifStatus === "error" && (
              <p className="text-xs text-red-400/80">{notifError}</p>
            )}

            {!isSubscribed && notifStatus !== "subscribing" && (
              <button
                onClick={subscribe}
                disabled={!swRegistration}
                className="w-full py-2.5 rounded-xl text-sm font-medium bg-white text-black hover:bg-zinc-100 transition-colors disabled:opacity-40 cursor-pointer"
              >
                通知を有効にする
              </button>
            )}

            {notifStatus === "subscribing" && (
              <p className="text-xs text-[#555] text-center py-1">
                許可を確認中...
              </p>
            )}

            {isSubscribed && notifyUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#555]">外部トリガー URL</span>
                  <button
                    onClick={sendTest}
                    disabled={sending}
                    className="text-xs text-[#444] hover:text-[#777] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {sending ? "送信中..." : "テスト"}
                  </button>
                </div>
                <button
                  onClick={copyUrl}
                  className="w-full p-2.5 rounded-xl bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#2a2a2a] transition-colors text-left cursor-pointer"
                >
                  {copied ? (
                    <span className="text-xs text-green-400">コピーしました</span>
                  ) : (
                    <span className="text-xs text-[#444] break-all leading-relaxed">
                      {notifyUrl.replace(
                        typeof window !== "undefined"
                          ? window.location.origin
                          : "",
                        ""
                      )}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Sessions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-medium text-[#444] uppercase tracking-widest">
              Sessions
            </span>
            <button
              onClick={fetchSessions}
              className="text-[11px] text-[#333] hover:text-[#666] transition-colors cursor-pointer"
            >
              更新
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-[#333]">セッションはありません</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sessions.map((s) => (
                <a
                  key={s.id}
                  href={`/r?to=${encodeURIComponent(s.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-[#111] border border-[#1a1a1a] hover:border-[#2a2a2a] hover:bg-[#131313] transition-all group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] flex-shrink-0 flex items-center justify-center">
                    <TerminalIcon />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      {s.dir ? (
                        <span className="text-xs font-medium text-[#e0e0e0] truncate max-w-[160px]">
                          {s.dir}
                        </span>
                      ) : (
                        <span className="text-xs text-[#555] truncate">
                          {s.url.replace("https://claude.ai/code/", "")}
                        </span>
                      )}
                      <span className="text-[11px] text-[#3a3a3a] flex-shrink-0 ml-auto">
                        {formatDate(s.created_at)}
                      </span>
                    </div>
                    {s.dir && (
                      <div className="text-[11px] text-[#3a3a3a] truncate mt-0.5">
                        {s.url.replace("https://claude.ai/code/", "")}
                      </div>
                    )}
                  </div>
                  <svg
                    className="w-3.5 h-3.5 text-[#2a2a2a] group-hover:text-[#555] transition-colors flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#555"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function formatDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isToday) return `今日 ${time}`;
  if (isYesterday) return `昨日 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
