/* InerCAD · sitio web: tema, copiar huellas, aparición suave y detalles de la guía */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'inercad.site.theme';

  function resolved(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  var pref = 'auto';
  try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { /* sin almacenamiento */ }

  var sun = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5';
  var moon = 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z';
  function apply() {
    var r = resolved(pref);
    root.dataset.resolved = r;
    root.dataset.theme = pref;
    var ic = document.getElementById('themeIcon');
    if (ic) ic.setAttribute('d', r === 'dark' ? sun : moon);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', r === 'dark' ? '#212529' : '#e9ecef');
  }
  apply();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () { if (pref === 'auto') apply(); });
  }
  var btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', function () {
    pref = resolved(pref) === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, pref); } catch (e) { /* nada */ }
    apply();
  });

  /* Copiar huellas SHA-256 */
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = document.getElementById(b.getAttribute('data-copy'));
      var txt = el ? el.textContent.replace(/^SHA-256\s*/, '').trim() : '';
      var done = function () { var old = b.textContent; b.textContent = 'Copiado'; setTimeout(function () { b.textContent = old; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, done); else done();
    });
  });

  /* Aviso según el sistema operativo */
  var os = document.getElementById('osNote');
  if (os) {
    var ua = navigator.userAgent || '';
    if (/Mac|iPhone|iPad/i.test(ua)) os.textContent = 'Estás en macOS o iOS: usa la versión web.';
    else if (/Linux|Android/i.test(ua) && !/Windows/i.test(ua)) os.textContent = 'Estás en Linux o Android: usa la versión web.';
  }

  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  /* Aparición suave al hacer scroll */
  var rv = document.querySelectorAll('.rv');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!('IntersectionObserver' in window) || reduce) {
    rv.forEach(function (n) { n.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    rv.forEach(function (n) { io.observe(n); });
  }

  /* Guía: resaltar la sección visible en el índice */
  var toc = document.querySelectorAll('.toc a[href^="#"]');
  if (toc.length && 'IntersectionObserver' in window) {
    var map = {};
    toc.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var heads = Array.prototype.slice.call(document.querySelectorAll('.prose h2[id]'));
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && map[e.target.id]) {
          toc.forEach(function (a) { a.classList.remove('on'); });
          map[e.target.id].classList.add('on');
        }
      });
    }, { rootMargin: '-72px 0px -70% 0px' });
    heads.forEach(function (h) { spy.observe(h); });
  }
})();
