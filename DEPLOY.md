# راهنمای استقرار روی هاست

## قبل از آپلود

### 1. فایل‌هایی که نباید آپلود شوند:

❌ **هرگز این فایل‌ها را آپلود نکنید:**
- `.env` (اطلاعات حساس شما)
- `data/` (پوشه کامل - شامل سشن تلگرام و توکن‌ها)
- `node_modules/` (خیلی بزرگه - روی هاست نصب میشه)
- `.git/` (اگه استفاده میکنی)

### 2. فایل‌هایی که باید آپلود شوند:

✅ **این فایل‌ها رو آپلود کن:**
- `server.js`
- `package.json`
- `package-lock.json`
- `.env.example`
- `.gitignore`
- `README.md`
- پوشه `public/` (کامل)
- پوشه `routes/` (کامل)

## مراحل استقرار

### مرحله 1: آپلود فایل‌ها

```bash
# با FTP یا FileZilla یا cPanel File Manager
# فایل‌های بالا رو آپلود کن
```

### مرحله 2: اتصال SSH به هاست

```bash
ssh username@your-host.com
cd /path/to/your/app
```

### مرحله 3: نصب وابستگی‌ها

```bash
npm install
```

اگه `npm` نصب نیست:
```bash
# برای Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# یا با nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
```

### مرحله 4: ساخت فایل .env

```bash
cp .env.example .env
nano .env
```

اطلاعات خودت رو وارد کن:

```env
FARSILAND_USERNAME=your_username
FARSILAND_PASSWORD=your_password
PORT=3000
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
TELEGRAM_PHONE=+989123456789
TELEGRAM_2FA_PASSWORD=your_2fa_password
SOCKS_PROXY_HOST=127.0.0.1
SOCKS_PROXY_PORT=10808
```

ذخیره کن: `Ctrl+X` → `Y` → `Enter`

### مرحله 5: ساخت پوشه data

```bash
mkdir data
chmod 700 data
```

### مرحله 6: اجرا با PM2 (توصیه میشه)

PM2 یه process manager هست که اپت رو همیشه روشن نگه میداره:

```bash
# نصب PM2
npm install -g pm2

# اجرای اپ
pm2 start server.js --name "film-bina"

# ذخیره برای auto-start بعد از ریبوت
pm2 save
pm2 startup
```

دستورات مفید PM2:
```bash
pm2 status              # وضعیت
pm2 logs film-bina      # لاگ‌ها
pm2 restart film-bina   # ریستارت
pm2 stop film-bina      # توقف
pm2 delete film-bina    # حذف
```

### مرحله 7: تنظیم Nginx (اختیاری)

اگه میخوای روی پورت 80 یا 443 اجرا بشه:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo nano /etc/nginx/sites-available/film-bina
sudo ln -s /etc/nginx/sites-available/film-bina /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### مرحله 8: لاگین تلگرام

1. برو به `http://your-domain.com/telegram.html`
2. یه فیلم جستجو کن (مثلاً "Inception")
3. روی "Get Download Links" کلیک کن
4. اگه نیاز به لاگین بود:
   - روی "Login" کلیک کن
   - کد تلگرام رو وارد کن
   - سشن ذخیره میشه در `data/telegram_session.txt`

## تنظیمات پروکسی (برای ایران)

### گزینه 1: استفاده از VPS خارج

اگه هاستت خارج از ایرانه، نیازی به پروکسی نیست:

```env
# در .env این خطوط رو کامنت کن یا حذف کن
# SOCKS_PROXY_HOST=127.0.0.1
# SOCKS_PROXY_PORT=10808
```

### گزینه 2: نصب V2Ray روی سرور

```bash
# نصب V2Ray
bash <(curl -L https://raw.githubusercontent.com/v2fly/fhs-install-v2ray/master/install-release.sh)

# تنظیم config
sudo nano /usr/local/etc/v2ray/config.json
```

Config نمونه:
```json
{
  "inbounds": [{
    "port": 10808,
    "protocol": "socks",
    "settings": {
      "auth": "noauth",
      "udp": true
    }
  }],
  "outbounds": [{
    "protocol": "vmess",
    "settings": {
      "vnext": [{
        "address": "your-v2ray-server.com",
        "port": 443,
        "users": [{
          "id": "your-uuid",
          "alterId": 0
        }]
      }]
    }
  }]
}
```

```bash
sudo systemctl start v2ray
sudo systemctl enable v2ray
```

## مانیتورینگ و نگهداری

### چک کردن لاگ‌ها

```bash
# با PM2
pm2 logs film-bina

# یا مستقیم
tail -f /path/to/logs/error.log
```

### بررسی وضعیت

```bash
pm2 status
curl http://localhost:3000/telegram/status
```

### بکآپ فایل‌های مهم

```bash
# بکآپ data directory
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# دانلود با scp
scp username@host:/path/to/backup-*.tar.gz ./
```

### آپدیت کد

```bash
# آپلود فایل‌های جدید
# سپس:
pm2 restart film-bina
```

## مشکلات رایج

### خطا: Cannot find module

```bash
npm install
pm2 restart film-bina
```

### خطا: EADDRINUSE (پورت اشغاله)

```bash
# پیدا کردن process
lsof -i :3000
# یا
netstat -tulpn | grep 3000

# کشتن process
kill -9 <PID>
```

### خطا: Permission denied

```bash
chmod 700 data/
chmod 600 data/*.txt
chmod 600 .env
```

### تلگرام وصل نمیشه

1. چک کن پروکسی روشنه:
   ```bash
   curl --socks5 127.0.0.1:10808 https://api.telegram.org
   ```

2. چک کن credentials درسته:
   ```bash
   cat .env | grep TELEGRAM
   ```

3. سشن رو پاک کن و دوباره لاگین کن:
   ```bash
   rm data/telegram_session.txt
   pm2 restart film-bina
   ```

## امنیت

### فایروال

```bash
# فقط پورت‌های لازم رو باز کن
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### محدود کردن دسترسی به .env

```bash
chmod 600 .env
chmod 700 data/
```

## پشتیبانی

اگه مشکلی داشتی:
1. لاگ‌ها رو چک کن: `pm2 logs film-bina`
2. وضعیت رو چک کن: `pm2 status`
3. سرور رو ریستارت کن: `pm2 restart film-bina`

---

💜 موفق باشی!
