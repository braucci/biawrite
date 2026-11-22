/* Collaudo 2 — uso senza GitHub, importazione delle vecchie note, passaggio a GitHub, PIN. */
import { chromium, servi, GitHubFinto, pausa, finche, verifica, esito, RADICE, AVVIO, dispositivo, stato, attendiOk, collega, creaZip , piatta } from './lib.mjs';

const srv = await servi(RADICE, 8766);
const URL_ = 'http://localhost:8766/';
const br = await chromium.launch(AVVIO);
const G = new GitHubFinto();
const CHIAVE = G.chiave('github_pat_segretissima_1234567890');
const nomi = p => p.evaluate(() => [...BiaWrite.note.values()].filter(n => !n.deleted).map(n => n.name).sort());

console.log('A. Solo su questo dispositivo, anche senza rete');
const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await piatta(ctx);
const p = await ctx.newPage();
p.on('pageerror', e => console.log('  ERRORE PAGINA', e.message));
await p.goto(URL_);
await p.tap('#solo-locale');
verifica(await stato(p) === 'locale', 'modalità «Solo qui»');
verifica((await p.textContent('#vuoto')).includes('importa le vecchie note'), 'la bacheca vuota propone l\'importazione');
await p.evaluate(() => navigator.serviceWorker.ready);
await pausa(800);
await p.tap('#nuova');
await p.fill('#titolo', 'Lista della spesa');
await p.tap('#carta');
await p.keyboard.type('pane, latte, caffè');
await p.tap('#indietro');
await p.tap('.nota');
await p.tap('#carta');
await p.keyboard.type(' ULTIME PAROLE');
await ctx.setOffline(true);
await p.reload();
await pausa(700);
verifica(await p.locator('.nota').count() === 1, 'senza rete l\'app si riapre');
verifica(await p.evaluate(() => [...BiaWrite.note.values()].some(n => n.content.includes('ULTIME PAROLE'))), 'il testo scritto prima della chiusura è salvo');
await ctx.setOffline(false);
await p.reload(); await pausa(500);

console.log('B. Importazione');
const vecchia = new Date(2019, 4, 12, 10, 30);
const zip = creaZip([
  { nome: 'Archivio/Diario/La pellicola scaduta.md', testo: '# La pellicola scaduta\n\nLuce di *novembre*, grana grossa.\n', data: vecchia },
  { nome: 'Archivio/Scuola/Verifica longheroni.txt', testo: 'Verifica di Costruzioni\n- longheroni\n- centine\n', data: new Date(2021, 8, 3, 8, 0), comprimi: false },
  // nome alla vecchia maniera di Windows: codifica OEM (CP437/850), dove «à» è il byte 0x85
  { nome: 'Archivio/Citt\x85 d\'arte.md', testo: 'Napoli, Roma, Firenze.\n', data: new Date(2018, 1, 1), utf8: false },
  { nome: 'Archivio/foto.jpg', dati: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]) },
  { nome: '__MACOSX/Archivio/._La pellicola scaduta.md', testo: 'spazzatura' },
  { nome: 'Archivio/.DS_Store', testo: 'spazzatura' },
  { nome: 'Archivio/vuota.md', testo: '   \n' },
]);
const cp1252 = Buffer.from('Perch\xe9 la citt\xe0 \xe8 cos\xec bella.\r\nSeconda riga.\r\n', 'latin1');
const html = '<html><head><title>x</title><style>p{color:red}</style></head><body><h1>Pagina salvata</h1><p>Con <b>grassetto</b> e <a href="https://www.raucci.net">un link</a>.</p><script>alert(1)</script></body></html>';
await p.tap('#importa');
await p.setInputFiles('#scegli-file', [
  { name: 'vecchie-note.zip', mimeType: 'application/zip', buffer: zip },
  { name: 'Lettera a un amico.txt', mimeType: 'text/plain', buffer: cp1252 },
  { name: 'Pagina salvata.html', mimeType: 'text/html', buffer: Buffer.from(html) },
  { name: 'Lista della spesa.md', mimeType: 'text/markdown', buffer: Buffer.from('pane, latte, caffè ULTIME PAROLE\n') },
  { name: 'Contratto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
]);
await p.waitForSelector('#finestra[open]');
const anteprima = await p.textContent('#finestra');
console.log('      ' + anteprima.replace(/\s+/g, ' ').slice(0, 330));
verifica(/Pronte: 5 note \(2 Markdown, 2 di testo, 1 pagine web\)/.test(anteprima), 'conta le note pronte per tipo');
verifica(/1 già presente/.test(anteprima), 'riconosce la nota già presente');
verifica(/3 file saltati/.test(anteprima), 'salta immagine, PDF e file vuoto (e ignora gli scarti di macOS)');
await p.tap('.elenco-saltati summary');
const saltati = await p.textContent('.elenco-saltati');
verifica(saltati.includes('foto.jpg') && saltati.includes('Contratto.pdf') && saltati.includes('vuota.md — vuoto'), 'dice quali file ha saltato e perché', saltati);
verifica(await p.isVisible('#txt-in-md'), 'offre di trasformare i .txt in note formattabili');
await p.tap('#finestra button[value="ok"]');
await pausa(800);
const n = await nomi(p);
verifica(JSON.stringify(n) === JSON.stringify(['Città d\'arte.md', 'La pellicola scaduta.md', 'Lettera a un amico.txt', 'Lista della spesa.md', 'Pagina salvata.md', 'Verifica longheroni.txt']), 'note importate con il nome del file', n);
const dati = await p.evaluate(() => Object.fromEntries([...BiaWrite.note.values()].map(n => [n.name, { c: n.content, m: n.modified }])));
verifica(dati['Lettera a un amico.txt'].c === 'Perché la città è così bella.\nSeconda riga.\n', 'testo Windows con accenti letto correttamente', dati['Lettera a un amico.txt'].c);
verifica(dati['Pagina salvata.md'].c.startsWith('# Pagina salvata\n\nCon **grassetto** e [un link](https://www.raucci.net).') && !/alert|color/.test(dati['Pagina salvata.md'].c), 'pagina HTML trasformata in Markdown pulito', dati['Pagina salvata.md'].c);
verifica(dati['La pellicola scaduta.md'].m === vecchia.getTime(), 'la data originale del file è conservata');
verifica(dati['Città d\'arte.md'].c === 'Napoli, Roma, Firenze.\n', 'nome con accenti dentro uno zip senza dichiarazione UTF-8');
const ordine = await p.$$eval('.nota h3', h => h.map(x => x.textContent));
verifica(ordine.indexOf('La pellicola scaduta') > ordine.indexOf('Lista della spesa') && ordine.indexOf('Città d\'arte') === ordine.length - 1, 'in bacheca le vecchie note stanno nel loro ordine di data', ordine);
await p.screenshot({ path: 'importazione.png' });

console.log('C. Reimportare gli stessi file non crea doppioni');
await p.setInputFiles('#scegli-file', [{ name: 'vecchie-note.zip', mimeType: 'application/zip', buffer: zip }]);
await p.waitForSelector('#finestra[open]');
verifica((await p.textContent('#finestra')).includes('Nessuna nota nuova da importare'), 'nessuna nota nuova');
await p.tap('#finestra button[value="ok"]');

console.log('D. Testo in Markdown, a scelta');
await p.setInputFiles('#scegli-file', [{ name: 'Appunto *speciale*.txt', mimeType: 'text/plain', buffer: Buffer.from('Costo: 3 * 4 = 12\n# non è un titolo\n') }]);
await p.waitForSelector('#txt-in-md');
await p.check('#txt-in-md');
await p.tap('#finestra button[value="ok"]');
await pausa(400);
const sp = await p.evaluate(() => [...BiaWrite.note.values()].find(n => n.name.startsWith('Appunto')));
verifica(sp.name === 'Appunto *speciale*.md'.replace(/\*/g, ' ').replace(/\s+/g, ' ').replace(' .md', '.md') && sp.content === 'Costo: 3 \\* 4 = 12  \n\\# non è un titolo\n', 'convertito con i caratteri speciali protetti', sp);

console.log('E. Molte note: dal locale a GitHub in pochi commit');
const tante = creaZip(Array.from({ length: 200 }, (_, i) => ({ nome: 'tante/Nota numero ' + (i + 1) + '.md', testo: 'Contenuto della nota ' + (i + 1) + '.\n', data: new Date(2015, 0, 1 + i) })));
await p.setInputFiles('#scegli-file', [{ name: 'tante.zip', mimeType: 'application/zip', buffer: tante }]);
await p.waitForSelector('#finestra[open]');
await p.tap('#finestra button[value="ok"]');
await pausa(600);
verifica(await p.evaluate(() => BiaWrite.note.size) === 207, 'duecento note in più');
verifica(await p.locator('.nota').count() === 120 && await p.locator('.ancora').count() === 1, 'la bacheca ne disegna 120 alla volta');
await p.evaluate(() => { const b = document.querySelector('#bacheca'); b.scrollTop = b.scrollHeight; });
await finche(async () => (await p.locator('.nota').count()) === 207, 5000);
verifica(await p.locator('.nota').count() === 207 && await p.locator('.ancora').count() === 0, 'scorrendo arrivano le altre');
await G.monta(ctx);
await p.tap('#stato');
await collega(p, 'biawrite-note', CHIAVE, { pin: true, tocco: true });
// imposta il PIN proposto
await p.tap('#finestra button[value="ok"]');
await p.waitForSelector('#finestra-campo');
await p.fill('#finestra-campo', '2468'); await p.keyboard.press('Enter'); await pausa(200);
await p.fill('#finestra-campo', '2468'); await p.keyboard.press('Enter'); await pausa(1200);
if (await p.isVisible('#finestra[open]')) await p.tap('#finestra-no');
await finche(() => G.note().size === 207, 30000);
await attendiOk(p, 20000);
verifica(G.note().size === 207, 'tutte le note sono nel repository', G.note().size);
verifica(G.commitFatti <= 2, 'in un commit più la preparazione dell\'archivio', G.commitFatti);
verifica(G.messaggi().some(m => m === 'BiaWrite: aggiorna 207 note'), 'un messaggio leggibile', G.messaggi());
verifica(G.note().get('note/Lettera a un amico.txt') === 'Perché la città è così bella.\nSeconda riga.\n', 'il testo arriva intatto');
verifica(G.indice().note['La pellicola scaduta.md'].mod === vecchia.toISOString(), 'la data originale è anche nell\'indice');

console.log('F. Chiave cifrata con il PIN');
const grezzo = await p.evaluate(() => localStorage.getItem('biawrite.impostazioni'));
const S = JSON.parse(grezzo);
verifica(!grezzo.includes(CHIAVE) && !S.token && S.tokenCifrato && S.lock && S.lock.kPin, 'nessuna traccia della chiave in chiaro');
await p.reload();
verifica(await p.isVisible('#blocco'), 'alla riapertura serve il PIN');
await p.fill('#campo-pin', '1111'); await p.keyboard.press('Enter'); await pausa(900);
verifica((await p.textContent('#errore-pin')) === 'PIN errato.', 'PIN errato respinto');
await p.fill('#campo-pin', '2468'); await p.keyboard.press('Enter'); await pausa(1500);
verifica(!(await p.isVisible('#blocco')), 'PIN giusto: si apre');
await p.tap('.nota >> nth=0');
await p.tap('#carta');
await p.keyboard.type(' Dopo lo sblocco.');
await finche(() => [...G.note().values()].some(t => t.includes('Dopo lo sblocco.')));
verifica([...G.note().values()].some(t => t.includes('Dopo lo sblocco.')), 'la chiave decifrata funziona');

console.log('G. Cambio PIN e blocco tolto');
await p.goBack(); await pausa(300);
await p.tap('#impostazioni');
await p.tap('#pannello [data-a="pin"]');
await p.fill('#finestra-campo', 'nuovo-pin'); await p.keyboard.press('Enter'); await pausa(200);
await p.fill('#finestra-campo', 'nuovo-pin'); await p.keyboard.press('Enter'); await pausa(1200);
await p.reload();
await p.fill('#campo-pin', 'nuovo-pin'); await p.keyboard.press('Enter'); await pausa(1500);
verifica(!(await p.isVisible('#blocco')) && await attendiOk(p) === 'ok', 'il nuovo PIN apre e la chiave funziona ancora');
await p.tap('#impostazioni');
await p.tap('#pannello [data-a="sblocca"]');
await p.tap('#pannello [data-a="chiudi"]');
const S2 = JSON.parse(await p.evaluate(() => localStorage.getItem('biawrite.impostazioni')));
verifica(!S2.lock && S2.token === CHIAVE && !S2.tokenCifrato, 'senza blocco la chiave torna in chiaro, come dichiarato nelle impostazioni');

console.log('H. Senza rete');
await ctx.setOffline(true); G.senzaRete = true;
await p.tap('#nuova');
await p.keyboard.type('Scritta senza rete');
await finche(async () => (await p.textContent('#stato span')) === 'Salvato qui');
verifica((await p.textContent('#stato span')) === 'Salvato qui', 'stato «Salvato qui»');
await ctx.setOffline(false); G.senzaRete = false;
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await finche(() => [...G.note().values()].some(t => t.includes('Scritta senza rete')));
verifica([...G.note().values()].some(t => t.includes('Scritta senza rete')), 'al ritorno della rete parte da sola');
await ctx.close();

console.log('I. Aspetto');
for (const [nome, opz] of [['desktop', { viewport: { width: 1180, height: 820 } }], ['scuro', { viewport: { width: 1180, height: 820 }, colorScheme: 'dark' }], ['telefono', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const d = await dispositivo(br, G, URL_, nome, opz);
  await d.p.screenshot({ path: 'benvenuto-' + nome + '.png' });
  await collega(d.p, 'biawrite-note', CHIAVE);
  await attendiOk(d.p, 20000);
  await d.p.fill('#cerca', 'a');
  await d.p.fill('#cerca', '');
  await d.p.evaluate(() => document.querySelector('#bacheca').scrollTo(0, 0));
  await pausa(400);
  await d.p.screenshot({ path: 'bacheca-' + nome + '.png' });
  await d.ctx.close();
}

const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
