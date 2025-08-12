/* pwa.js - registers the service worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // registration successful
      console.log('ServiceWorker registered: ', reg);
    }).catch(err => {
      console.warn('ServiceWorker registration failed: ', err);
    });
  });
}
