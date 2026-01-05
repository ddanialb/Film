// Run this in browser console at https://web.telegram.org/a/#6609035341
// After opening a StreamWide mini app

// Method 1: Intercept network requests
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0];
    
    if (url && url.includes('streamwide.tv')) {
      console.log('🎯 StreamWide Request:', url);
      
      // Clone response to read body
      const clone = response.clone();
      try {
        const data = await clone.json();
        if (data.access || data.token) {
          console.log('🔑 ACCESS TOKEN:', data.access || data.token);
          console.log('🔄 REFRESH TOKEN:', data.refresh);
          
          // Copy to clipboard
          navigator.clipboard.writeText(JSON.stringify({
            access: data.access || data.token,
            refresh: data.refresh
          }, null, 2));
          console.log('📋 Tokens copied to clipboard!');
        }
        if (data.results) {
          console.log('📦 API Response:', data);
        }
      } catch(e) {}
    }
    return response;
  };
  
  console.log('✅ Network interceptor active. Open a StreamWide mini app now.');
})();

// Method 2: Check localStorage/sessionStorage
console.log('📦 LocalStorage:', Object.keys(localStorage));
console.log('📦 SessionStorage:', Object.keys(sessionStorage));

// Look for tokens
for (let key of Object.keys(localStorage)) {
  if (key.includes('token') || key.includes('auth') || key.includes('jwt')) {
    console.log(`🔑 ${key}:`, localStorage.getItem(key));
  }
}
