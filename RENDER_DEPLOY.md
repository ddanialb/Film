# راهنمای استقرار روی Render.com

## مراحل استقرار

### 1. ساخت اکانت Render

1. برو به https://render.com
2. Sign up کن (با GitHub راحت‌تره)

### 2. Push کردن کد به GitHub

```bash
# اگه هنوز Git init نکردی
git init
git add .
git commit -m "Initial commit"

# ساخت repo در GitHub و push
git remote add origin https://github.com/your-username/film-bina.git
git branch -M main
git push -u origin main
```

### 3. ساخت Web Service در Render

1. برو به Render Dashboard
2. کلیک کن: **New +** → **Web Service**
3. Connect کن GitHub repo رو
4. تنظیمات:
   - **Name:** `film-bina` (یا هر اسمی که میخوای)
   - **Region:** `Frankfurt` یا `Oregon` (نزدیک‌تر بهتره)
   - **Branch:** `main`
   - **Root Directory:** خالی بذار
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free` (برای شروع)

### 4. تنظیم Environment Variables

در صفحه Web Service، برو به **Environment** و این متغیرها رو اضافه کن:

```
FARSILAND_USERNAME=dani12345
FARSILAND_PASSWORD=danialba13A@
PORT=3000
TELEGRAM_API_ID=29488178
TELEGRAM_API_HASH=c887660587c02e08d5e0f1b9e6db1db6
TELEGRAM_PHONE=+3584573969869
TELEGRAM_2FA_PASSWORD=danialba13
```

⚠️ **مهم:** `SOCKS_PROXY_HOST` و `SOCKS_PROXY_PORT` رو اضافه **نکن**! سرورهای Render خارج از ایران هستند و نیازی به پروکسی ندارند.

### 5. Deploy

کلیک کن: **Create Web Service**

Render شروع میکنه به build و deploy. صبر کن تا تموم بشه (حدود 2-3 دقیقه).

### 6. لاگین تلگرام

بعد از deploy موفق:

1. برو به URL سرویست: `https://your-app.onrender.com/telegram.html`
2. جستجو کن: "Inception"
3. کلیک کن: "Get Download Links"
4. کلیک کن: "Login"
5. کد تلگرام رو وارد کن

### 7. کپی کردن Session

1. برو به Render Dashboard → Logs
2. پیدا کن این خطوط:
   ```
   💡 Add to .env: TELEGRAM_SESSION=1AgAOMTQ5...
   💡 Add to .env: STREAMWIDE_REFRESH_TOKEN=eyJhbGci...
   ```
3. کپی کن session و token رو
4. برو به **Environment** و اضافه کن:
   ```
   TELEGRAM_SESSION=1AgAOMTQ5...
   STREAMWIDE_REFRESH_TOKEN=eyJhbGci...
   ```
5. سرویس خودکار redeploy میشه

### 8. تمام! ✅

حالا اپت روی `https://your-app.onrender.com` در دسترسه!

---

## مشکلات رایج

### خطای ECONNREFUSED 127.0.0.1:10808

**علت:** پروکسی تنظیم شده ولی در دسترس نیست.

**راه حل:** از Environment Variables حذف کن:
- `SOCKS_PROXY_HOST`
- `SOCKS_PROXY_PORT`

سرورهای Render نیازی به پروکسی ندارند.

### Session منقضی شده

**راه حل:**
1. از Environment Variables حذف کن: `TELEGRAM_SESSION`
2. دوباره لاگین کن از `/telegram.html`
3. Session جدید رو از Logs کپی کن
4. به Environment اضافه کن

### Build Failed

**چک کن:**
- `package.json` درست هست؟
- `node_modules/` در `.gitignore` هست؟
- Build Command: `npm install`
- Start Command: `npm start`

### App Sleeping (Free Plan)

Render Free plan بعد از 15 دقیقه بی‌استفاده، اپ رو sleep میکنه.

**راه حل:**
1. Upgrade کن به Paid plan ($7/month)
2. یا از UptimeRobot استفاده کن برای ping کردن هر 5 دقیقه

---

## Custom Domain

### اضافه کردن دامنه

1. برو به **Settings** → **Custom Domains**
2. کلیک کن: **Add Custom Domain**
3. وارد کن: `your-domain.com`
4. در DNS provider خودت، اضافه کن:
   ```
   Type: CNAME
   Name: @
   Value: your-app.onrender.com
   ```
5. صبر کن تا DNS propagate بشه (تا 24 ساعت)

### SSL Certificate

Render خودکار SSL certificate از Let's Encrypt میگیره. نیازی به کار اضافه نیست!

---

## مانیتورینگ

### لاگ‌ها

Render Dashboard → Logs

### Metrics

Render Dashboard → Metrics
- CPU Usage
- Memory Usage
- Request Count
- Response Time

### Alerts

Render Dashboard → Settings → Notifications
- Email alerts برای downtime
- Slack integration

---

## بکآپ

### Environment Variables

1. برو به Environment
2. کپی کن تمام متغیرها
3. ذخیره کن در یه فایل امن

### Database (اگه استفاده میکنی)

Render خودکار daily backup میگیره برای PostgreSQL.

---

## آپدیت کد

### روش 1: Git Push

```bash
git add .
git commit -m "Update"
git push
```

Render خودکار redeploy میکنه.

### روش 2: Manual Deploy

Render Dashboard → Manual Deploy → Deploy latest commit

---

## هزینه‌ها

### Free Plan
- ✅ 750 ساعت/ماه
- ✅ SSL رایگان
- ✅ Auto-deploy
- ❌ Sleep بعد از 15 دقیقه
- ❌ 512 MB RAM

### Starter Plan ($7/month)
- ✅ همیشه روشن
- ✅ 512 MB RAM
- ✅ بدون sleep

### Standard Plan ($25/month)
- ✅ 2 GB RAM
- ✅ Priority support

---

## امنیت

### Environment Variables

همه متغیرهای حساس در Environment Variables ذخیره میشن و encrypt هستند.

### HTTPS

Render خودکار HTTPS فعال میکنه با Let's Encrypt.

### DDoS Protection

Render خودکار DDoS protection داره.

---

## پشتیبانی

- 📧 Email: support@render.com
- 💬 Community: https://community.render.com
- 📚 Docs: https://render.com/docs

---

💜 موفق باشی!
