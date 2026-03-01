"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Session = {
  id: number;
  url: string;
  dir: string | null;
  created_at: number;
};

type Status =
  | "default"
  | "need-pwa"
  | "subscribing"
  | "subscribed"
  | "sending"
  | "sent"
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
  const [status, setStatus] = useState<Status>("default");
  const [message, setMessage] = useState("");
  const [notifyUrl, setNotifyUrl] = useState("");
  const [swRegistration, setSwRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const subscriptionRef = useRef<PushSubscriptionJSON | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);

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
      setStatus("need-pwa");
      setMessage(
        "iOSではホーム画面に追加してから開き直してください（下の手順を参照）"
      );
      return;
    }

    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      setMessage("このブラウザは通知に対応していません");
      setStatus("error");
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
          setStatus("subscribed");
          setMessage("通知の購読済みです");
        }
      } catch (err) {
        setMessage(`SW登録エラー: ${(err as Error).message}`);
        setStatus("error");
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
    setStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("通知の許可が拒否されました");
        setStatus("error");
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
      setStatus("subscribed");
      setMessage("通知の購読が完了しました");
    } catch (err) {
      setMessage(`購読エラー: ${(err as Error).message}`);
      setStatus("error");
    }
  };

  const sendNow = async () => {
    if (!subscriptionRef.current) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "テスト通知",
          body: "ボタンからの送信テスト",
          subscription: subscriptionRef.current,
        }),
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (res.ok) {
        setStatus("sent");
        setMessage("通知を送信しました");
      } else {
        throw new Error(data.error || "Send failed");
      }
    } catch (err) {
      setMessage(`送信エラー: ${(err as Error).message}`);
      setStatus("error");
    }
  };

  const canSend =
    status === "subscribed" || status === "sent" || status === "sending";

  const copyUrl = async () => {
    await navigator.clipboard.writeText(notifyUrl);
    setMessage("URLをコピーしました");
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">Web Push 通知テスト</h1>

        {/* Status */}
        <div
          className={`p-3 rounded-lg text-sm text-center ${
            status === "error"
              ? "bg-red-900/50 text-red-300"
              : status === "need-pwa"
              ? "bg-yellow-900/50 text-yellow-300"
              : canSend
              ? "bg-green-900/50 text-green-300"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {message || "通知を購読してテストしてください"}
        </div>

        {/* iOS Safari: PWA instructions */}
        {status === "need-pwa" && (
          <div className="p-5 rounded-lg bg-yellow-900/30 border border-yellow-800">
            <h3 className="text-base font-semibold text-yellow-200 mb-3">
              ホーム画面に追加してください
            </h3>
            <ol className="text-sm text-yellow-300/80 space-y-3 list-decimal list-inside">
              <li>
                画面下の{" "}
                <span className="inline-block bg-zinc-700 px-2 py-0.5 rounded text-xs">
                  共有ボタン ↑
                </span>{" "}
                をタップ
              </li>
              <li>
                「
                <span className="font-semibold text-yellow-200">
                  ホーム画面に追加
                </span>
                」を選択
              </li>
              <li>ホーム画面に追加されたアイコンからもう一度開く</li>
            </ol>
          </div>
        )}

        {/* Step 1: Subscribe */}
        {status !== "need-pwa" && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-400">
              Step 1: 通知を購読する
            </h2>
            <button
              onClick={subscribe}
              disabled={status === "subscribing" || canSend}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors
                bg-white text-black hover:bg-zinc-200
                disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
            >
              {status === "subscribing"
                ? "購読中..."
                : canSend
                ? "購読済み"
                : "通知を許可して購読する"}
            </button>
          </div>
        )}

        {/* Step 2: Send / Test URL */}
        {canSend && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-400">
              Step 2: テスト通知を送信する
            </h2>

            <button
              onClick={sendNow}
              disabled={status === "sending"}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors
                bg-blue-600 text-white hover:bg-blue-500
                disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
            >
              {status === "sending" ? "送信中..." : "今すぐ通知を送信"}
            </button>

            {/* Notify URL */}
            {notifyUrl && (
              <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-700 space-y-2">
                <h3 className="text-sm font-semibold text-zinc-300">
                  外部からの通知テストURL
                </h3>
                <p className="text-xs text-zinc-500">
                  このURLをブラウザで開くと通知が届きます。
                  title / body パラメータでカスタマイズ可能。
                </p>
                <div className="bg-black p-2 rounded text-xs text-green-400 break-all max-h-20 overflow-auto">
                  {notifyUrl}
                </div>
                <button
                  onClick={copyUrl}
                  className="w-full py-2 px-3 rounded text-sm font-medium
                    bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
                >
                  URLをコピー
                </button>
                <p className="text-xs text-zinc-600">
                  例: ...&title=Hello&body=こんにちは
                </p>
              </div>
            )}
          </div>
        )}

        {/* iOS Instructions */}
        {status !== "need-pwa" && !canSend && (
          <div className="mt-8 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">
              iOSで通知を受け取るには
            </h3>
            <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
              <li>Safariでこのページを開く</li>
              <li>共有ボタン →「ホーム画面に追加」</li>
              <li>ホーム画面から開き直す</li>
              <li>「通知を許可して購読する」をタップ</li>
            </ol>
          </div>
        )}

        {/* Session History */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400">
              Claude セッション履歴
            </h2>
            <button
              onClick={fetchSessions}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              更新
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800 text-center text-xs text-zinc-600">
              セッションはまだありません
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <a
                  key={s.id}
                  href={`/r?to=${encodeURIComponent(s.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      {s.dir && (
                        <span className="text-xs font-medium text-blue-400">
                          {s.dir}
                        </span>
                      )}
                      <span className="text-xs text-zinc-600">
                        {formatDate(s.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {s.url.replace("https://claude.ai/code/", "")}
                    </div>
                  </div>
                  <span className="ml-3 text-zinc-600 group-hover:text-zinc-300 transition-colors text-sm">
                    →
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function formatDate(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `今日 ${time}`;
  if (isYesterday) return `昨日 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}
