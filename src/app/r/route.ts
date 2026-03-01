export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get("to");

  if (!to || !to.startsWith("https://claude.ai/code/session_")) {
    return Response.redirect(new URL("/", request.url));
  }

  const encodedUrl = encodeURIComponent(to);
  const chromeUrl = `googlechromes://navigate?url=${encodedUrl}`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting...</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    a { color: #1a73e8; font-size: 16px; margin-top: 12px; }
    p { color: #555; }
  </style>
</head>
<body>
  <p>Chromeで開いています...</p>
  <a href="${to}">うまく開かない場合はここをタップ</a>
  <script>
    window.location.href = ${JSON.stringify(chromeUrl)};
    setTimeout(() => { window.location.href = ${JSON.stringify(to)}; }, 2000);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
