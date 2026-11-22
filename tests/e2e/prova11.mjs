/* Collaudo 11 — la pagina e chi la ospita (1.9.0).
 * La barra di formattazione e le scorciatoie ⌘B ⌘I ⌘U (gestite dalla pagina: valgono anche dove il sistema
 * non le dà, come nell'app per Mac); i comandi per i menu dell'app (BiaWrite.comando), che non devono
 * prendere il posto della barra; la copia passata a BiaMac quando c'è; il salvataggio immediato. */
import { chromium, servi, pausa, finche, verifica, esito, RADICE, AVVIO, piatta } from './lib.mjs';

const PORTA = 8775, URL_ = 'http://localhost:' + PORTA + '/';
const srv = await servi(RADICE, PORTA);
const br = await chromium.launch(AVVIO);
const errori = [];

async function apri(opz = {}) {
  const ctx = await br.newContext({ viewport: { width: 1200, height: 820 }, serviceWorkers: 'block' });
  await piatta(ctx);
  if (opz.mac) await ctx.addInitScript(() => { window.__copie = []; window.BiaMac = { versione: 'prova', haDiario: false, copia: (h, t) => { window.__copie.push({ h, t }); return true; }, diario() {} }; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errori.push(e.message));
  await p.goto(URL_);
  await p.click('#solo-locale');
  await finche(() => p.evaluate(() => document.querySelector('#app').dataset.vista === 'bacheca'));
  return { ctx, p };
}
const vista = p => p.evaluate(() => document.querySelector('#app').dataset.vista);
const html = p => p.evaluate(() => document.querySelector('#carta').innerHTML);
const md = p => p.evaluate(() => [...BiaWrite.note.values()].map(n => n.content).join('\n'));
const seleziona = (p, parola) => p.evaluate(w => {
  const c = document.querySelector('#carta'), it = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  for (let n; (n = it.nextNode());) { const i = n.nodeValue.indexOf(w); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } }
  return false;
}, parola);

console.log('A. La barra di formattazione');
const A = await apri();
const p = A.p;
await p.click('#nuova');
await finche(async () => (await vista(p)) === 'editor');
await p.click('#carta');
await p.keyboard.type('Uno due tre quattro cinque sei');
await seleziona(p, 'due');
await p.click('#strumenti [data-c="bold"]');
verifica(/<(b|strong)>due<\/(b|strong)>/.test(await html(p)), 'il pulsante G mette in grassetto', await html(p));
await seleziona(p, 'tre');
await p.click('#strumenti [data-c="italic"]');
verifica(/<(i|em)>tre<\/(i|em)>/.test(await html(p)), 'il pulsante C mette in corsivo');
await p.click('#strumenti [data-c="h2"]');
verifica(/<h2>/.test(await html(p)), 'il pulsante T fa un titolo');
await p.click('#strumenti [data-c="h2"]');
verifica(!/<h2>/.test(await html(p)), 'e lo toglie');

console.log('B. ⌘B ⌘I ⌘U li gestisce la pagina');
for (const [tasto, c, re] of [['b', 'grassetto', /<(b|strong)>quattro<\/(b|strong)>/], ['i', 'corsivo', /<(i|em)>cinque<\/(i|em)>/], ['u', 'sottolineato', /<u>sei<\/u>/]]) {
  const parola = { b: 'quattro', i: 'cinque', u: 'sei' }[tasto];
  await seleziona(p, parola);
  const prevenuto = await p.evaluate(t => { const e = new KeyboardEvent('keydown', { key: t, metaKey: true, bubbles: true, cancelable: true }); document.querySelector('#carta').dispatchEvent(e); return e.defaultPrevented; }, tasto);
  verifica(prevenuto && re.test(await html(p)), '⌘' + tasto.toUpperCase() + ' → ' + c + ', e il tasto non prosegue (l\'app non lo riceve come comando di menu)', await html(p));
}
await seleziona(p, 'quattro');
await p.keyboard.press('Control+b');
verifica(!/<(b|strong)>quattro<\/(b|strong)>/.test(await html(p)), 'con Ctrl, come nei browser, si toglie: una volta sola, non due');
await pausa(500);
verifica(/\*\*due\*\*/.test(await md(p)) && /<u>sei<\/u>|sei/.test(await md(p)), 'la nota salvata ha la formattazione', (await md(p)).slice(0, 120));
const fuori = await p.evaluate(() => { document.querySelector('#titolo').focus(); const e = new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }); document.querySelector('#titolo').dispatchEvent(e); return e.defaultPrevented; });
verifica(!fuori, 'fuori dalla pagina formattata (il titolo) ⌘B non è toccato');

console.log('C. I comandi per i menu dell\'app');
verifica(await p.evaluate(() => typeof BiaWrite.comando === 'function' && BiaWrite.comando('inesistente') === false), 'BiaWrite.comando c\'è e rifiuta i comandi che non conosce');
await p.evaluate(() => BiaWrite.comando('bacheca'));
await finche(async () => (await vista(p)) === 'bacheca');
verifica((await vista(p)) === 'bacheca', '«bacheca» chiude la nota');
await p.evaluate(() => BiaWrite.comando('nuova'));
await finche(async () => (await vista(p)) === 'editor');
verifica((await vista(p)) === 'editor', '«nuova» apre una nota nuova');
await p.click('#carta'); await p.keyboard.type('Seconda nota');
await p.click('#strumenti [data-c="bold"]'); await p.keyboard.type(' forte');
verifica(/<(b|strong)>(&nbsp;| )?forte<\/(b|strong)>/.test(await html(p)), 'dopo i comandi dell\'app la barra funziona ancora', await html(p));
await p.keyboard.type(' e fine');
await p.evaluate(() => BiaWrite.salvaOra());
const salvata = await p.evaluate(() => new Promise(res => { const q = indexedDB.open('biawrite'); q.onsuccess = () => { const g = q.result.transaction('note').objectStore('note').getAll(); g.onsuccess = () => res(g.result.map(n => n.content).join('\n')); }; }));
verifica(/e fine/.test(salvata), 'salvaOra scrive subito sul dispositivo', salvata.slice(-60));
await p.evaluate(() => BiaWrite.comando('cerca'));
await finche(() => p.evaluate(() => document.activeElement && document.activeElement.id === 'cerca'));
verifica(await p.evaluate(() => document.activeElement.id) === 'cerca', '«cerca» torna alla bacheca e va sulla ricerca');
await A.ctx.close();

console.log('D. Nel browser non cambia nulla; con BiaMac la copia passa all\'app');
const B = await apri();
verifica(await B.p.evaluate(() => typeof window.BiaMac) === 'undefined', 'nel browser BiaMac non c\'è');
await B.ctx.close();
const M = await apri({ mac: true });
await M.p.click('#nuova'); await finche(async () => (await vista(M.p)) === 'editor');
await M.p.click('#carta'); await M.p.keyboard.type('Per WordPress');
await M.p.click('#copia');
await finche(() => M.p.evaluate(() => window.__copie.length > 0));
const c = await M.p.evaluate(() => window.__copie[0]);
verifica(c && /Per WordPress/.test(c.h) && c.t.trim() === 'Per WordPress', 'la copia arriva a BiaMac.copia come HTML e testo', c);
await M.ctx.close();

verifica(errori.length === 0, 'nessun errore nella pagina', errori);
await br.close(); srv.close();
process.exit(esito() ? 1 : 0);
