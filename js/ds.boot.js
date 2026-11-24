/* Nodaar DS — boot: start the app once the DOM is ready. */
(function () {
  function start() {
    // ds.core.js registers the shared routes and calls boot() on DOMContentLoaded.
    // If it already fired (script order), make sure the app is running.
    if (window.DS && window.DS.sb && !document.getElementById('ds-app')) return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
