(() => {
  if (!('serviceWorker' in navigator)) return;

  function showUpdateNotice(registration) {
    const notice = document.createElement('div');
    notice.className = 'toast update-notice';
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = 'Neue Fassung von Binder Admin ist bereit.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-button primary-action';
    button.textContent = 'Jetzt aktualisieren';
    button.addEventListener('click', () => {
      if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
    });
    notice.append(text, button);
    document.body.append(notice);
  }

  // Nach dem Wechsel des Workers einmalig neu laden, damit Hülle und
  // Worker zusammenpassen.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      showUpdateNotice(registration);
    }
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateNotice(registration);
        }
      });
    });
    // GitHub Pages cached sw.js bis zu 10 Minuten; beim Zurückkehren in den
    // Tab aktiv nach einer neuen Fassung sehen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update();
    });
  }).catch(() => { /* Installierbarkeit ist Komfort, die App läuft auch ohne. */ });
})();

