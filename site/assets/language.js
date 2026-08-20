// Show the page in the language the visitor's device is set to — and then get
// out of the way.
//
// GitHub Pages serves files, not decisions: there is no server to look at
// Accept-Language. So the choice happens here, once, with three rules that keep
// it from becoming annoying:
//
//   1. A choice the visitor made wins. Clicking the switcher stores it, and it
//      is never overridden afterwards.
//   2. The redirect happens once per visit and only towards a language the site
//      actually has. No loops, no bouncing between two pages.
//   3. `?lang=en` (or any code) forces a language and stores it — that is the
//      link you send somebody when you want them to see a specific version.
//
// Every page also carries hreflang alternates, so a search engine indexes each
// language on its own URL regardless of what happens here.
(function () {
  var STORE_KEY = 'binder:language';
  var root = document.documentElement;
  var current = (root.getAttribute('lang') || 'en').toLowerCase();

  // Written by the generator: which languages exist and where this page lives.
  var config = window.binderLanguages || { available: ['en'], source: 'en', page: '' };
  var available = config.available;

  function store(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (error) { /* private mode */ }
  }

  function stored() {
    try { return localStorage.getItem(STORE_KEY); } catch (error) { return null; }
  }

  function urlFor(code) {
    var page = config.page || '';
    var depth = current === config.source ? '' : '../';
    return code === config.source ? depth + page : depth + code + '/' + page;
  }

  // The switcher is the visitor speaking. Remember it before following the link.
  var links = document.querySelectorAll('[data-binder-lang]');
  for (var index = 0; index < links.length; index += 1) {
    links[index].addEventListener('click', function () {
      store(this.getAttribute('data-binder-lang'));
    });
  }

  var forced = new URLSearchParams(window.location.search).get('lang');
  if (forced && available.indexOf(forced) !== -1) {
    store(forced);
    if (forced !== current) window.location.replace(urlFor(forced));
    return;
  }

  var choice = stored();
  if (choice) {
    if (available.indexOf(choice) !== -1 && choice !== current) window.location.replace(urlFor(choice));
    return;
  }

  // Nothing chosen yet: follow the device, but only for a language that exists.
  var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  for (var position = 0; position < preferred.length; position += 1) {
    var code = String(preferred[position]).toLowerCase().split('-')[0];
    if (available.indexOf(code) === -1) continue;
    // Deliberately not stored: following the device is not the visitor
    // choosing. If they later switch their phone to another language the site
    // follows along, and the switcher still wins the moment it is clicked.
    if (code !== current) window.location.replace(urlFor(code));
    return;
  }
})();
