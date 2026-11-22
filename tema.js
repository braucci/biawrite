/* BiaWrite — tema.js
 * Prima che la pagina si disegni: lo stile (scrivania o terminale), giorno o notte, la tinta dello sfondo.
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
    var stile = S.stile === 'terminale' ? 'terminale' : 'scrivania';
    // il terminale nasce scuro: «come il dispositivo» lì vuol dire notte, e il giorno va chiesto
    var notte = tema === 'notte' || (tema === 'auto' && (stile === 'terminale' || !!(mq && mq.matches)));
    var h = document.documentElement;
    h.setAttribute('data-stile', stile);
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
