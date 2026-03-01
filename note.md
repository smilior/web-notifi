# Next.js + Vercel で iOS Web Push通知を実装してみた

iPhoneにWeb Push通知を送りたい。ただそれだけのことなのに、意外とハマりどころが多かったので、実際に動くところまでの全記録をまとめます。

## やりたかったこと

- Webサイトにアクセスして、iOSのホーム画面に追加すると通知が受けられる仕組み
- Next.js + Vercel でミニマルに構築
- 外部からURLを叩くだけで通知が飛ぶテスト用APIも用意

## 技術スタック

- **Next.js 16**（App Router）
- **Vercel**（ホスティング + サーバーレス関数）
- **web-push**（VAPID認証 + プッシュ通知送信）
- **Service Worker**（通知の受信・表示）
- **PWA**（manifest.json によるホーム画面追加対応）

## 全体のアーキテクチャ

```
[ブラウザ/PWA]
    │
    ├─ Service Worker登録 (sw.js)
    ├─ Push購読 (pushManager.subscribe)
    │
    ├─ POST /api/push/send ← ボタンから即時通知
    └─ GET  /api/push/notify?data=... ← URLを開くだけで通知（外部トリガー用）
            │
            ▼
      [web-push ライブラリ]
            │
            ▼
      [Apple/Google Push Service]
            │
            ▼
      [デバイスに通知表示]
```

## 実装のポイント

### 1. VAPIDキーの生成

Web Push通知にはVAPIDキーペア（公開鍵・秘密鍵）が必要です。

```bash
npx web-push generate-vapid-keys --json
```

生成された鍵を `.env.local` と Vercelの環境変数に設定します。

### 2. PWAマニフェスト

iOSでWeb Push通知を受けるには、**PWAとしてホーム画面に追加する必要**があります。そのために `manifest.json` が必須。

```json
{
  "name": "Web Push Test",
  "short_name": "PushTest",
  "start_url": "/",
  "display": "standalone",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`layout.tsx` で以下のメタタグも必要：

```tsx
export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PushTest",
  },
};
```

### 3. Service Worker

`public/sw.js` に配置。プッシュイベントを受信して通知を表示するだけのシンプルな実装。

```js
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "テスト通知";
  const options = {
    body: data.body || "Web Push通知のテストです",
    icon: "/icon-192.png",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
```

### 4. 外部トリガー用のGET API

購読情報をbase64urlエンコードしてURLに埋め込み、GETリクエストだけで通知を送れるエンドポイント。CRONジョブや外部サービスからの連携に便利。

```
GET /api/push/notify?data=<base64url>&title=お知らせ&body=内容
```

## ハマったポイント 7選

### 1. iOS SafariではService Workerが登録できない

**症状**: iOSのSafariでページを開くと「SW登録エラー」が表示される。

**原因**: iOSではSafariブラウザ単体ではWeb Push通知に対応していない。**ホーム画面に追加してPWAとして起動した場合のみ**Service Workerが動作する（iOS 16.4以降）。

**対策**: iOSかつスタンドアロンモードでない場合を検知して、エラーではなく「ホーム画面に追加してください」のガイドを表示するようにした。

```ts
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator["standalone"] === true)
  );
}

if (isIOS() && !isStandalone()) {
  // エラーではなくPWAインストールガイドを表示
}
```

### 2. applicationServerKey の形式エラー

**症状**: `pushManager.subscribe()` で「applicationServerKey is not properly base64-url-encoded」エラー。

**原因**: `applicationServerKey` にはVAPIDの公開鍵文字列をそのまま渡せるブラウザ（Chrome）と、`Uint8Array` に変換が必要なブラウザ（Safari/WebKit系）がある。

**対策**: 常に `Uint8Array` に変換して渡す。

```ts
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
```

### 3. Vercelサーバーレスでインメモリストアが共有されない

**症状**: 購読APIで保存したsubscriptionが、送信APIから参照すると空。

**原因**: Vercelのサーバーレス関数は、APIルートごとに別々のインスタンスで実行される。インメモリの変数はリクエスト間で共有されない。

**対策**: クライアント側にsubscription情報を保持し、送信時にまとめてサーバーに渡す方式に変更。DBが不要になりシンプルになった。

### 4. ビルド時にVAPIDキーが未設定でクラッシュ

**症状**: Vercelのビルド中に「No subject set in vapidDetails.subject」エラー。

**原因**: `webpush.setVapidDetails()` をモジュールのトップレベルで呼んでいたため、ビルド時（環境変数がない状態）にも実行されてしまう。

**対策**: `setVapidDetails` をリクエストハンドラ内で遅延実行するように変更。

```ts
// NG: モジュールのトップレベル
webpush.setVapidDetails(...); // ← ビルド時にもここが実行される

// OK: リクエスト時に実行
export async function POST(request: Request) {
  webpush.setVapidDetails(...); // ← リクエスト時のみ実行
}
```

### 5. Vercel環境変数に改行が混入

**症状**: Vercelデプロイ後「VAPID public key must be a URL safe Base64 (without '=')」エラー。ローカルでは動く。

**原因**: `echo "キー値" | vercel env add` で環境変数を設定した際、`echo` が末尾に改行 `\n` を付加する。この改行がBase64バリデーションに引っかかる。

**対策**: `printf`（改行なし）で設定し直す。

```bash
# NG
echo "BNZfGq..." | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production

# OK
printf 'BNZfGq...' | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
```

**これが一番気づきにくかった。** ローカルでは `.env.local` から読むので問題なく、Vercel上でのみ発生する。

### 6. web-push の型定義が存在しない

**症状**: ビルド時に「Could not find a declaration file for module 'web-push'」。

**対策**: `src/types/web-push.d.ts` を作成して型を手動定義。

```ts
declare module "web-push" {
  interface PushSubscription { ... }
  function setVapidDetails(...): void;
  function sendNotification(...): Promise<SendResult>;
  export { PushSubscription, SendResult, setVapidDetails, sendNotification };
}
```

### 7. Vercelサーバーレスで setTimeout は使えない

「1分後に通知を送る」機能を検討した際に気づいた点。

**原因**: Vercelのサーバーレス関数はレスポンス返却後にプロセスが終了する。サーバー側で `setTimeout` を使っても、コールバックが実行される前にプロセスが消える。

**対策**: 遅延実行が必要な場合の選択肢は以下の通り。
- クライアント側で `setInterval` によるタイマーを管理し、時間経過後にAPIを呼ぶ
- Vercel Cron Jobs でスケジュール実行する
- Upstash QStash などの外部スケジューラを使う

今回は遅延通知は不要だったためスキップしたが、知っておくべき制約。

## ファイル構成

```
public/
  sw.js              # Service Worker
  manifest.json      # PWAマニフェスト
  icon-192.png       # アイコン
  icon-512.png
src/
  app/
    layout.tsx        # PWAメタタグ設定
    page.tsx          # メインUI（購読・送信・テストURL表示）
    api/push/
      send/route.ts   # POST: 即時通知送信
      notify/route.ts # GET: URL経由の通知送信（外部トリガー用）
  types/
    web-push.d.ts     # web-pushの型定義
.env.local            # VAPIDキー（ローカル用）
```

## iOSでの動作手順

1. Safariで `https://web-notifi.vercel.app` を開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面から開き直す（PWAとして起動される）
4. 「通知を許可して購読する」をタップ
5. 「今すぐ通知を送信」で動作確認
6. 表示された「外部テストURL」をコピーすれば、PCブラウザやcurlからも通知を飛ばせる

## 補足: subscription データの正体とセキュリティ

### subscription はどこから来るのか

`pushManager.subscribe()` を呼ぶと、**ブラウザが生成**して返してくれる。サーバーからのレスポンスではない。

```ts
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
});

// sub.toJSON() の中身:
{
  endpoint: "https://web.push.apple.com/QGx...",  // Apple/Googleの送信先URL
  keys: {
    p256dh: "BL81Lmg...",  // 暗号化用の公開鍵
    auth: "C-tuLs..."      // 認証トークン
  }
}
```

- `endpoint` はApple（またはGoogle）のプッシュサービスのURL。デバイスごとに一意
- `keys.p256dh` と `keys.auth` は通知ペイロードの暗号化に使われる鍵

今回のテスト構成ではこのデータをクライアント側に保持してURLに埋め込んでいるが、**本番ではDBに保存するのが必須**。

### なぜDBが必要か

| やりたいこと | DB不要（今回） | DB必要（本番） |
|---|---|---|
| 自分で自分に通知 | OK | OK |
| 複数デバイスに通知 | NG | OK |
| CRONで定期通知 | NG | OK |
| ユーザー管理 + セグメント配信 | NG | OK |

### subscription データは守るべき情報

**このデータが漏洩すると、第三者がそのデバイスに通知を送信できてしまう。**

- `endpoint` を知っていれば送信先がわかる
- `keys` があれば通知内容を暗号化して送れる
- VAPID秘密鍵 + subscription があれば、誰でもそのデバイスに通知を飛ばせる

つまり subscription データは**個人情報に準ずる扱い**が必要。

### 本番での保存方針

```
[購読時]
ブラウザ → subscribe() → subscription取得
  → endpoint, keys を暗号化してDBに保存
  → ユーザーIDと紐付け

[通知送信時]
Cron / 管理画面 → DBから購読者取得 → 復号 → web-push で送信
```

**保存時に考慮すべき点:**

- **暗号化して保存**: endpoint と keys は AES-256 等で暗号化してDBに格納する。暗号鍵は環境変数で管理
- **VAPID秘密鍵の厳重管理**: これが漏れると全subscriptionに対して通知を送れる。環境変数に置き、コードにハードコードしない
- **不要なsubscriptionの削除**: プッシュサービスから410（Gone）が返った場合はsubscriptionが無効化されているため、DBから削除する
- **HTTPSの強制**: subscription データの送受信は必ずHTTPS経由（Vercelならデフォルトで対応）

### 本番構成のイメージ

```
[購読時]
iPhone PWA → subscribe() → POST /api/push/subscribe
  → subscription を暗号化 → DB (Turso/Vercel KV) に保存

[通知送信時]
Vercel Cron → GET /api/push/cron
  → DBから全購読者取得 → 復号 → 各デバイスに web-push で送信
  → 410エラーの購読者はDBから削除
```

技術選定の例:
- **DB**: Turso（SQLite、無料枠あり）or Vercel KV（Redis）
- **暗号化**: Node.js `crypto` モジュール（AES-256-GCM）
- **スケジューラ**: Vercel Cron Jobs（`vercel.json` で定義）

## まとめ

Web Push通知の仕組み自体はシンプルだが、**iOS固有の制約**（PWA必須、Uint8Array変換必須）と **Vercelサーバーレスの制約**（インメモリ非共有、setTimeout不可、環境変数の改行問題）の組み合わせで、思った以上にハマりポイントが多かった。

特に「Vercelの環境変数に `echo` で改行が入る」問題は、ローカルでは再現しないため原因特定が難しい。`printf` を使う癖をつけるのが吉。

最終的に、DB不要・外部サービス不要で、URLを叩くだけで通知が飛ぶミニマルな構成にできた。

**ただし、本番運用するなら subscription データのDB保存と暗号化は必須。** このデータは「そのデバイスに通知を送れる鍵」であり、漏洩すれば第三者からの不正な通知送信が可能になる。テスト構成から本番構成へのステップアップとして、DB + 暗号化 + Cron の導入を推奨する。
