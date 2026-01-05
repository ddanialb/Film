
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = args[0];
    
    if (url && url.includes('streamwide.tv')) {
      console.log('🎯 StreamWide Request:', url);
      const clone = response.clone();
      try {
        const data = await clone.json();
        if (data.access || data.token) {
          console.log('🔑 ACCESS TOKEN:', data.access || data.token);
          console.log('🔄 REFRESH TOKEN:', data.refresh);
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
console.log('📦 LocalStorage:', Object.keys(localStorage));
console.log('📦 SessionStorage:', Object.keys(sessionStorage));
for (let key of Object.keys(localStorage)) {
  if (key.includes('token') || key.includes('auth') || key.includes('jwt')) {
    console.log(`🔑 ${key}:`, localStorage.getItem(key));
  }
}
