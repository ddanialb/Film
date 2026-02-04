const { TelegramApi } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');
const path = require('path');

class AutoTokenRefresh {
  constructor(client) {
    this.client = client;
    this.isRefreshing = false;
    this.lastRefreshAttempt = 0;
    this.refreshCooldown = 5 * 60 * 1000;
    this.checkInterval = null;
    this.startPeriodicCheck();
  }

  isTokenExpired(token) {
    if (!token) return true;
    
    try {
      const payload = token.split('.')[1];
      let paddedPayload = payload;
      while (paddedPayload.length % 4) {
        paddedPayload += '=';
      }
      const decoded = JSON.parse(Buffer.from(paddedPayload, 'base64').toString());
      const expTime = decoded.exp * 1000;
      const currentTime = Date.now();
      
      return (expTime - currentTime) < (60 * 60 * 1000);
    } catch (e) {
      return true;
    }
  }

  getTokenExpiryTime(token) {
    if (!token) return null;
    
    try {
      const payload = token.split('.')[1];
      let paddedPayload = payload;
      while (paddedPayload.length % 4) {
        paddedPayload += '=';
      }
      const decoded = JSON.parse(Buffer.from(paddedPayload, 'base64').toString());
      return decoded.exp * 1000;
    } catch (e) {
      return null;
    }
  }

  saveNewToken(refreshToken) {
    try {
      const envPath = path.join(__dirname, '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      const tokenRegex = /STREAMWIDE_REFRESH_TOKEN=.*/;
      if (tokenRegex.test(envContent)) {
        envContent = envContent.replace(tokenRegex, `STREAMWIDE_REFRESH_TOKEN=${refreshToken}`);
      } else {
        envContent += `\nSTREAMWIDE_REFRESH_TOKEN=${refreshToken}`;
      }
      
      fs.writeFileSync(envPath, envContent);
      
      const dataPath = path.join(__dirname, 'data', 'streamwide_refresh.txt');
      fs.writeFileSync(dataPath, refreshToken);
      
      console.log(`🔑 New token: ${refreshToken}`);
      return true;
    } catch (error) {
      console.error('❌ Token save error:', error.message);
      return false;
    }
  }

  extractTokenFromMessage(message) {
    try {
      const text = message.message || '';
      const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
      const tokens = text.match(jwtPattern);
      
      if (tokens) {
        for (const token of tokens) {
          try {
            const payload = token.split('.')[1];
            let paddedPayload = payload;
            while (paddedPayload.length % 4) {
              paddedPayload += '=';
            }
            const decoded = JSON.parse(Buffer.from(paddedPayload, 'base64').toString());
            
            if (decoded.token_type === 'refresh') {
              return token;
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async refreshTokenFromBot(movieTitle = "Friends") {
    if (this.isRefreshing) {
      return null;
    }

    const now = Date.now();
    if (now - this.lastRefreshAttempt < this.refreshCooldown) {
      return null;
    }

    this.isRefreshing = true;
    this.lastRefreshAttempt = now;

    try {
      const bot = await this.client.getEntity('@StreamWideBot');
      await this.client.sendMessage(bot, movieTitle);
      await new Promise(resolve => setTimeout(resolve, 3000));

      const messages = await this.client.getMessages(bot, { limit: 10 });
      
      for (const message of messages) {
        const token = this.extractTokenFromMessage(message);
        if (token) {
          this.saveNewToken(token);
          this.isRefreshing = false;
          return token;
        }
        
        if (message.replyMarkup && message.replyMarkup.rows) {
          for (const row of message.replyMarkup.rows) {
            for (const button of row.buttons) {
              const buttonText = button.text;
              
              if (buttonText.includes('دریافت') || buttonText.includes('📥') || 
                  buttonText.includes('فصل') || buttonText.includes('Season') ||
                  buttonText.includes('S01') || buttonText.includes('قسمت')) {
                
                await message.click(button);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const newMessages = await this.client.getMessages(bot, { limit: 5 });
                for (const newMsg of newMessages) {
                  const newToken = this.extractTokenFromMessage(newMsg);
                  if (newToken) {
                    this.saveNewToken(newToken);
                    this.isRefreshing = false;
                    return newToken;
                  }
                }
                
                this.isRefreshing = false;
                return 'webapp_opened';
              }
            }
          }
        }
      }

      this.isRefreshing = false;
      return null;

    } catch (error) {
      console.error('❌ Token refresh error:', error.message);
      this.isRefreshing = false;
      return null;
    }
  }

  startPeriodicCheck() {
    this.checkInterval = setInterval(() => {
      const token = process.env.STREAMWIDE_REFRESH_TOKEN;
      if (token) {
        const expiryTime = this.getTokenExpiryTime(token);
        if (expiryTime) {
          const timeLeft = expiryTime - Date.now();
          const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
          
          if (hoursLeft <= 1 && hoursLeft > 0) {
            console.log(`⏰ Token expires in ${hoursLeft} hour(s), refreshing...`);
            this.autoRefreshToken(token);
          }
        }
      }
    }, 60 * 60 * 1000);
  }

  async autoRefreshToken(currentToken, movieTitle = "Friends") {
    if (!this.isTokenExpired(currentToken)) {
      return currentToken;
    }

    const newToken = await this.refreshTokenFromBot(movieTitle);
    
    if (newToken && newToken !== 'webapp_opened') {
      return newToken;
    }
    
    return null;
  }

  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

module.exports = AutoTokenRefresh;