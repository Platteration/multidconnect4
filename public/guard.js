/* 5D Connect Four: the safety net. Loaded before the game and depending on nothing, so that when
   the game's script fails to load, or throws before it has drawn anything, the visitor reads a
   short note instead of a blank page. Once the game has drawn, its own error boundary takes over. */
(function () {
  'use strict';

  // The folder the site is served from, read off this script's own address: the game's scripts
  // are .js files below it (_expo/static/js/web/…). Only their failures count. A browser
  // extension, or anything else that runs script in the page, can throw too, and an error with
  // no file of the site's behind it is no reason to say the game could not start.
  const own = document.currentScript && document.currentScript.src;
  const base = own ? own.slice(0, own.lastIndexOf('/') + 1) : location.origin + '/';
  function ours(url) {
    return typeof url === 'string' && url.indexOf(base) === 0 && /^[^?#]*\.js(?:[?#]|$)/.test(url.slice(base.length));
  }

  function started() {
    const root = document.getElementById('root');
    return !!root && root.childElementCount > 0;
  }

  // An unhandled rejection names no script, so one from somewhere else can still show the note
  // before the game draws. The note is taken back when the game does draw: a game on screen has
  // started, whatever was reported on the way.
  let watching = false;
  function fail() {
    const note = document.getElementById('boot-failed');
    if (!note) return;
    note.hidden = false;
    const root = document.getElementById('root');
    if (watching || !root || typeof MutationObserver !== 'function') return;
    watching = true;
    new MutationObserver(function () {
      if (started()) note.hidden = true;
    }).observe(root, { childList: true });
  }

  // A failure while the game is starting. Checked a turn later, because React can still be
  // taking a tree down when the error is reported; a page that drew and then emptied is as dead.
  function maybeFail() {
    setTimeout(function () {
      if (!started()) fail();
    }, 0);
  }

  // Capture phase: a script that fails to load fires `error` on its element, and that event does
  // not bubble to window.
  window.addEventListener(
    'error',
    function (e) {
      const el = e.target;
      if (el && el !== window && el.tagName) {
        if (el.tagName.toLowerCase() === 'script' && ours(el.src)) fail();
        return;
      }
      if (ours(e.filename)) maybeFail();
    },
    true
  );
  window.addEventListener('unhandledrejection', maybeFail);
})();
