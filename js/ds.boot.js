/* Nodaar DS — boot: start the app once the DOM is ready. */
(function () {
  function start() {
    if (window.DS && typeof window.DS.initAuth === 'function') {
      window.DS.initAuth();
    }
    if (window.DS && typeof window.DS.boot === 'function') {
      window.DS.boot();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
