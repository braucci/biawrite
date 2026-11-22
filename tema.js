/* BiaWrite — tema.js
 * Prima che la pagina si disegni: giorno o notte, e la tinta dello sfondo.
 * Separato da app.js perché deve agire subito, ed evitare il lampo del tema sbagliato.
 * © B. Raucci — licenza MIT
 */
(function () {
  'use strict';
  var S = {};
  try { S = JSON.parse(localStorage.getItem('biawrite.impostazioni')) || {}; } catch (e) { S = {}; }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function applica() {
    var tema = S.tema || 'auto';
    var notte = tema === 'notte' || (tema === 'auto' && !!(mq && mq.matches));
    var h = document.documentElement;
    h.classList.toggle('notte', notte);
    h.setAttribute('data-sfondo', S.sfondo || 'salvia');
    var colore = getComputedStyle(h).getPropertyValue('--tavolo').trim();
    if (colore) document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', colore); });
  }
  window.BiaTema = { applica: function (nuove) { if (nuove) S = nuove; applica(); } };
  applica();
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { applica(); });
  document.addEventListener('DOMContentLoaded', function () { applica(); });
})();
