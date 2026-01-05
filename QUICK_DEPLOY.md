# راهنمای سریع استقرار

## روش پیشنهادی: استفاده از ENV (بدون فایل‌های حساس)

### مزایا:
✅ همه چیز در یک فایل `.env`  
✅ نیازی به نگهداری فایل‌های `data/` نیست  
✅ امن‌تر و ساده‌تر برای مدیریت  
✅ راحت‌تر برای بکآپ و انتقال  

---

## مراحل استقرار

### 1. آپلود فایل‌ها به هاست

فقط این فایل‌ها رو آپلود کن:
```
server.js
package.json
package-lock.json
.env.example
.gitignore
public/
routes/
```

❌ **آپلود نکن:**
- `.env`
- `data/`
- `node_modules/`

### 2. روی سرور

```bash
# اتصال SSH
ssh user@your-host.com
cd /path/to/app

# نصب وابستگی‌ها
npm install

# ساخت .env
cp .env.example .env
nano .env
```

### 3. تنظیم .env

```env
FARSILAND_USERNAME=dani12345
FARSILAND_PASSWORD=danialba13A@
PORT=3000
TELEGRAM_API_ID=29488178
TELEGRAM_API_HASH=c887660587c02e08d5e0f1b9e6db1db6
TELEGRAM_PHONE=+3584573969869
TELEGRAM_2FA_PASSWORD=danialba13
SOCKS_PROXY_HOST=127.0.0.1
SOCKS_PROXY_PORT=10808
```

ذخیره: `Ctrl+X` → `Y` → `Enter`

### 4. اجرا با PM2

```bash
npm install -g pm2
pm2 start server.js --name film-bina
pm2 save
pm2 startup
```

### 5. لاگین تلگرام (اولین بار)

1. برو به `http://your-domain.com/telegram.html`
2. جستجو کن: "Inception"
3. کلیک کن: "Get Download Links"
4. کلیک کن: "Login"
5. کد تلگرام رو وارد کن

### 6. کپی کردن Session به ENV

بعد از لاگین، در لاگ سرور این پیام رو میبینی:

```bash
pm2 logs film-bina
```

پیدا کن:
```
💡 Add to .env: TELEGRAM_SESSION=1AgAOMTQ5LjE1NC4xNjcuOTE...
```

کپی کن و به `.env` اضافه کن:

```bash
nano .env
```

اضافه کن:
```env
TELEGRAM_SESSION=1AgAOMTQ5LjE1NC4xNjcuOTE...
STREAMWIDE_REFRESH_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

ذخیره و ریستارت:
```bash
pm2 restart film-bina
```

### 7. تمام! ✅

حالا همه چیز در `.env` هست و دیگر نیازی به فایل‌های `data/` نیست.

---

## بکآپ

فقط یه فایل رو بکآپ بگیر:

```bash
# دانلود .env
scp user@host:/path/to/app/.env ./backup.env

# یا بکآپ رمزشده
ssh user@host
cd /path/to/app
tar -czf backup.tar.gz .env
gpg -c backup.tar.gz
```

---

## بازیابی

```bash
# آپلود .env
scp backup.env user@host:/path/to/app/.env

# ریستارت
ssh user@host
pm2 restart film-bina
```

---

## مشکلات رایج

### تلگرام وصل نمیشه
```bash
# چک کن پروکسی روشنه
curl --socks5 127.0.0.1:10808 https://api.telegram.org

# اگه نیاز نیست، از .env حذف کن:
# SOCKS_PROXY_HOST=...
# SOCKS_PROXY_PORT=...
```

### Session منقضی شده
```bash
# حذف از .env
nano .env
# خط TELEGRAM_SESSION رو حذف کن

# ریستارت و دوباره لاگین
pm2 restart film-bina
```

### StreamWide کار نمیکنه
```bash
# حذف از .env
nano .env
# خط STREAMWIDE_REFRESH_TOKEN رو حذف کن

# ریستارت - خودش دوباره میسازه
pm2 restart film-bina
```

---

## دستورات مفید

```bash
# وضعیت
pm2 status

# لاگ‌ها
pm2 logs film-bina

# ریستارت
pm2 restart film-bina

# توقف
pm2 stop film-bina

# حذف
pm2 delete film-bina
```

---

## امنیت

### محافظت از .env

```bash
chmod 600 .env
```

### فایروال

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### SSL

```bash
sudo certbot --nginx -d your-domain.com
```

---

💜 همین! خیلی ساده شد.
