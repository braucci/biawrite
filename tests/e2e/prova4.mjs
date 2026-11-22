/* Collaudo 4 — la puntina: nota fissata in testa, sincronizzata fra dispositivi. */
import { chromium, servi, GitHubFinto, pausa, finche, verifica, esito, RADICE, AVVIO, dispositivo, attendiOk, collega } from './lib.mjs';

const srv = await servi(RADICE, 8768);
const URL_ = 'http://localhost:8768/';
const br = await chromium.launch(AVVIO);
const G = new GitHubFinto();
const CA = G.chiave('github_pat_A'), CB = G.chiave('github_pat_B');
const titoli = p => p.$$eval('.nota', a => a.map(x => (x.querySelector('h3') || {}).textContent));
const FOTO = !!process.env.FOTO;

// tre note già nel repository, con date diverse
G.daFuori(f => {
  f.scrivi('note/.biawrite.json', JSON.stringify({ formato: 1, note: {
    'Vecchia idea.md': { colore: 'azzurro', auto: false, mod: '2024-03-01T10:00:00.000Z' },
    'Spesa.md': { colore: 'giallo', auto: false, mod: '2026-11-20T10:00:00.000Z' },
    'Articolo in corso.md': { colore: 'rosa', auto: false, mod: '2026-11-21T10:00:00.000Z' } } }));
  f.scrivi('note/Vecchia idea.md', 'Il coraggio delle cose piccole.\n');
  f.scrivi('note/Spesa.md', 'pane, latte\n');
  f.scrivi('note/Articolo in corso.md', 'Il progresso ha bisogno di un piano B.\n');
}, 'note esistenti');

console.log('M. Fissare una nota');
const A = await dispositivo(br, G, URL_, 'A');
await collega(A.p, 'biawrite-note', CA);
await attendiOk(A.p);
verifica(JSON.stringify(await titoli(A.p)) === JSON.stringify(['Articolo in corso', 'Spesa', 'Vecchia idea']), 'ordine per data', await titoli(A.p));
await A.p.click('.nota:has(h3:text-is("Vecchia idea")) .altro');
verifica((await A.p.textContent('#menu .voce >> nth=0')) === 'Fissa in alto', 'voce «Fissa in alto» nel menu');
await A.p.click('#menu .voce >> nth=0');
await pausa(300);
verifica((await titoli(A.p))[0] === 'Vecchia idea', 'la nota fissata va in testa anche se è la più vecchia', await titoli(A.p));
verifica(await A.p.locator('.nota.fissata .puntina').count() === 1, 'e porta la puntina');
verifica(await A.p.locator('.stacco-fissate').count() === 1, 'un piccolo stacco la separa dalle altre');
await finche(() => G.indice().note['Vecchia idea.md'].fissata === true);
verifica(G.indice().note['Vecchia idea.md'].fissata === true, 'la puntina è salvata nell\'indice del repository');
verifica(G.indice().note['Vecchia idea.md'].mod === '2024-03-01T10:00:00.000Z', 'fissare non cambia la data della nota');
verifica(G.note().get('note/Vecchia idea.md') === 'Il coraggio delle cose piccole.\n', 'né il suo contenuto');

console.log('N. Più note fissate, ricerca');
await A.p.click('.nota:has(h3:text-is("Spesa")) .altro');
await A.p.click('#menu .voce >> nth=0');
await pausa(300);
verifica(JSON.stringify(await titoli(A.p)) === JSON.stringify(['Spesa', 'Vecchia idea', 'Articolo in corso']), 'le fissate in testa, fra loro per data', await titoli(A.p));
await A.p.fill('#cerca', 'il');
await pausa(400);
verifica(JSON.stringify(await titoli(A.p)) === JSON.stringify(['Vecchia idea', 'Articolo in corso']), 'anche cercando la fissata resta in testa', await titoli(A.p));
await A.p.fill('#cerca', '');
await pausa(400);

console.log('O. Secondo dispositivo');
const B = await dispositivo(br, G, URL_, 'B', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await finche(() => G.indice().note['Spesa.md'].fissata === true);
await collega(B.p, 'biawrite-note', CB, { tocco: true });
await attendiOk(B.p);
verifica(JSON.stringify(await titoli(B.p)) === JSON.stringify(['Spesa', 'Vecchia idea', 'Articolo in corso']), 'B vede le stesse puntine', await titoli(B.p));
if (FOTO) await B.p.screenshot({ path: 'puntina-telefono.png' });

console.log('P. Modificare una fissata non toglie la puntina');
await B.p.tap('.nota:has(h3:text-is("Vecchia idea"))');
await B.p.tap('#carta');
await B.p.keyboard.type(' E quelle grandi.');
await finche(() => G.note().get('note/Vecchia idea.md').includes('quelle grandi'));
verifica(G.indice().note['Vecchia idea.md'].fissata === true, 'dopo la modifica la nota è ancora fissata');

console.log('Q. Togliere la puntina dall\'editor');
await B.p.tap('#altro');
verifica((await B.p.textContent('#menu .voce >> nth=0')) === 'Togli la puntina', 'nel menu dell\'editor la voce si inverte');
await B.p.tap('#menu .voce >> nth=0');
await finche(() => !G.indice().note['Vecchia idea.md'].fissata);
verifica(!G.indice().note['Vecchia idea.md'].fissata, 'puntina tolta anche nel repository');
await A.p.click('#stato'); await pausa(1200);
verifica(JSON.stringify(await titoli(A.p)) === JSON.stringify(['Spesa', 'Vecchia idea', 'Articolo in corso']) && await A.p.locator('.nota.fissata').count() === 1,
  'A vede la puntina tolta (Vecchia idea ora è la più recente)', await titoli(A.p));

console.log('R. Duplicare una fissata');
await A.p.click('.nota.fissata .altro');
await A.p.click('#menu .voce >> nth=2');
await pausa(300);
verifica(await A.p.locator('.nota.fissata').count() === 1, 'la copia nasce senza puntina');

console.log('S. Senza GitHub la puntina resta dopo la riapertura');
{
  const ctx = await br.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(URL_);
  await p.click('#solo-locale');
  for (const t of ['Prima', 'Seconda']) { await p.click('#nuova'); await p.fill('#titolo', t); await p.click('#carta'); await p.keyboard.type('testo ' + t); await p.click('#indietro'); await pausa(100); }
  await p.click('.nota:has(h3:text-is("Prima")) .altro');
  await p.click('#menu .voce >> nth=0');
  // si ricarica solo quando la puntina è scritta nell'archivio del browser (pochi millisecondi)
  await p.waitForFunction(() => new Promise(r => { const q = indexedDB.open('biawrite'); q.onsuccess = () => { const t = q.result.transaction('note').objectStore('note').getAll(); t.onsuccess = () => { r(t.result.some(n => n.pinned)); q.result.close(); }; }; }));
  await p.reload(); await pausa(500);
  verifica((await titoli(p))[0] === 'Prima' && await p.locator('.nota.fissata').count() === 1, 'fissata anche dopo la riapertura');
  await ctx.close();
}

if (FOTO) {
  for (const [nome, opz] of [['chiaro', {}], ['scuro', { colorScheme: 'dark' }]]) {
    const d = await dispositivo(br, G, URL_, nome, { viewport: { width: 900, height: 520 }, ...opz });
    await collega(d.p, 'biawrite-note', G.chiave('github_pat_' + nome));
    await attendiOk(d.p);
    await pausa(400);
    await d.p.screenshot({ path: 'puntina-' + nome + '.png' });
    await d.ctx.close();
  }
}

const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
