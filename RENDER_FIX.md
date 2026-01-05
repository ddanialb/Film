# رفع خطای پروکسی در Render

## مشکل

```
SocksClientError: connect ECONNREFUSED 127.0.0.1:10808
```

## علت

متغیرهای `SOCKS_PROXY_HOST` و `SOCKS_PROXY_PORT` در Environment Variables تنظیم شده‌اند.

## راه حل

### مرحله 1: حذف متغیرهای پروکسی

1. برو به Render Dashboard
2. انتخاب کن Web Service خودت
3. برو به **Environment**
4. پیدا کن و **حذف کن** این متغیرها:
   - `SOCKS_PROXY_HOST`
   - `SOCKS_PROXY_PORT`

**نکته:** باید کاملاً حذفشون کنی، نه اینکه خالی بذاری!

### مرحله 2: ذخیره تغییرات

بعد از حذف، Render خودکار redeploy میکنه.

### مرحله 3: چک کردن لاگ‌ها

برو به **Logs** و باید این پیام رو ببینی:

```
🌐 Direct connection (no proxy configured)
✅ Telegram: Connected without proxy
```

یا

```
✅ Telegram: Logged in from saved session
```

## Environment Variables صحیح برای Render

فقط این متغیرها باید باشن:

```
FARSILAND_USERNAME=your_username
FARSILAND_PASSWORD=your_password
PORT=3000
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_PHONE=+your_phone_number
TELEGRAM_2FA_PASSWORD=your_2fa_password
TELEGRAM_SESSION=your_session_string
STREAMWIDE_REFRESH_TOKEN=your_refresh_token
```

## چرا پروکسی نیاز نیست؟

سرورهای Render در آمریکا و اروپا هستند و دسترسی مستقیم به تلگرام دارند.

فقط در ایران نیاز به پروکسی هست.

## اگه هنوز کار نکرد

### گزینه 1: Manual Redeploy

1. برو به Render Dashboard
2. کلیک کن: **Manual Deploy** → **Clear build cache & deploy**

### گزینه 2: چک کردن کد

مطمئن شو آخرین نسخه کد رو push کردی:

```bash
git add .
git commit -m "Fix proxy issue"
git push
```

### گزینه 3: ساخت سرویس جدید

اگه همه چیز رو امتحان کردی و کار نکرد:

1. سرویس قدیمی رو حذف کن
2. یه Web Service جدید بساز
3. Environment Variables رو دوباره تنظیم کن (بدون پروکسی)

---

💜 حل شد!
