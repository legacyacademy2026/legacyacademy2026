// Returns a full styled HTML page shown after an admin clicks a one-click action link.
function actionPage({ ok = true, title, message }) {
  const accent = ok ? '#6b7a5a' : '#a71d2a';
  const icon = ok ? '✅' : '⚠️';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title} — Legacy Équestre</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#f0ece0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
  .card { background:#fff; border:1px solid #e5ddcf; border-radius:16px; padding:48px 40px; max-width:460px; width:100%; text-align:center; box-shadow:0 14px 40px rgba(44,36,32,0.12); }
  .brand { font-family:'Cormorant Garamond',serif; font-size:1.5rem; letter-spacing:3px; color:#2c2420; }
  .brand-sub { font-size:11px; letter-spacing:4px; text-transform:uppercase; color:#6b7a5a; margin-bottom:28px; }
  .icon { font-size:3rem; margin-bottom:14px; }
  h1 { font-family:'Cormorant Garamond',serif; font-size:1.9rem; font-weight:600; color:${accent}; margin-bottom:12px; }
  p { color:#6b6560; line-height:1.7; font-size:0.98rem; }
  .foot { margin-top:28px; font-size:0.8rem; color:#9a938c; }
  a.dash { display:inline-block; margin-top:24px; background:#1a1a1a; color:#fff; text-decoration:none; padding:12px 26px; border-radius:6px; font-size:0.78rem; letter-spacing:1px; text-transform:uppercase; }
</style></head>
<body>
  <div class="card">
    <div class="brand">LEGACY</div>
    <div class="brand-sub">École Équestre</div>
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="dash" href="/admin.html">Open Dashboard</a>
    <p class="foot">You can close this window.</p>
  </div>
</body></html>`;
}

// Shown when an admin OPENS a one-click link. Requires clicking the button to act
// (so email/WhatsApp link scanners that prefetch the URL can't trigger the action).
function confirmPage({ title, message, actionUrl, buttonLabel, color = '#1e7e34', icon = '📋' }) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${title} — Legacy</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#f0ece0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
  .card { background:#fff; border:1px solid #e5ddcf; border-radius:16px; padding:44px 40px; max-width:460px; width:100%; text-align:center; box-shadow:0 14px 40px rgba(44,36,32,0.12); }
  .brand { font-family:'Cormorant Garamond',serif; font-size:1.5rem; letter-spacing:3px; color:#2c2420; }
  .brand-sub { font-size:11px; letter-spacing:4px; text-transform:uppercase; color:#6b7a5a; margin-bottom:24px; }
  .icon { font-size:2.6rem; margin-bottom:12px; }
  h1 { font-family:'Cormorant Garamond',serif; font-size:1.7rem; font-weight:600; color:#2c2420; margin-bottom:12px; }
  p { color:#6b6560; line-height:1.7; font-size:0.95rem; margin-bottom:8px; }
  button { display:inline-block; margin-top:22px; background:${color}; color:#fff; border:none; cursor:pointer; padding:14px 34px; border-radius:8px; font-size:0.85rem; font-weight:600; letter-spacing:1px; font-family:'Inter',sans-serif; }
  button:hover { opacity:0.9; }
  .foot { margin-top:22px; font-size:0.8rem; color:#9a938c; }
</style></head>
<body>
  <div class="card">
    <div class="brand">LEGACY</div>
    <div class="brand-sub">Admin</div>
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <form method="POST" action="${actionUrl}">
      <button type="submit">${buttonLabel}</button>
    </form>
    <p class="foot">This step confirms it's really you.</p>
  </div>
</body></html>`;
}

module.exports = { actionPage, confirmPage };
