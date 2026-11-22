/* Collaudo 5 — importazione di un backup di Bear (.bear2bk) costruito ad arte.
 * Verifica che nulla vada perso: righe, a capo, date, puntine, immagini, codice, cestino. */
import { chromium, servi, GitHubFinto, pausa, finche, verifica, esito, RADICE, AVVIO, dispositivo, attendiOk, collega, creaZip, creaPng } from './lib.mjs';

const srv = await servi(RADICE, 8769);
const URL_ = 'http://localhost:8769/';
const br = await chromium.launch(AVVIO);
const G = new GitHubFinto();

/* ---- il backup finto, con la struttura di quello vero ---- */
const R = 'Bear Notes 2026-11-22 alle 11.08.bear2bk/';
const voci = [{ nome: R + 'backup.json', testo: '{"version":2}' }];
const PNG_A = creaPng(40, 30, [200, 60, 40]), PNG_B = creaPng(24, 24, [40, 90, 200]), PNG_C = creaPng(16, 16, [30, 160, 60]);
function nota(cartella, testo, meta = {}, allegati = {}) {
  const m = Object.assign({ archived: 0, creationDate: '2019-03-01T08:00:00Z', modificationDate: '2020-05-02T09:30:00Z', locked: 0, pinned: 0, trashed: 0,
    uniqueIdentifier: (cartella.replace(/\W/g, '') + 'ABCDEF0123456789').slice(0, 12).toUpperCase() + '-1928-00000185564C25DE', version: 3 }, meta);
  voci.push({ nome: R + cartella + '.textbundle/info.json', testo: JSON.stringify({ 'net.shinyfrog.bear': m, type: 'net.daringfireball.markdown', version: 2 }) });
  voci.push({ nome: R + cartella + '.textbundle/text.md', testo });
  for (const [n, dati] of Object.entries(allegati)) voci.push({ nome: R + cartella + '.textbundle/assets/' + n, dati });
}
const POESIA = '# NATALE\nNascerà in una stiva tra viaggiatori clandestini.\nLo scalderà il vapore della sala macchine.\n\nSua madre imbarcata per tentare uno scampo,\nsuo padre l’angelo di un’ora.\n';
nota('NATALE', POESIA, { creationDate: '2016-12-24T05:56:06Z', modificationDate: '2016-12-24T05:56:12Z' });
nota('NATALE 2', POESIA, { creationDate: '2017-01-02T10:00:00Z', modificationDate: '2017-01-02T10:00:00Z' });        // copia identica: in Bear era una nota a sé
nota('Con immagine', '# Con immagine\nUna fotografia:\n![](assets/foto%20uno.png)\nE poi altro testo.\n', {}, { 'foto uno.png': PNG_A });
nota('Bear uno', '[image:1E46B313-AEB3-4AEE-9726-A9D226B1C3DE-904-0000055CB2EDD144/vecchia.png]\n\nOvunque ti capiterà di posare lo sguardo.\n', {}, { 'vecchia.png': PNG_B });
nota('Disegno', '# Disegno\nUn appunto con un disegno allegato e mai citato.\n', {}, { 'bear_sketch@2x.png': PNG_C });
const CODICE = '# import numpy as np\nclass ReteNeurale():\n    def __init__(self):\n        np.random.seed(1)\n        self.pesi = 2 * np.random.random((3, 1)) - 1\nprint(ReteNeurale().pesi)\n';
nota('import numpy as np', CODICE);
const LATEX = '# La dinamica dell’epidemia\nPartiamo dal modello SIR:\n$$\n\\dot{x}=-kxy\\\\\n\\dot{y}=kxy-ly\n$$\n';
nota('La dinamica', LATEX);
nota('Fissata', '# Fissata\nUn testo con una parola ==evidenziata== e un `codice ==non toccato==`.\n', { pinned: 1, creationDate: '2026-09-05T05:31:29Z', modificationDate: '2026-09-06T07:00:00Z' });
const COSE = '# Cose da fare\n- [ ] comprare la pellicola\n- [x] sviluppare il rullino\n3. terzo punto\n4. quarto punto\nUna riga dopo l’elenco.\n';
nota('Cose da fare', COSE);
nota('Strana', '# Strana\nCreata dopo l’ultima modifica.\n', { creationDate: '2018-03-08T06:35:16Z', modificationDate: '2018-03-08T04:26:47Z' });
nota('Nel cestino', '# Nel cestino\nUna vecchia mail.\n', { trashed: 1 }, { 'logo.png': PNG_A });
nota('2024-02-12T145606Z', '');
const BACKUP = creaZip(voci);
const iso = d => new Date(d).toISOString();

console.log('T. Importare un backup di Bear');
const A = await dispositivo(br, G, URL_, 'A', { viewport: { width: 1180, height: 860 } });
await collega(A.p, 'biawrite-note', G.chiave('github_pat_bear'));
await attendiOk(A.p);
// una nota già importata in passato, come testo semplice, con lo stesso testo di «Cose da fare»
await A.p.evaluate(t => { const s = JSON.parse(localStorage.getItem('biawrite.impostazioni')); s.formato = 'txt'; localStorage.setItem('biawrite.impostazioni', JSON.stringify(s)); }, COSE);
await A.p.reload(); await attendiOk(A.p);
await A.p.click('#nuova');
await A.p.fill('#testo', COSE);
await A.p.dispatchEvent('#testo', 'input');
await A.p.click('#indietro');
await finche(() => G.note().size === 1);
const vecchiaId = await A.p.evaluate(() => [...BiaWrite.note.values()][0].id);
await A.p.setInputFiles('#scegli-file', [{ name: 'Bear Notes 2026-11-22 alle 11.08.bear2bk', mimeType: 'application/octet-stream', buffer: BACKUP }]);
await A.p.waitForSelector('#finestra[open]');
const f = (await A.p.textContent('#finestra')).replace(/\s+/g, ' ');
console.log('      ' + f.slice(0, 420));
verifica(f.includes('Importa da Bear') && f.includes('Dal backup di Bear: 9 note'), 'riconosce il backup di Bear e conta le note (le copie identiche contano)', f);
verifica(f.includes('1 con la puntina') && f.includes('3 immagini'), 'conta puntine e immagini');
verifica(f.includes('2 note con codice o formule LaTeX restano testo esatto'), 'annuncia le note che restano testo esatto');
verifica(await A.p.isVisible('#bear-cestino') && !(await A.p.isChecked('#bear-cestino')) && f.includes('nel cestino di Bear (con 1 immagine)'), 'il cestino di Bear è escluso, a scelta');
verifica(await A.p.isChecked('#bear-aggiorna') && f.includes('Una nota è già in BiaWrite con lo stesso testo'), 'riconosce la nota già importata e propone di aggiornarla');
verifica(f.includes('1 nota saltata') && !f.includes('backup.json'), 'salta la nota vuota, ignora l\'indice del backup');
verifica((await A.p.textContent('#finestra button[value="ok"]')) === 'Importa 10 note', 'il pulsante conta nuove e aggiornate');
await A.p.check('#bear-cestino');
verifica((await A.p.textContent('#finestra button[value="ok"]')) === 'Importa 11 note', 'e si aggiorna spuntando il cestino');
await A.p.uncheck('#bear-cestino');
await A.p.click('#finestra button[value="ok"]');
await finche(() => G.note().size === 10 && G.binari().size === 3, 30000);
await attendiOk(A.p, 30000);

console.log('U. Nel repository, nulla perso');
const N = G.note(), IX = G.indice().note, B = G.binari();
const nomi = [...N.keys()].map(p => p.slice(5)).sort();
console.log('      ' + nomi.join(' | '));
verifica(N.size === 10 && !nomi.some(n => n.includes('cestino')), '10 note: 9 nuove più quella aggiornata, niente cestino', nomi);
const poesia = N.get('note/NATALE.md');
verifica(poesia === '# NATALE\nNascerà in una stiva tra viaggiatori clandestini.  \nLo scalderà il vapore della sala macchine.\n\nSua madre imbarcata per tentare uno scampo,  \nsuo padre l’angelo di un’ora.\n', 'gli a capo di Bear diventano a capo veri, le strofe restano strofe', poesia);
verifica(N.get('note/NATALE (2).md') === poesia && IX['NATALE (2).md'].mod === iso('2017-01-02T10:00:00Z'), 'la copia identica è importata con le sue date');
verifica(IX['NATALE.md'].mod === iso('2016-12-24T05:56:12Z') && IX['NATALE.md'].creata === iso('2016-12-24T05:56:06Z') && IX['NATALE.md'].auto === true, 'date di creazione e modifica di Bear; titolo dalla prima riga, come in Bear');
verifica(N.get('note/import numpy as np.txt') === CODICE.replace(/^# /, ''), 'il codice resta testo esatto (senza il «# » che Bear mette al titolo)');
verifica(N.get('note/La dinamica dell’epidemia.txt') === LATEX.replace(/^# /, ''), 'le formule LaTeX restano testo esatto, barre rovesce comprese');
verifica(N.get('note/Fissata.md').includes('<mark>evidenziata</mark>') && N.get('note/Fissata.md').includes('`codice ==non toccato==`') && IX['Fissata.md'].fissata === true, 'evidenziato reso, codice in linea intatto, puntina conservata');
verifica(IX['Strana.md'].creata === iso('2018-03-08T06:35:16Z') && IX['Strana.md'].mod === iso('2018-03-08T04:26:47Z'), 'date incoerenti di Bear conservate come sono');
const conImg = N.get('note/Con immagine.md'), dir = conImg.match(/allegati\/[0-9a-z]+\//)[0];
verifica(/!\[\]\(allegati\/[0-9a-z]+\/foto%20uno\.png\)/.test(conImg) && Buffer.compare(B.get('note/' + dir + 'foto uno.png'), PNG_A) === 0, 'immagine nel repository, identica, citata dalla nota');
const bear1 = [...N].find(([p]) => p.includes('Ovunque'));
verifica(bear1 && /^!\[\]\(allegati\/[0-9a-z]+\/vecchia\.png\)$/m.test(bear1[1]) && [...B.values()].some(b => Buffer.compare(b, PNG_B) === 0), 'la vecchia immagine di Bear 1 «[image:…]» diventa un\'immagine vera', bear1 && bear1[1]);
verifica(/\n\n!\[\]\(allegati\/[0-9a-z]+\/bear_sketch%402x\.png\)\n$/.test(N.get('note/Disegno.md')), 'l\'allegato mai citato è aggiunto in fondo alla sua nota', N.get('note/Disegno.md'));
const cose = N.get('note/Cose da fare.md');
verifica(cose && !N.has('note/Cose da fare.txt'), 'la nota già presente è stata aggiornata (diventa .md), non duplicata', nomi);
verifica(await A.p.evaluate(id => !!BiaWrite.note.get(id) && BiaWrite.note.get(id).name === 'Cose da fare.md', vecchiaId), 'è la stessa nota di prima');
verifica(cose === '# Cose da fare\n- [ ] comprare la pellicola\n- [x] sviluppare il rullino\n3. terzo punto\n4. quarto punto\n\nUna riga dopo l’elenco.\n', 'caselle, numerazione e riga dopo l\'elenco intatte', cose);
verifica(IX['Cose da fare.md'].bear && IX['NATALE.md'].bear !== IX['NATALE (2).md'].bear, 'ogni nota ricorda da quale nota di Bear viene');

console.log('V. Nell\'editor');
await A.p.fill('#cerca', 'Nascerà');
await pausa(300);
await A.p.click('.nota >> nth=0');
verifica(await A.p.evaluate(() => document.querySelectorAll('#carta br').length) === 2 && await A.p.evaluate(() => document.querySelectorAll('#carta p').length) === 2, 'la poesia si vede a righe e a strofe');
await A.p.click('#indietro');
await A.p.fill('#cerca', 'Una fotografia');
await pausa(300);
await A.p.click('.nota >> nth=0');
await A.p.waitForFunction(() => [...document.querySelectorAll('#carta img')].some(i => i.naturalWidth === 40), null, { timeout: 8000 }).catch(() => {});
verifica(await A.p.evaluate(() => { const i = document.querySelector('#carta img'); return i && i.naturalWidth === 40 && i.src.startsWith('blob:') && /^allegati\//.test(i.dataset.vero); }), 'l\'immagine si vede nell\'editor');
await A.p.evaluate(() => { const c = document.querySelector('#carta'); const p = [...c.querySelectorAll('p')].pop(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); c.focus(); });
await A.p.keyboard.type(' Ritoccato.');
await finche(() => (G.note().get('note/Con immagine.md') || '').includes('Ritoccato.'), 90000);
const dopo = G.note().get('note/Con immagine.md');
verifica(/!\[\]\(allegati\/[0-9a-z]+\/foto%20uno\.png\)/.test(dopo) && !/blob:/.test(dopo), 'dopo una modifica nel testo resta l\'indirizzo vero dell\'immagine', dopo);
await A.p.click('#copia');
await pausa(300);
const html = await A.p.evaluate(async () => { const it = await navigator.clipboard.read(); return await (await it[0].getType('text/html')).text(); }).catch(() => '');
verifica(html.includes('Ritoccato') && !/<img/.test(html), 'la copia per WordPress porta il testo, non l\'immagine locale');
await A.p.click('#indietro'); await A.p.fill('#cerca', '');

console.log('W. Secondo dispositivo');
const D = await dispositivo(br, G, URL_, 'D', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await collega(D.p, 'biawrite-note', G.chiave('github_pat_bear_2'), { tocco: true });
await attendiOk(D.p, 30000);
verifica(await D.p.locator('.nota.fissata').count() === 1, 'la puntina di Bear arriva anche qui');
await D.p.fill('#cerca', 'Ovunque');
await pausa(300);
await D.p.tap('.nota >> nth=0');
await D.p.waitForFunction(() => [...document.querySelectorAll('#carta img')].some(i => i.naturalWidth === 24), null, { timeout: 8000 }).catch(() => {});
verifica(await D.p.evaluate(() => [...document.querySelectorAll('#carta img')].some(i => i.naturalWidth === 24)), 'l\'immagine arriva dal repository e si vede');

console.log('X. Il cestino, in un secondo momento');
await A.p.setInputFiles('#scegli-file', [{ name: 'backup.bear2bk', mimeType: 'application/octet-stream', buffer: BACKUP }]);
await A.p.waitForSelector('#finestra[open]');
await A.p.check('#bear-cestino');
await A.p.uncheck('#bear-aggiorna');
const f2 = (await A.p.textContent('#finestra')).replace(/\s+/g, ' ');
verifica(f2.includes('Una nota era già stata importata e l\'hai modificata qui: resta come sono'.replace('resta come sono', 'resta come sono')) || f2.includes('già state importate'), 'la nota ritoccata in BiaWrite è riconosciuta e lasciata com\'è', f2.slice(0, 400));
verifica((await A.p.textContent('#finestra button[value="ok"]')) === 'Importa 1 nota', 'reimportando, resta solo la nota del cestino');
await A.p.click('#finestra button[value="ok"]');
await finche(() => G.note().has('note/Nel cestino.md') && G.binari().size === 4, 90000);
verifica(G.note().size === 11 && G.binari().size === 4 && G.note().has('note/NATALE (2).md') && !G.note().has('note/NATALE (3).md'), 'aggiunta con la sua immagine, nessun doppione, nessun nome cambiato', { note: [...G.note().keys()], binari: [...G.binari().keys()], stato: await A.p.textContent('#stato span'), titolo: await A.p.getAttribute('#stato', 'title') });

console.log('Y. Reimportare tutto con «aggiorna»: niente cambia nome, niente si duplica');
const prima = [...G.note().keys()].sort().join();
await A.p.setInputFiles('#scegli-file', [{ name: 'backup.bear2bk', mimeType: 'application/octet-stream', buffer: BACKUP }]);
await A.p.waitForSelector('#finestra[open]');
await A.p.click('#finestra button[value="ok"]');
await pausa(1500);
await attendiOk(A.p, 90000);
verifica([...G.note().keys()].sort().join() === prima, 'stessi file, stessi nomi', [...G.note().keys()]);
verifica((G.note().get('note/Con immagine.md') || '').includes('Ritoccato.'), 'la nota ritoccata in BiaWrite non è stata toccata');

console.log('\nRichieste a GitHub: ' + G.richieste.length + ', commit: ' + G.commitFatti + ', blob: ' + G.blobCaricati);
const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
