/* Collaudo 10 — scrivere sul telefono con la tastiera aperta.
 * La tastiera si simula riducendo l'altezza dello schermo mentre un campo ha il fuoco: è ciò che fa la
 * tastiera vera al riquadro visibile (visualViewport). */
import { chromium, servi, pausa, finche, verifica, esito, RADICE, AVVIO, piatta } from './lib.mjs';

const PORTA = 8774, URL_ = 'http://localhost:' + PORTA + '/';
const srv = await servi(RADICE, PORTA);
const br = await chromium.launch(AVVIO);
const FOTO = !!process.env.FOTO;
const ALTO = 844, TASTIERA = 336, MARGINE = 76;
const errori = [];

async function telefono(opz = {}) {
  const ctx = await br.newContext(Object.assign({ viewport: { width: 390, height: ALTO }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' }, opz));
  await piatta(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => errori.push(e.message));
  await p.goto(URL_);
  await p.click('#solo-locale');
  return { ctx, p };
}
const vista = p => p.evaluate(() => document.querySelector('#app').dataset.vista);
const apri = (p, alt) => p.setViewportSize({ width: p.viewportSize().width, height: alt });
const stato = p => p.evaluate(() => {
  const b = document.querySelector('#barra'), s = document.querySelector('#strumenti'), f = document.querySelector('#foglio');
  return { tastiera: document.querySelector('#app').dataset.tastiera, barra: getComputedStyle(b).display, strumentiAlto: Math.round(s.getBoundingClientRect().top), strumenti: getComputedStyle(s).display, foglioBasso: Math.round(f.getBoundingClientRect().bottom), vv: Math.round(visualViewport.height) };
});
/* dove sta il cursore, misurato dalla selezione (pagina formattata) */
const cursore = p => p.evaluate(() => {
  const s = getSelection(); if (!s.rangeCount) return null;
  const r = document.createRange(); r.setStart(s.focusNode, s.focusOffset); r.collapse(true);
  let q = r.getClientRects()[0];
  if (!q || !q.height) { let el = s.focusNode.nodeType === 1 ? s.focusNode : s.focusNode.parentElement; q = el.getBoundingClientRect(); }
  return { alto: Math.round(q.top), basso: Math.round(q.bottom) };
});

console.log('A. La tastiera si apre: si fa spazio');
const T = await telefono();
const p = T.p;
await p.tap('#nuova');
await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
const a0 = await stato(p);
verifica(a0.barra !== 'none' && !a0.tastiera, 'senza tastiera la barra in alto c\'è', a0);
await p.tap('#carta');
await apri(p, ALTO - TASTIERA);
await finche(() => p.evaluate(() => document.querySelector('#app').dataset.tastiera === '1'), 2000);
const a1 = await stato(p);
verifica(a1.tastiera === '1' && a1.barra === 'none' && a1.strumenti !== 'none', 'aperta la tastiera, la barra in alto si ritira e restano gli strumenti di scrittura', a1);
verifica(a1.strumentiAlto <= 4, 'gli strumenti salgono in cima: lo spazio guadagnato va al testo', a1.strumentiAlto);
const attr = await p.evaluate(() => ['#carta', '#testo'].map(s => document.querySelector(s).getAttribute('autocomplete')));
verifica(attr.every(x => x === 'off'), 'i campi di scrittura dicono al browser di non proporre i dati dei contatti', attr);

console.log('B. La riga che si scrive resta sopra la capsula di iOS');
const fuori = [];
for (let i = 1; i <= 34; i++) {
  await p.keyboard.type('Riga numero ' + i + ' del testo che si allunga.');
  await p.keyboard.press('Enter');
  if (i % 6 === 0) { await pausa(60); const c = await cursore(p), s = await stato(p); if (c.basso > s.foglioBasso - MARGINE + 2) fuori.push([i, c.basso, s.foglioBasso]); }
}
await pausa(80);
const c1 = await cursore(p), s1 = await stato(p);
verifica(fuori.length === 0 && c1.basso <= s1.foglioBasso - MARGINE + 2, 'scrivendo, il cursore non scende mai negli ultimi ' + MARGINE + ' px, dove iOS mette la sua capsula', { fuori, cursore: c1, foglio: s1.foglioBasso });
verifica(c1.basso >= s1.foglioBasso - MARGINE - 60, 'e la pagina scorre quanto basta, non di più', { cursore: c1, foglio: s1.foglioBasso });
if (FOTO) await p.screenshot({ path: 'tastiera-scrittura.png' });
const vicino = s1.foglioBasso - 30;
await p.evaluate(() => { document.querySelector('#foglio').scrollTop -= 400; });
await pausa(100);
const riga = await p.evaluate(y => { const ps = [...document.querySelectorAll('#carta p')]; const t = ps.find(x => { const r = x.getBoundingClientRect(); return r.top < y && r.bottom > y - 4; }); return t ? Math.round(t.getBoundingClientRect().top + 6) : null; }, vicino);
await p.touchscreen.tap(60, riga || vicino);
await pausa(120);
const c2 = await cursore(p);
verifica(c2 && c2.basso <= s1.foglioBasso - MARGINE + 2, 'toccando una riga nascosta dietro la capsula, la riga sale in vista', { tocco: riga || vicino, cursore: c2 });
await p.evaluate(() => { document.querySelector('#foglio').scrollTop = 0; });
await pausa(150);
const sc = await p.evaluate(() => document.querySelector('#foglio').scrollTop);
verifica(sc === 0, 'chi scorre per rileggere non viene riportato indietro finché non scrive');

console.log('C. La tastiera si chiude: tutto torna com\'era');
await p.evaluate(() => document.activeElement.blur());
await apri(p, ALTO);
await finche(() => p.evaluate(() => !document.querySelector('#app').dataset.tastiera), 2000);
const s2 = await stato(p);
verifica(!s2.tastiera && s2.barra !== 'none', 'la barra in alto ritorna', s2);
await p.tap('#indietro');
await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'bacheca');
await apri(p, ALTO - 120);
await pausa(150);
verifica((await stato(p)).barra !== 'none' && (await vista(p)) === 'bacheca', 'uno schermo che si accorcia senza un campo attivo (le barre del browser) non cambia nulla');
await apri(p, ALTO);
await p.tap('#cerca');
await apri(p, ALTO - TASTIERA);
await pausa(150);
verifica((await stato(p)).barra !== 'none', 'cercando nella bacheca la barra resta: il campo di ricerca sta lì', await stato(p));
await p.evaluate(() => document.activeElement.blur()); await apri(p, ALTO);

console.log('D. Le note di testo semplice (.txt)');
await p.tap('#impostazioni'); await p.waitForSelector('#pannello[open]');
await p.selectOption('#formato', 'txt');
await p.tap('#pannello [data-a="chiudi"]'); await pausa(200);
await p.tap('#nuova'); await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
await p.tap('#testo');
await apri(p, ALTO - TASTIERA);
await finche(() => p.evaluate(() => document.querySelector('#app').dataset.tastiera === '1'), 2000);
for (let i = 1; i <= 30; i++) { await p.keyboard.type('riga ' + i + ' = ' + i * 1.5); await p.keyboard.press('Enter'); }
await p.keyboard.type('ultima');
await pausa(100);
// la riga del cursore misurata con una copia invisibile della textarea (lo stesso metodo che usa l'app per il testo che va a capo)
const d1 = await p.evaluate(() => {
  const t = document.querySelector('#testo'), cs = getComputedStyle(t), m = document.createElement('div');
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing']) m.style[k] = cs[k];
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: t.clientWidth + 'px', left: '-9999px', top: '0' });
  m.textContent = t.value; const sp = document.createElement('span'); sp.textContent = '\u200b'; m.appendChild(sp); document.body.appendChild(m);
  const y = sp.offsetTop + sp.offsetHeight; m.remove();
  const f = document.querySelector('#foglio').getBoundingClientRect();
  return { basso: Math.round(t.getBoundingClientRect().top + y), foglio: Math.round(f.bottom), riga: Math.round(parseFloat(cs.lineHeight)) };
});
verifica(d1.basso <= d1.foglio - MARGINE + 3 && d1.basso >= d1.foglio - MARGINE - d1.riga * 2, 'anche nella textarea la riga che si scrive resta sopra la capsula', d1);
await p.evaluate(() => document.activeElement.blur()); await apri(p, ALTO);
await T.ctx.close();

console.log('E. Sul computer non cambia nulla');
const ctx = await br.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
await piatta(ctx);
const q = await ctx.newPage(); q.on('pageerror', e => errori.push(e.message));
await q.goto(URL_); await q.click('#solo-locale');
await q.click('#nuova'); await q.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
await q.click('#carta');
await q.setViewportSize({ width: 1100, height: 480 });
await pausa(200);
verifica(await q.evaluate(() => getComputedStyle(document.querySelector('#barra')).display) !== 'none', 'con il mouse e uno schermo largo la barra resta sempre al suo posto');
await ctx.close();

verifica(errori.length === 0, 'nessun errore nella pagina', errori);
const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
