/**
 * Runtime config (overwritten in GitHub Pages build for /threadframe/).
 */
(function () {
  function detectBase() {
    const path = window.location.pathname || "/";
    const marker = "/threadframe";
    const idx = path.indexOf(marker);
    if (idx !== -1) return path.slice(0, idx + marker.length) + "/";
    return "/";
  }

  window.__THREADFRAME__ = {
    base: detectBase(),
    static: false,
  };
})();
