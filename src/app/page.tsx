"use client";

import { useState, useEffect } from "react";

type Status = "default" | "subscribing" | "subscribed" | "sending" | "sent" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("default");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("テスト通知");
  const [body, setBody] = useState("これはWeb Push通知のテストです 🔔");
  const [swRegistration, setSwRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setMessage("このブラウザはService Workerに対応していません");
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

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (res.ok) {
        setStatus("subscribed");
        setMessage("通知の購読が完了しました ✅");
      } else {
        throw new Error("Subscription API failed");
      }
    } catch (err) {
      setMessage(`購読エラー: ${(err as Error).message}`);
      setStatus("error");
    }
  };

  const sendNotification = async () => {
    setStatus("sending");
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("sent");
        setMessage(
          `通知送信完了: ${data.succeeded}件成功, ${data.failed}件失敗`
        );
      } else {
        throw new Error(data.error || "Send failed");
      }
    } catch (err) {
      setMessage(`送信エラー: ${(err as Error).message}`);
      setStatus("error");
    }
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
              : status === "subscribed" || status === "sent"
              ? "bg-green-900/50 text-green-300"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {message || "通知を購読してテストしてください"}
        </div>

        {/* Step 1: Subscribe */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400">
            Step 1: 通知を購読する
          </h2>
          <button
            onClick={subscribe}
            disabled={status === "subscribing" || status === "subscribed"}
            className="w-full py-3 px-4 rounded-lg font-medium transition-colors
              bg-white text-black hover:bg-zinc-200
              disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {status === "subscribing"
              ? "購読中..."
              : status === "subscribed"
              ? "購読済み ✅"
              : "通知を許可して購読する"}
          </button>
        </div>

        {/* Step 2: Send */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400">
            Step 2: テスト通知を送信する
          </h2>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700
              focus:border-zinc-500 focus:outline-none text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="本文"
            rows={2}
            className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700
              focus:border-zinc-500 focus:outline-none text-sm resize-none"
          />
          <button
            onClick={sendNotification}
            disabled={status !== "subscribed" && status !== "sent"}
            className="w-full py-3 px-4 rounded-lg font-medium transition-colors
              bg-blue-600 text-white hover:bg-blue-500
              disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
          >
            {status === "sending" ? "送信中..." : "通知を送信する"}
          </button>
        </div>

        {/* iOS Instructions */}
        <div className="mt-8 p-4 rounded-lg bg-zinc-900 border border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">
            📱 iOSで通知を受け取るには
          </h3>
          <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
            <li>Safariでこのページを開く</li>
            <li>共有ボタン → 「ホーム画面に追加」</li>
            <li>ホーム画面から開き直す</li>
            <li>「通知を許可して購読する」をタップ</li>
            <li>テスト通知を送信する</li>
          </ol>
        </div>
      </div>
    </main>
  );
}

