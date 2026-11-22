/* Collaudo 7 — cartelle dei mesi, notte, sfondi pastello, testo a spaziatura fissa, macchie, movimenti. */
import { chromium, servi, pausa, finche, verifica, esito, RADICE, AVVIO, GitHubFinto, dispositivo, collega, attendiOk } from './lib.mjs';

const PORTA = 8771, URL_ = 'http://localhost:' + PORTA + '/';
const srv = await servi(RADICE, PORTA);
const br = await chromium.launch(AVVIO);
const FOTO = !!process.env.FOTO;
const G = new GitHubFinto();
const BUONA = G.chiave('github_pat_sette');

/* l'archivio di partenza: note nate in mesi diversi */
const d2 = n => String(n).padStart(2, '0');
const SEME = [
  ['Bozza novembre A.md', '# Bozza A\n\nPrimo appunto di novembre.\n', { colore: 'giallo', creata: '2026-11-03T09:00:00', mod: '2026-11-03T10:00:00' }],
  ['Bozza novembre B.md', '# Bozza B\n\nSecondo appunto di novembre.\n', { colore: 'rosa', creata: '2026-11-15T09:00:00', mod: '2026-11-16T10:00:00' }],
  ['Codice.txt', 'int main(void) {\n    return 0;\n}\n', { colore: 'azzurro', creata: '2026-11-10T09:00:00', mod: '2026-11-10T09:30:00' }],
  ['Ottobre uno.md', 'Una nota di ottobre.\n', { colore: 'verde', creata: '2026-10-02T09:00:00', mod: '2026-10-02T09:00:00' }],
  ['Promemoria.md', 'Da ricordare sempre.\n', { colore: 'arancio', creata: '2026-10-20T09:00:00', mod: '2026-10-21T09:00:00', fissata: true }],
  ['Marzo.md', 'Primavera.\n', { colore: 'lilla', creata: '2026-03-08T09:00:00', mod: '2026-03-08T09:00:00' }],
  ['Natale.md', 'Auguri a tutti.\n', { colore: 'carta', creata: '2025-12-24T09:00:00', mod: '2026-11-01T09:00:00' }],
];
for (let i = 1; i <= 30; i++)
  SEME.push(['Appunto ' + d2(i) + '.md', 'Settembre, appunto numero ' + i + '.\n', { colore: ['giallo', 'rosa', 'azzurro', 'verde'][i % 4], creata: '2026-09-' + d2(i) + 'T08:00:00', mod: '2026-09-' + d2(i) + 'T08:00:00' }]);
G.daFuori(f => {
  const idx = {};
  for (const [nome, testo, m] of SEME) {
    f.scrivi('note/' + nome, testo);
    idx[nome] = Object.assign({ colore: m.colore, auto: false, mod: new Date(m.mod).toISOString(), creata: new Date(m.creata).toISOString() }, m.fissata ? { fissata: true } : {});
  }
  f.scrivi('note/.biawrite.json', JSON.stringify({ formato: 1, note: idx }));
}, 'archivio di prova');

const { ctx, p } = await dispositivo(br, G, URL_, 'A', { cartelle: true, viewport: { width: 1100, height: 820 } });
await collega(p, G.repo, BUONA);
await attendiOk(p, 20000);
await finche(() => p.evaluate(() => BiaWrite.note.size === 37));

const luogo = () => p.textContent('#luogo');
const visibile = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
const nomiSchede = () => p.evaluate(() => [...document.querySelectorAll('#note .nota')].map(e => BiaWrite.note.get(e.dataset.id).name));
const nomeMeseOggi = () => p.evaluate(() => { const d = new Date(); return ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][d.getMonth()] + ' ' + d.getFullYear(); });
const impostazioni = async fn => { await p.click('#impostazioni'); await p.waitForSelector('#pannello[open]'); await fn(); await p.click('#pannello [data-a="chiudi"]'); await pausa(150); };
const errori = [];
p.on('pageerror', e => errori.push(e.message));

console.log('A. La radice: puntine, poi anni e cartelle dei mesi');
const r = await p.evaluate(() => ({
  anni: [...document.querySelectorAll('#note h2.anno')].map(h => h.textContent.replace(/\s+/g, ' ').trim()),
  mesi: [...document.querySelectorAll('#note .cartella')].map(c => c.dataset.mese),
  etichette: [...document.querySelectorAll('#note .cartella')].map(c => c.getAttribute('aria-label')),
  primo: document.querySelector('#note > :first-child').className,
  fissate: [...document.querySelectorAll('#note .griglia.fissate .nota')].map(e => BiaWrite.note.get(e.dataset.id).name),
  sciolte: document.querySelectorAll('#note .griglia.cartelle .nota').length,
  foglietti: document.querySelector('.cartella[data-mese="2026-11"]').querySelectorAll('.fogli i').length,
}));
verifica(JSON.stringify(r.anni) === JSON.stringify(['2026 36 note', '2025 1 nota']), 'anni dal più recente, ciascuno con il conto delle sue note', r.anni);
verifica(JSON.stringify(r.mesi) === JSON.stringify(['2026-11', '2026-10', '2026-09', '2026-03', '2025-12']), 'una cartella per ogni mese, dal più recente', r.mesi);
verifica(r.etichette[0] === 'Novembre 2026, 3 note' && r.etichette[2] === 'Settembre 2026, 30 note', 'la cartella dice mese, anno e quante note contiene', r.etichette);
verifica(r.primo.includes('fissate') && JSON.stringify(r.fissate) === JSON.stringify(['Promemoria.md']), 'le note con la puntina restano in testa, fuori dalle cartelle', r);
verifica(r.sciolte === 0, 'nella radice non ci sono note sciolte');
verifica(r.foglietti === 3, 'dalla cartella spuntano i foglietti colorati delle sue note', r.foglietti);
verifica(r.mesi.includes('2025-12') && r.etichette[0].includes('3 note'), 'la cartella è il mese in cui la nota è nata, non quello dell\'ultima modifica (Natale 2025 ritoccata a novembre 2026)');
verifica(!(await visibile('#indietro')) && (await visibile('#marchio')), 'nella radice si vede il nome dell\'app, non la freccia');
if (FOTO) await p.screenshot({ path: 'cartelle-radice.png' });

const alone = await p.evaluate(() => { const c = document.querySelector('#note .cartella.m-anello, #note .cartella.m-rotto'); if (!c) return 'nessuno'; const f = c.querySelector('.fronte'); return { taglia: getComputedStyle(f).overflow, sx: parseFloat(getComputedStyle(f, '::before').left) / f.clientWidth }; });
verifica(alone === 'nessuno' || (alone.taglia === 'hidden' && alone.sx > 0.4), 'l\'alone sulla cartella resta sul cartoncino, lontano dall\'etichetta', alone);

console.log('B. Dentro una cartella e ritorno');
await p.click('.cartella[data-mese="2026-11"]');
const animaSubito = await finche(() => p.evaluate(() => document.querySelector('#note').classList.contains('anima')), 1000);
await finche(async () => (await luogo()) === 'Novembre 2026', 3000);
verifica((await luogo()) === 'Novembre 2026', 'in alto il nome della cartella aperta');
verifica(JSON.stringify(await nomiSchede()) === JSON.stringify(['Bozza novembre B.md', 'Codice.txt', 'Bozza novembre A.md']), 'dentro: le note del mese, dalla più recente per data di nascita', await nomiSchede());
verifica(await p.locator('#note .cartella').count() === 0, 'dentro la cartella niente altre cartelle');
verifica((await visibile('#indietro')) && !(await visibile('#marchio')), 'compare la freccia per tornare indietro');
verifica(animaSubito, 'le note entrano con un movimento');
await pausa(1500);
verifica(!(await p.evaluate(() => document.querySelector('#note').classList.contains('anima'))), 'poi il movimento si ferma (nessuna animazione continua)');
const dataScheda = await p.textContent('.nota >> nth=2 >> time');
verifica(/3 nov/i.test(dataScheda), 'dentro la cartella il foglietto mostra la data di nascita', dataScheda);
if (FOTO) { await pausa(300); await p.screenshot({ path: 'cartella-aperta.png' }); }
await p.click('.nota >> nth=0');
await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
await p.click('#indietro');
await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'bacheca');
verifica((await luogo()) === 'Novembre 2026', 'chiudendo una nota si torna nella sua cartella');
await p.click('#indietro');
await finche(async () => (await luogo()) === '', 3000);
verifica((await luogo()) === '' && await p.locator('#note .cartella').count() === 5, 'la freccia riporta alla radice');
await p.click('.cartella[data-mese="2026-10"]');
await finche(async () => (await luogo()) === 'Ottobre 2026', 3000);
const ott = await nomiSchede();
verifica(JSON.stringify(ott) === JSON.stringify(['Promemoria.md', 'Ottobre uno.md']), 'dentro la cartella la nota con la puntina sta in testa', ott);
await p.goBack();
await finche(async () => (await luogo()) === '', 3000);
verifica((await luogo()) === '', 'anche il tasto «indietro» del browser (o del telefono) esce dalla cartella');
await p.goForward();
await finche(async () => (await luogo()) === 'Ottobre 2026', 3000);
verifica((await luogo()) === 'Ottobre 2026', '«avanti» vi rientra');
await p.reload();
await finche(async () => (await luogo()) === 'Ottobre 2026' && (await p.locator('#note .nota').count()) === 2, 8000);
verifica((await luogo()) === 'Ottobre 2026' && await p.locator('#note .nota').count() === 2, 'ricaricando la pagina si resta nella cartella');
await p.click('#indietro');
await finche(async () => (await p.locator('#note .cartella').count()) === 5, 3000);
verifica((await luogo()) === '' && await p.locator('#note .cartella').count() === 5, 'e la freccia riporta comunque alla radice');
await attendiOk(p);

console.log('C. Una nota nuova finisce nella cartella del suo mese');
const oggi = await nomeMeseOggi();
await p.click('#nuova');
await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
await p.click('#indietro');
await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'bacheca');
verifica((await luogo()) === '' && await p.evaluate(() => BiaWrite.note.size) === 37, 'una nota nuova lasciata vuota non sposta nulla (e sparisce)');
await p.click('#nuova');
await p.click('#carta');
await p.keyboard.type('Nata oggi, dalla radice.');
await p.click('#indietro');
await finche(async () => (await luogo()) === oggi, 3000);
verifica((await luogo()) === oggi, 'chiusa la nota nuova, si apre la cartella del mese corrente (' + oggi + ')', await luogo());
verifica((await nomiSchede()).length >= 1 && await p.locator('#note .nota', { hasText: 'Nata oggi' }).count() === 1, 'e la nota è lì');
await p.click('#indietro');
await finche(async () => (await luogo()) === '', 3000);
await p.click('.cartella[data-mese="2026-03"]');
await finche(async () => (await luogo()) === 'Marzo 2026', 3000);
await p.click('#nuova');
await p.click('#carta');
await p.keyboard.type('Nata oggi, da marzo.');
await p.click('#indietro');
await finche(async () => (await luogo()) === oggi, 3000);
verifica((await luogo()) === oggi, 'anche se scritta da dentro un\'altra cartella, la nota va nel mese in cui è nata');
await p.click('#indietro');
await finche(async () => (await luogo()) === '', 3000);
verifica((await luogo()) === '', 'e la freccia porta alla radice, senza ripassare da marzo');
await attendiOk(p);
const idx = G.indice().note;
const nuove = Object.entries(idx).filter(([k]) => !SEME.some(([n]) => n === k));
const NOTI = ['colore', 'auto', 'mod', 'creata', 'fissata', 'bear'];
verifica(nuove.length === 2 && Object.values(idx).every(v => Object.keys(v).every(k => NOTI.includes(k))) && [...G.note().keys()].every(k => /^note\/[^/]+$/.test(k)),
  'sul repository i file restano tutti in note/, senza sottocartelle né campi nuovi: le cartelle sono solo un modo di guardare', nuove);

console.log('D. Ricerca ed elenco unico');
await p.fill('#cerca', 'bozza');
await finche(async () => (await p.locator('#note .nota').count()) === 2, 2000);
verifica(await p.locator('#note .nota').count() === 2 && await p.locator('#note .cartella').count() === 0, 'la ricerca attraversa tutte le cartelle');
await p.fill('#cerca', '');
await finche(async () => (await p.locator('#note .cartella').count()) > 0, 2000);
verifica(await p.locator('#note .cartella').count() === 5, 'cancellata la ricerca, tornano le cartelle');
await impostazioni(() => p.selectOption('#ordine', 'tutte'));
verifica(await p.locator('#note .cartella').count() === 0 && await p.locator('#note .nota').count() === 39, 'chi preferisce, può tornare alla bacheca con tutte le note insieme');
await impostazioni(() => p.selectOption('#ordine', 'mesi'));
verifica(await p.locator('#note .cartella').count() === 5, 'e rimettere le cartelle');

console.log('E. Notte e giorno');
const aspetto = () => p.evaluate(() => {
  const h = document.documentElement, cs = getComputedStyle(h);
  const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  const sfondo = getComputedStyle(document.querySelector('#app')).backgroundColor;
  const nota = getComputedStyle(document.querySelector('.cartella .fronte') || document.querySelector('.nota .faccia')).backgroundColor;
  return { notte: h.classList.contains('notte'), sfondo, chiaro: lum(sfondo), meta: document.querySelector('meta[name="theme-color"]').content, tavolo: cs.getPropertyValue('--tavolo').trim(), schema: cs.colorScheme, nota };
});
await impostazioni(() => p.selectOption('#tema', 'notte'));
const n1 = await aspetto();
verifica(n1.notte && n1.chiaro < 0.2 && n1.schema === 'dark', 'modalità notturna: tavolo scuro', n1);
verifica(n1.meta === n1.tavolo, 'anche la barra del telefono prende il colore del tavolo', n1);
if (FOTO) await p.screenshot({ path: 'notte-radice.png' });
await impostazioni(() => p.selectOption('#tema', 'giorno'));
const n2 = await aspetto();
verifica(!n2.notte && n2.chiaro > 0.8, 'sempre giorno: tavolo chiaro', n2);
await impostazioni(() => p.selectOption('#tema', 'auto'));
await p.emulateMedia({ colorScheme: 'dark' }); await pausa(100);
const n3 = await aspetto();
await p.emulateMedia({ colorScheme: 'light' }); await pausa(100);
const n4 = await aspetto();
verifica(n3.notte && !n4.notte, '«come il dispositivo» segue il giorno e la notte del sistema, anche mentre l\'app è aperta', { n3: n3.notte, n4: n4.notte });
await impostazioni(() => p.selectOption('#tema', 'notte'));
await p.reload();
await p.waitForSelector('#note .cartella', { timeout: 8000 });
const primaDelDisegno = await p.evaluate(() => { const s = document.querySelector('head script[src="tema.js"]'); return !!s && !s.defer && !s.async && s.type !== 'module'; });
verifica((await aspetto()).notte && primaDelDisegno, 'la scelta resta, e il tema è deciso prima di disegnare la pagina (nessun lampo bianco)');

console.log('F. Sfondi pastello');
await impostazioni(() => p.selectOption('#tema', 'giorno'));
const fondo = () => p.evaluate(() => ({ s: document.documentElement.dataset.sfondo, app: getComputedStyle(document.querySelector('#app')).backgroundImage, colore: getComputedStyle(document.querySelector('#app')).backgroundColor, griglia: getComputedStyle(document.querySelector('#bacheca')).backgroundImage }));
const f0 = await fondo();
verifica(f0.s === 'salvia' && /radial-gradient/.test(f0.app) && !/linear-gradient/.test(f0.griglia), 'di serie: pastello lieve con ombre morbide, senza quadretti', f0);
const colori = new Set([f0.colore]);
for (const v of ['cielo', 'cipria', 'lavanda', 'menta']) {
  await impostazioni(() => p.click('#pannello .sfondi button[data-v="' + v + '"]'));
  const f = await fondo();
  colori.add(f.colore);
  if (FOTO && v === 'cipria') await p.screenshot({ path: 'sfondo-cipria.png' });
}
verifica(colori.size === 5, 'cinque pastelli diversi', [...colori]);
await impostazioni(() => p.click('#pannello .sfondi button[data-v="quadretti"]'));
verifica(/linear-gradient/.test((await fondo()).griglia), 'chi li vuole, ritrova i quadretti');
await p.click('#impostazioni');
const spuntato = await p.getAttribute('#pannello .sfondi button[data-v="quadretti"]', 'aria-checked');
await p.click('#pannello .sfondi button[data-v="salvia"]');
await p.click('#pannello [data-a="chiudi"]');
verifica(spuntato === 'true' && (await fondo()).s === 'salvia', 'il campione scelto resta segnato');

console.log('G. Testo a spaziatura fissa');
const apriNota = async nome => {
  if (await p.evaluate(() => document.querySelector('#app').dataset.vista) === 'editor') { await p.click('#indietro'); await pausa(200); }
  await p.fill('#cerca', nome.replace(/\.\w+$/, '')); await pausa(300);
  await p.click('#note .nota >> nth=0');
  await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
};
const carattere = () => p.evaluate(() => { const e = document.querySelector('#editor'), x = getComputedStyle(document.querySelector('#carta')).display !== 'none' ? '#carta' : '#testo'; return { fissa: e.classList.contains('fissa'), famiglia: getComputedStyle(document.querySelector(x)).fontFamily }; });
await p.fill('#cerca', 'Codice'); await pausa(300);
const ant = await p.evaluate(() => { const a = document.querySelector('#note .nota .anteprima'); return { fissa: a.classList.contains('fissa'), ws: getComputedStyle(a).whiteSpace, rientro: a.textContent.includes('    return 0;') }; });
verifica(ant.fissa && ant.ws === 'pre-wrap' && ant.rientro, 'anche sul foglietto il testo .txt è a spaziatura fissa, con i rientri conservati', ant);
await apriNota('Codice.txt');
const g1 = await carattere();
verifica(g1.fissa && /IBM Plex Mono/.test(g1.famiglia), 'le note .txt si scrivono a spaziatura fissa (IBM Plex Mono)', g1);
const caricato = await p.evaluate(async () => (await document.fonts.load('16px "IBM Plex Mono"')).length > 0 && document.fonts.check('16px "IBM Plex Mono"'));
verifica(caricato, 'il carattere è dentro l\'app (funziona anche senza rete)');
const colonne = await p.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); c.font = '16px "IBM Plex Mono"'; return [c.measureText('iiii').width, c.measureText('MMMM').width]; });
verifica(Math.abs(colonne[0] - colonne[1]) < 0.01, 'ogni lettera occupa la stessa larghezza: le colonne restano allineate', colonne);
if (FOTO) { await pausa(500); await p.screenshot({ path: 'editor-fisso.png' }); }
await apriNota('Bozza novembre A.md');
verifica(!(await carattere()).fissa, 'le note .md restano nel carattere normale');
await p.click('#indietro');
await impostazioni(() => p.selectOption('#fisso', 'sempre'));
await apriNota('Bozza novembre A.md');
verifica((await carattere()).fissa, 'a scelta, spaziatura fissa in tutte le note');
await p.click('#indietro');
await impostazioni(() => p.selectOption('#fisso', 'mai'));
await apriNota('Codice.txt');
verifica(!(await carattere()).fissa, 'oppure in nessuna');
await p.click('#indietro');
await impostazioni(() => p.selectOption('#fisso', 'txt'));
await p.fill('#cerca', ''); await pausa(300);

console.log('H. Il tasto M: un blocco a spaziatura fissa dentro una nota');
await p.click('#nuova');
await p.click('#carta');
await p.keyboard.type('Una riga normale.');
await p.keyboard.press('Enter');
await p.keyboard.type('x = vel * dt;');
await p.click('#strumenti [data-c="pre"]');
await pausa(500);
const h1 = await p.evaluate(() => ({ pre: document.querySelector('#carta pre')?.textContent, premuto: document.querySelector('#strumenti [data-c="pre"]').getAttribute('aria-pressed'), md: [...BiaWrite.note.values()].find(n => n.content.startsWith('Una riga normale')).content, fam: getComputedStyle(document.querySelector('#carta pre')).fontFamily }));
verifica(h1.pre === 'x = vel * dt;' && h1.premuto === 'true' && /IBM Plex Mono/.test(h1.fam), 'il capoverso diventa un blocco a spaziatura fissa, e il tasto si accende', h1);
verifica(h1.md === 'Una riga normale.\n\n```\nx = vel * dt;\n```\n', 'nel file è un blocco di codice Markdown', h1.md);
await p.click('#strumenti [data-c="pre"]');
await pausa(500);
const h2 = await p.evaluate(() => ({ pre: !!document.querySelector('#carta pre'), md: [...BiaWrite.note.values()].find(n => n.content.startsWith('Una riga normale')).content }));
verifica(!h2.pre && h2.md === 'Una riga normale.\n\nx = vel \\* dt;\n', 'premuto di nuovo, torna un capoverso normale (l\'asterisco protetto, per non diventare corsivo)', h2);
await p.click('#indietro');
await finche(async () => (await luogo()) === oggi, 3000);
await p.click('#indietro');
await finche(async () => (await luogo()) === '', 3000);

console.log('I. Macchie e pieghe');
await p.click('.cartella[data-mese="2026-09"]');
await finche(async () => (await p.locator('#note .nota').count()) === 30, 3000);
const segniDi = pg => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('#note .nota')].map(e => [BiaWrite.note.get(e.dataset.id).name, [...e.classList].filter(c => c.startsWith('m-')).sort().join(' ') + '|' + e.style.getPropertyValue('--r')])));
const segni = () => segniDi(p);
const s1 = await segni();
const macchiate = Object.values(s1).filter(c => /m-(anello|rotto|goccia)/.test(c)).length;
const piegate = Object.values(s1).filter(c => /m-piega/.test(c)).length;
verifica(macchiate >= 1 && macchiate <= 18, 'qualche foglietto ha una macchia (alone di tazza, goccia), non tutti', { macchiate, su: 30 });
verifica(piegate <= 12, 'qualcuno ha la piega di chi l\'ha tenuto in tasca', { piegate });
const st = await p.evaluate(() => {
  const e = document.querySelector('#note .nota.m-anello, #note .nota.m-rotto, #note .nota.m-goccia');
  if (!e) return null;
  const f = e.querySelector('.faccia'), b = getComputedStyle(f, '::before');
  const r = e.getBoundingClientRect();
  const sopra = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { img: b.backgroundImage.slice(0, 40), eventi: b.pointerEvents, testo: getComputedStyle(f.querySelector('.anteprima')).zIndex, cliccabile: e.contains(sopra) };
});
verifica(st && /url\(/.test(st.img) && st.eventi === 'none' && st.testo === '1' && st.cliccabile, 'la macchia è disegnata sotto il testo e non intralcia il tocco', st);
await p.click('#indietro'); await pausa(300);
await p.click('.cartella[data-mese="2026-09"]');
await finche(async () => (await p.locator('#note .nota').count()) === 30, 3000);
const s2 = await segni();
verifica(JSON.stringify(s1) === JSON.stringify(s2), 'ogni foglietto conserva le sue macchie: non cambiano a ogni ridisegno');
const note30 = await p.evaluate(() => [...BiaWrite.note.values()].filter(n => /^Appunto/.test(n.name)).every(n => !/m-|macchia/.test(n.content)));
verifica(note30, 'le macchie sono solo un disegno: il testo delle note non cambia');
if (FOTO) {
  await pausa(1500);
  await p.screenshot({ path: 'macchie.png' });
  const el = p.locator('#note .nota.m-anello, #note .nota.m-rotto').first();
  if (await el.count()) await el.screenshot({ path: 'macchia-dettaglio.png' });
}

console.log('J. Puntina ed eliminazione, con il loro movimento');
await p.click('#note .nota >> nth=0 >> .altro');
await p.click('#menu .voce >> text=Fissa in alto');
await pausa(120);
const piantata = await p.evaluate(() => { const e = document.querySelector('#note .nota:first-child .puntina.conficcata'); return e ? getComputedStyle(e).animationName : null; });
await p.click('#indietro');
await finche(async () => (await p.locator('#note .griglia.fissate .nota').count()) === 2, 3000);
verifica(await p.locator('#note .griglia.fissate .nota').count() === 2, 'la nota fissata dalla cartella sale in testa alla radice');
verifica(piantata === 'conficca', 'la puntina si pianta con un piccolo colpo', piantata);
await p.click('.cartella[data-mese="2026-09"]');
await finche(async () => (await p.locator('#note .nota').count()) === 30, 3000);
const vittima = await p.getAttribute('#note .nota >> nth=5', 'data-id');
await p.click('#note .nota >> nth=5 >> .altro');
await p.click('#menu .voce.rosso');
await p.click('#finestra button[value="ok"]');
const via = await finche(() => p.evaluate(id => { const e = document.querySelector('.nota[data-id="' + id + '"]'); return !!e && e.classList.contains('via') && getComputedStyle(e).animationName === 'via'; }, vittima), 1000);
verifica(via, 'il foglietto eliminato si stacca e scivola via, invece di sparire di colpo');
await finche(async () => (await p.locator('#note .nota').count()) === 29, 3000);
verifica(await p.locator('#note .nota').count() === 29, 'poi se ne va davvero');
const sotto = await p.evaluate(() => { const e = document.querySelector('#note .nota'); const cs = getComputedStyle(e); return { durata: cs.transitionDuration, curva: cs.transitionTimingFunction }; });
verifica(/cubic-bezier\(0\.34, 1\.36/.test(sotto.curva), 'al passaggio del mouse il foglietto si solleva con una curva a molla, non lineare', sotto);
await attendiOk(p);

console.log('K. Chi chiede meno movimento');
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.click('#indietro');
await finche(async () => (await luogo()) === '', 3000);
await p.click('.cartella[data-mese="2026-11"]');
const subito = await p.evaluate(() => ({ luogo: document.querySelector('#luogo').textContent, anima: document.querySelector('#note').classList.contains('anima'), an: getComputedStyle(document.querySelector('#note .nota')).animationName }));
verifica(subito.luogo === 'Novembre 2026' && !subito.anima && subito.an === 'none', 'con «riduci movimento» del sistema, la cartella si apre subito e senza animazioni', subito);
await p.emulateMedia({ reducedMotion: 'no-preference' });
await p.click('#indietro');

console.log('L. Al telefono');
const T = await dispositivo(br, G, URL_, 'T', { cartelle: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await collega(T.p, G.repo, BUONA, { tocco: true });
await attendiOk(T.p, 20000);
await finche(() => T.p.evaluate(() => document.querySelectorAll('#note .cartella').length === 5));
const tel = await T.p.evaluate(() => { const c = [...document.querySelectorAll('#note .cartella')].map(e => e.getBoundingClientRect()); return { per: c.filter(x => Math.abs(x.top - c[0].top) < 4).length, dentro: c.every(x => x.right <= innerWidth + 1 && x.left >= -1), largo: document.documentElement.scrollWidth <= innerWidth }; });
verifica(tel.per >= 2 && tel.dentro && tel.largo, 'sul telefono le cartelle stanno affiancate, senza uscire dallo schermo', tel);
if (FOTO) { await T.p.screenshot({ path: 'telefono-radice.png' }); }
await T.p.tap('.cartella[data-mese="2026-09"]');
await finche(async () => (await T.p.textContent('#luogo')) === 'Settembre 2026', 3000);
verifica((await T.p.textContent('#luogo')) === 'Settembre 2026', 'con un tocco si entra');
const sT = await segniDi(T.p), comuni = Object.keys(sT).filter(k => k in s1);
verifica(comuni.length >= 28 && comuni.every(k => sT[k] === s1[k]), 'lo stesso foglietto ha la stessa inclinazione e le stesse macchie sul computer e sul telefono', comuni.filter(k => sT[k] !== s1[k]).slice(0, 3));
if (FOTO) { await pausa(900); await T.p.screenshot({ path: 'telefono-cartella.png' }); }
await T.ctx.close();

verifica(errori.length === 0, 'nessun errore nella pagina', errori);
const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
