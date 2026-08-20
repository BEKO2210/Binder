// The APK, straight from this page.
//
// Two rules the owner set, and the reason each exists:
//
//   1. Nobody gets sent to GitHub to look for a file. The button downloads the
//      package; the visitor stays here.
//   2. Before the download starts, one warning has to be read: an app installed
//      from here is not the app the Play Store updates. If a Play version is
//      already on the phone, that one has to go first — and from then on every
//      update is a manual visit to this page.
//
// The version is never typed into the page. It is read from the newest release
// at load time, so the page cannot advertise a build that no longer exists.
(function () {
  var REPO = 'BEKO2210/Binder';
  var root = document.querySelector('[data-download]');
  if (!root) return;

  var button = root.querySelector('[data-download-button]');
  var meta = root.querySelector('[data-download-meta]');
  var dialog = document.querySelector('[data-download-dialog]');
  var confirm = dialog && dialog.querySelector('[data-download-confirm]');
  var cancel = dialog && dialog.querySelector('[data-download-cancel]');
  var asset = null;
  var lastFocus = null;

  function text(node, value) {
    if (node) node.textContent = value;
  }

  function megabytes(bytes) {
    return (bytes / (1024 * 1024)).toFixed(0);
  }

  function fill(release) {
    var files = release.assets || [];
    for (var index = 0; index < files.length; index += 1) {
      if (/\.apk$/i.test(files[index].name)) { asset = files[index]; break; }
    }
    if (!asset) throw new Error('no apk in the newest release');

    var published = new Date(release.published_at);
    var stamp = isNaN(published.getTime()) ? '' : published.toLocaleDateString(document.documentElement.lang || 'en');
    text(meta, (meta.getAttribute('data-template') || '{version} · {size} MB · {date}')
      .replace('{version}', release.tag_name || release.name || '')
      .replace('{size}', megabytes(asset.size))
      .replace('{date}', stamp));
    button.hidden = false;
  }

  // A button that promises a download and then fails is worse than a button
  // that says it cannot: if the release cannot be read, the page says so.
  function fail() {
    button.hidden = true;
    text(meta, meta.getAttribute('data-fallback') || '');
    var link = root.querySelector('[data-download-fallback-link]');
    if (link) link.hidden = false;
  }

  function openDialog() {
    if (!dialog) return start();
    lastFocus = document.activeElement;
    dialog.hidden = false;
    document.body.style.overflow = 'hidden';
    if (confirm) confirm.focus();
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // The href points at the file itself, so the browser downloads it and the
  // visitor never leaves this page.
  function start() {
    if (!asset) return;
    var link = document.createElement('a');
    link.href = asset.browser_download_url;
    link.rel = 'noopener';
    link.download = asset.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  button.addEventListener('click', function (event) {
    event.preventDefault();
    openDialog();
  });
  if (cancel) cancel.addEventListener('click', closeDialog);
  if (confirm) confirm.addEventListener('click', function () { closeDialog(); start(); });
  if (dialog) {
    dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !dialog.hidden) closeDialog(); });
  }

  fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
    .then(fill)
    .catch(fail);
})();
