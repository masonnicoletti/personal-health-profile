/* Personal Health Profile: start-up */
(function () {
  const PHP = window.PHP;
  const A = (PHP.app = PHP.app || {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* ---------- Start ---------- */
  A.renderAll();
  A.showView(location.hash === '#form' ? 'form' : 'home');
  A.protectStorage();
  PHP._debug = {
    get state() {
      return A.state;
    },
  };
})();
