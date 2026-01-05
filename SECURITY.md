# راهنمای امنیت و استقرار

## 📁 ساختار فایل‌های حساس

### پوشه `data/` (Git Ignore)
این پوشه شامل تمام فایل‌های حساس است:

```
data/
├── telegram_session.txt      # سشن تلگرام (خیلی مهم!)
├── streamwide_refresh.txt    # توکن StreamWide
├── playlist_cache.json       # کش پلی‌لیست‌ها
└── telegram_code.txt         # کد موقت تلگرام
```

⚠️ **هرگز این پوشه را در Git قرار ندهید!**

### فایل `.env` (Git Ignore)
شامل تمام اطلاعات حساس:

```env
FARSILAND_USERNAME=your_username
FARSILAND_PASSWORD=your_password
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_PHONE=+your_phone
TELEGRAM_2FA_PASSWORD=your_2fa_password
SOCKS_PROXY_HOST=127.0.0.1
SOCKS_PROXY_PORT=10808
```

## 🔒 چک‌لیست امنیتی

### قبل از Git Commit

```bash
# چک کردن فایل‌های حساس
npm run check

# یا مستقیم
node check-sensitive.js
```

### قبل از آپلود به هاست

✅ **آپلود کن:**
- `server.js`
- `package.json`
- `package-lock.json`
- `.env.example` (نه `.env`)
- `.gitignore`
- `README.md`
- `DEPLOY.md`
- پوشه `public/`
- پوشه `routes/`

❌ **آپلود نکن:**
- `.env`
- `data/`
- `node_modules/`
- `.git/`
- `telegram_session.txt`
- `streamwide_refresh.txt`
- `playlist_cache.json`

## 🚀 مراحل استقرار امن

### 1. روی سرور

```bash
# کلون یا آپلود فایل‌ها
cd /path/to/app

# نصب وابستگی‌ها
npm install

# ساخت .env از نمونه
cp .env.example .env
nano .env  # اطلاعات خودت رو وارد کن

# ساخت پوشه data با دسترسی محدود
mkdir data
chmod 700 data

# اجرا
npm start
```

### 2. تنظیم دسترسی‌ها

```bash
# فایل .env فقط برای owner قابل خواندن باشه
chmod 600 .env

# پوشه data فقط برای owner قابل دسترسی باشه
chmod 700 data

# فایل‌های داخل data
chmod 600 data/*.txt
chmod 600 data/*.json
```

### 3. لاگین تلگرام

1. برو به `/telegram.html`
2. جستجو کن
3. روی "Get Download Links" کلیک کن
4. اگه نیاز به لاگین بود، کد رو وارد کن
5. سشن ذخیره میشه در `data/telegram_session.txt`

## 🔐 بکآپ امن

### بکآپ فایل‌های حساس

```bash
# بکآپ data directory
tar -czf backup-$(date +%Y%m%d).tar.gz data/ .env

# رمزگذاری بکآپ
gpg -c backup-*.tar.gz

# حذف فایل بدون رمز
rm backup-*.tar.gz

# دانلود فایل رمزشده
scp user@host:/path/to/backup-*.tar.gz.gpg ./
```

### بازیابی از بکآپ

```bash
# رمزگشایی
gpg backup-*.tar.gz.gpg

# استخراج
tar -xzf backup-*.tar.gz

# تنظیم دسترسی‌ها
chmod 700 data
chmod 600 data/*.txt
chmod 600 .env
```

## 🛡️ امنیت در Production

### 1. فایروال

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 2. SSL Certificate

```bash
sudo certbot --nginx -d your-domain.com
```

### 3. محدود کردن SSH

```bash
# فقط با کلید SSH
sudo nano /etc/ssh/sshd_config
# تغییر بده:
PasswordAuthentication no
PermitRootLogin no

sudo systemctl restart sshd
```

### 4. Fail2Ban

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## 🔍 مانیتورینگ

### چک کردن لاگ‌ها

```bash
# با PM2
pm2 logs film-bina

# لاگ‌های سیستم
tail -f /var/log/nginx/error.log
```

### چک کردن دسترسی‌ها

```bash
# چک کردن دسترسی فایل‌ها
ls -la data/
ls -la .env

# چک کردن process‌ها
ps aux | grep node
```

## ⚠️ در صورت نشت اطلاعات

### اگه .env لو رفت:

1. **فوری:**
   ```bash
   # تغییر پسورد FarsiLand
   # تغییر پسورد 2FA تلگرام
   ```

2. **تغییر API Keys:**
   - برو به https://my.telegram.org
   - API Key قدیمی رو حذف کن
   - یه API Key جدید بساز

3. **آپدیت .env:**
   ```bash
   nano .env
   # اطلاعات جدید رو وارد کن
   pm2 restart film-bina
   ```

### اگه telegram_session.txt لو رفت:

1. **فوری:**
   ```bash
   # حذف سشن
   rm data/telegram_session.txt
   
   # ریستارت اپ
   pm2 restart film-bina
   ```

2. **Terminate سشن‌ها:**
   - باز کن Telegram
   - برو Settings → Privacy and Security → Active Sessions
   - تمام سشن‌های مشکوک رو terminate کن

3. **لاگین دوباره:**
   - برو به `/telegram.html`
   - دوباره لاگین کن

## 📝 چک‌لیست نهایی

قبل از استقرار:

- [ ] `.env` در `.gitignore` هست
- [ ] `data/` در `.gitignore` هست
- [ ] `.env.example` بدون اطلاعات حساس هست
- [ ] `README.md` بدون اطلاعات حساس هست
- [ ] `npm run check` بدون خطا اجرا میشه
- [ ] فایل‌های `data/` آپلود نشدن
- [ ] دسترسی‌های فایل‌ها درست تنظیم شده (600/700)
- [ ] SSL نصب شده
- [ ] فایروال فعاله
- [ ] بکآپ گرفته شده

---

💜 امنیت اولویت اوله!
