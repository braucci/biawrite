/* Collaudo 8 — il diario alimentare: cartella fissa, cockpit, calendario, giorno, file, repository.
 * Il diario usato qui è inventato (diario-finto.mjs). */
import { chromium, servi, pausa, finche, verifica, esito, RADICE, AVVIO, GitHubFinto, dispositivo, collega, attendiOk } from './lib.mjs';
import { diarioFinto, piu } from './diario-finto.mjs';
import fs from 'fs'; import os from 'os'; import path from 'path';

const PORTA = 8772, URL_ = 'http://localhost:' + PORTA + '/';
const srv = await servi(RADICE, PORTA);
const br = await chromium.launch(AVVIO);
const FOTO = !!process.env.FOTO;
const G = new GitHubFinto();
const BUONA = G.chiave('github_pat_otto');
const PERCORSO = 'diario/diario-alimentare.md';

const OGGI = new Date().toLocaleDateString('sv-SE');                       // AAAA-MM-GG nel fuso del collaudo
const OPZ = { fine: OGGI, giorni: 40, inCorso: true, buchi: [5, 6, 17], oltre: [9, 22], surplus: [30], misure: { [piu(OGGI, -19)]: 72.9, [piu(OGGI, -5)]: 72.1 } };
const F1 = diarioFinto(OPZ);
const A1 = F1.attesi, chiusi = A1.filter(a => a.stato === 'chiusa');
const media = a => a.reduce((s, x) => s + x, 0) / a.length;
const it0 = v => Math.round(v).toLocaleString('it-IT');

/* il campo di scelta del file: nei collaudi si usa sempre quello classico, salvo dove si prova il file ricordato */
const senzaFSA = ctx => ctx.addInitScript(() => { if (!window.__fsa) window.showOpenFilePicker = undefined; });
async function carica(p, testo, nome = 'diario-alimentare.md', tocco = false) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), tocco ? p.tap('#diario [data-a="aggiorna"]') : p.click('#diario [data-a="aggiorna"]')]);
  await fc.setFiles({ name: nome, mimeType: 'text/markdown', buffer: Buffer.from(testo) });
}
const luogo = p => p.textContent('#luogo');
const vista = p => p.evaluate(() => document.querySelector('#app').dataset.vista);
const errori = [];

const A = await dispositivo(br, G, URL_, 'A', { cartelle: true, viewport: { width: 1240, height: 900 } });
await senzaFSA(A.ctx);
A.p.on('pageerror', e => errori.push(e.message));
await A.p.reload();
await collega(A.p, G.repo, BUONA);
await attendiOk(A.p);
const p = A.p;
await p.click('#nuova'); await p.click('#carta'); await p.keyboard.type('Una nota qualunque.'); await p.click('#indietro');
await finche(async () => (await luogo(p)) !== '', 3000);
await p.click('#indietro');
await attendiOk(p);

console.log('A. Il pulsante del diario sulla plancia');
const a1 = await p.evaluate(() => ({ n: document.querySelectorAll('#plancia .pl-diario').length, inBacheca: document.querySelectorAll('#note .pl-diario, #note .pl-diario').length, mesi: document.querySelectorAll('#note .cartella:not(.speciale)').length,
  sopra: !!(document.querySelector('#plancia').compareDocumentPosition(document.querySelector('#note')) & Node.DOCUMENT_POSITION_FOLLOWING), etichetta: document.querySelector('.pl-diario').getAttribute('aria-label'), testo: document.querySelector('.pl-diario').innerText }));
verifica(a1.n === 1 && a1.inBacheca === 0 && a1.mesi === 1, 'il diario si apre da un pulsante della plancia, non da una cartella fra le note', a1);
verifica(a1.sopra && /Diario alimentare/.test(a1.testo), 'la plancia sta sopra la bacheca', a1);
verifica(/tocca per caricare/.test(a1.etichetta), 'finché è vuoto lo dice', a1.etichetta);
await p.fill('#cerca', 'nota'); await pausa(300);
verifica(await p.locator('#plancia .pl-diario').count() === 0, 'durante la ricerca non compare');
await p.fill('#cerca', ''); await pausa(300);
const imp = async fn => { await p.click('#impostazioni'); await p.waitForSelector('#pannello[open]'); await fn(); await p.click('#pannello [data-a="chiudi"]'); await pausa(150); };
await imp(() => p.selectOption('#ordine', 'tutte'));
verifica(await p.locator('#plancia .pl-diario').count() === 1 && await p.locator('#note .nota').count() === 1, 'c\'è anche nella bacheca «tutte insieme»');
await imp(() => p.selectOption('#mostra-diario', 'no'));
verifica(await p.locator('#plancia .pl-diario').count() === 0, 'chi non la vuole la toglie dalle impostazioni');
await imp(async () => { await p.selectOption('#mostra-diario', 'si'); await p.selectOption('#ordine', 'mesi'); });
verifica(await p.locator('#plancia .pl-diario').count() === 1, 'e la rimette');

console.log('B. Dentro: prima il file');
await p.click('.pl-diario');
await finche(async () => (await vista(p)) === 'diario', 3000);
verifica((await luogo(p)) === 'Diario alimentare' && await p.isVisible('#indietro') && !(await p.isVisible('#nuova')) && !(await p.isVisible('#cerca')), 'si apre il diario: titolo, freccia, niente «Nuova nota»');
verifica(await p.locator('#diario .dz-benvenuto [data-a="aggiorna"]').count() === 1, 'senza diario: l\'invito a caricare il file');
await carica(p, '# Lista della spesa\n\n- pane\n- latte\n', 'spesa.md');
await finche(() => p.evaluate(() => [...document.querySelectorAll('#avvisi .avviso')].some(a => /non trovo i giorni/.test(a.textContent))), 3000);
verifica(await p.locator('#diario .dz-benvenuto').count() === 1 && !G.file().has(PERCORSO), 'un file che non è un diario viene rifiutato con una spiegazione, e non va da nessuna parte');
await carica(p, F1.testo);
await finche(async () => (await p.locator('#diario .dz-andamento').count()) === 1, 4000);
verifica(await p.locator('#diario .dz-andamento').count() === 1, 'caricato il diario, compare il cockpit');

console.log('C. Il cockpit');
const ind = await p.evaluate(() => ({ o: BiaCruscotto.indicatori, n: BiaCruscotto.modello.giorni.length, rif: BiaCruscotto.modello.rif }));
verifica(ind.n === A1.length && ind.o.chiusi === chiusi.length, 'tutti i giorni del file sono letti (' + A1.length + ', di cui ' + chiusi.length + ' chiusi)', ind.n);
verifica(Math.abs(ind.o.mediaKcal - media(chiusi.map(a => a.kcal))) < 1e-6 && Math.abs(ind.o.mediaP - media(chiusi.map(a => a.p))) < 1e-6 && Math.abs(ind.o.mediaDeficit - media(chiusi.map(a => 1960 - a.kcal))) < 1e-6, 'medie e deficit calcolati sui giorni chiusi tornano con i dati di partenza');
const tessere = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#diario .dz-tessera')].map(t => [t.querySelector('.e').textContent, t.querySelector('.v').textContent.trim()])));
verifica(tessere['Media giornaliera'] === it0(media(chiusi.map(a => a.kcal))) + ' kcal' && tessere['Giorni entro la soglia'] === chiusi.filter(a => a.kcal <= 1500).length + ' su ' + chiusi.length, 'le tessere mostrano quei numeri', tessere);
verifica(/kcal al giorno/.test(tessere['Deficit medio']) && 'Deficit accumulato' in tessere && 'Proteine medie' in tessere && 'Fibra media' in tessere && 'Passi' in tessere, 'deficit medio e accumulato, proteine, fibra, passi', Object.keys(tessere));
const gr = await p.evaluate(() => { const s = document.querySelector('[data-grafico="kcal"] svg'); return { barre: s.querySelectorAll('.ba').length, oltre: s.querySelectorAll('.ba.oltre').length, surplus: s.querySelectorAll('.ba.surplus').length, corso: s.querySelectorAll('.ba.corso').length, tocchi: s.querySelectorAll('.tocco').length, testo: s.textContent, larga: s.getBoundingClientRect().width <= s.parentElement.clientWidth + 1 }; });
const in30 = A1.filter(a => a.data > piu(OGGI, -30));
verifica(gr.barre === in30.length && gr.tocchi === in30.length, 'grafico delle calorie: una barra per ogni giorno registrato degli ultimi 30', gr);
verifica(gr.oltre === in30.filter(a => a.kcal > 1500 && a.kcal <= 1960).length && gr.oltre >= 1 && gr.surplus === 1 && gr.corso === 1, 'le giornate oltre la soglia, oltre il dispendio e quella in corso sono distinte', gr);
verifica(/soglia 1500/.test(gr.testo) && /dispendio 1960/.test(gr.testo) && gr.larga, 'soglia e dispendio sono linee con la loro scritta', gr.testo.slice(0, 80));
await p.click('#diario [data-a="periodo"][data-v="0"]'); await pausa(200);
verifica(await p.locator('[data-grafico="kcal"] .ba').count() === A1.length, '«Tutto» mostra l\'intero diario');
await p.click('#diario [data-a="periodo"][data-v="30"]'); await pausa(200);
await p.hover('[data-grafico="kcal"] .tocco >> nth=3');
const fum = await p.evaluate(() => { const f = document.querySelector('.dz-fumetto'); return f.hidden ? null : f.textContent; });
verifica(fum && fum.includes(it0(in30[3].kcal) + ' kcal'), 'passando su una barra si leggono giorno e calorie', fum);
const peso = await p.evaluate(() => ({ t: document.querySelector('#diario .dz-peso').innerText, punti: document.querySelectorAll('[data-grafico="peso"] .pu').length, piano: !!document.querySelector('[data-grafico="peso"] .piano') }));
verifica(/72,1/.test(peso.t) && /−1,9 kg/.test(peso.t) && /obiettivo 62 kg/.test(peso.t) && /BMI/.test(peso.t) && /Da perdere/.test(peso.t) && /10,1 kg/.test(peso.t), 'peso: ultimo valore, variazione dall\'inizio, obiettivo, BMI, chili da perdere', peso.t.slice(0, 200));
verifica(peso.punti === 3 && peso.piano, 'grafico del peso: le pesate e la linea del piano', peso);
verifica(/Misure registrate/.test(peso.t) && /75,2 kg/.test(peso.t), 'e l\'elenco delle misure, comprese quelle vecchie');
const tab = await p.evaluate(() => document.querySelectorAll('#diario .dz-andamento .dz-tab tbody tr').length);
verifica(tab === A1.length, 'tutti i numeri sono anche in tabella', tab);
if (FOTO) { await p.mouse.move(5, 5); await pausa(600); await p.screenshot({ path: 'diario-cockpit.png' }); }

console.log('D. Calendario e giorno');
const ult = A1[A1.length - 1];
const d0 = await p.evaluate(() => ({ titolo: document.querySelector('.dz-g-testa h2').textContent, timbro: document.querySelector('.dz-timbro').textContent, kcal: document.querySelector('.dz-quadrante .dz-lettura b').textContent, scelto: document.querySelector('.gc.scelto')?.dataset.giorno, pasti: document.querySelectorAll('.dz-pasto').length, ago: !!document.querySelector('.dz-strumento .ago') }));
verifica(d0.scelto === ult.data && d0.timbro === 'in corso' && d0.kcal === it0(ult.kcal) && d0.pasti === ult.pasti && d0.ago, 'all\'apertura è scelto l\'ultimo giorno, con lo strumento delle calorie', d0);
const cal = await p.evaluate(() => ({ attivi: [...document.querySelectorAll('.dz-cal button.gc')].map(b => b.dataset.giorno), spenti: document.querySelectorAll('.dz-cal span.gc.nessuno').length, mese: document.querySelector('#dz-mese').textContent }));
const delMese = A1.filter(a => a.data.slice(0, 7) === OGGI.slice(0, 7)).map(a => a.data);
verifica(JSON.stringify(cal.attivi) === JSON.stringify(delMese) && cal.spenti > 0, 'nel calendario si possono scegliere solo i giorni registrati', cal);
const bersaglio = chiusi[chiusi.length - 3];
if (bersaglio.data.slice(0, 7) !== OGGI.slice(0, 7)) await p.click('.dz-cal [data-a="mese"][data-v="-1"]');
await p.click('.dz-cal button.gc[data-giorno="' + bersaglio.data + '"]');
const d1 = await p.evaluate(() => ({ timbro: document.querySelector('.dz-timbro').textContent, kcal: document.querySelector('.dz-quadrante .dz-lettura b').textContent, esito: document.querySelector('.dz-esito').textContent, pasti: [...document.querySelectorAll('.dz-pasto')].map(x => [x.querySelector('h4').textContent, x.querySelector('time')?.textContent, x.querySelector('header .k').textContent.trim(), x.querySelectorAll('tbody tr').length]),
  mis: [...document.querySelectorAll('.dz-g-macro .dz-mis')].map(m => m.querySelector('.v').textContent), fatti: document.querySelector('.dz-fatti')?.innerText || '', quote: document.querySelector('.dz-g-macro .dz-quote .seg').getAttribute('aria-label'), note: document.querySelector('.dz-giorno > .dz-nota .dz-prosa').innerHTML, scelta: !!document.querySelector('[data-grafico="kcal"] .scelta'), premuto: document.querySelector('.gc.scelto').getAttribute('aria-pressed') }));
verifica(d1.timbro === 'giornata chiusa' && d1.kcal === it0(bersaglio.kcal) && /margine di/.test(d1.esito) && d1.premuto === 'true', 'scelto un giorno dal calendario, se ne vedono calorie ed esito', d1);
verifica(d1.pasti.length === 4 && d1.pasti[0][0] === 'Colazione' && /^07:\d\d$/.test(d1.pasti[0][1]) && d1.pasti[0][2] === '296 kcal' && d1.pasti[0][3] === 3 && d1.pasti[3][3] === 4, 'i pasti con l\'ora, il totale e gli alimenti', d1.pasti);
verifica(d1.mis[0] === String(bersaglio.p).replace('.', ',') + ' g' && d1.mis[1] === String(bersaglio.f).replace('.', ',') + ' g' && /Proteine \d+%, Carboidrati \d+%, Grassi \d+%/.test(d1.quote), 'proteine e fibra rispetto all\'obiettivo, e da dove viene l\'energia', d1);
verifica(/Bilancio stimato/.test(d1.fatti) && d1.fatti.includes('−' + it0(1960 - bersaglio.kcal)), 'il bilancio stimato del giorno (dispendio meno calorie)', d1.fatti);
verifica(/<strong>verdure<\/strong>|<b>verdure<\/b>/.test(d1.note) && /<li>/.test(d1.note), 'le note del giorno sono riportate per intero, con la loro formattazione', d1.note.slice(0, 200));
verifica(d1.scelta, 'nel grafico il giorno scelto è messo in evidenza');
await p.click('.dz-g-testa button[aria-label*="successivo"]');
verifica(await p.evaluate(() => document.querySelector('.gc.scelto')?.dataset.giorno) === chiusi[chiusi.length - 2].data, 'le frecce passano al giorno registrato vicino');
await p.click('[data-grafico="kcal"] .tocco >> nth=2');
verifica(await p.textContent('.dz-quadrante .dz-lettura b') === it0(in30[2].kcal), 'anche toccando una barra del grafico si sceglie il giorno');
await p.focus('[data-grafico="kcal"] .tocco >> nth=4'); await p.keyboard.press('Enter');
verifica(await p.textContent('.dz-quadrante .dz-lettura b') === it0(in30[4].kcal), 'e con la tastiera');
const sopra = A1.find(a => a.kcal > 1960);
await p.click('#diario .dz-andamento summary'); await p.click('#diario .dz-andamento .dz-tab button[data-giorno="' + sopra.data + '"]');
const d2 = await p.evaluate(() => ({ esito: document.querySelector('.dz-esito').textContent, cls: document.querySelector('.dz-esito').className, fatti: document.querySelector('.dz-fatti').innerText }));
verifica(/oltre la soglia/.test(d2.esito) && /surplus/.test(d2.cls) && /surplus sul dispendio/.test(d2.fatti), 'un giorno oltre il dispendio è detto tale, a parole e non solo con il colore', d2);
if (FOTO) { await p.locator('.dz-giorno').scrollIntoViewIfNeeded(); await pausa(500); await p.screenshot({ path: 'diario-giorno.png' }); }

console.log('E. Uscire e rientrare');
await p.click('#indietro');
await finche(async () => (await vista(p)) === 'bacheca', 3000);
const lab = await p.getAttribute('.pl-diario', 'aria-label');
verifica((await luogo(p)) === '' && new RegExp(A1.length + ' giorni').test(lab) && await p.locator('.pl-diario .pl-graf rect').count() > 3, 'la freccia riporta alla bacheca; il pulsante ora dice quanti giorni contiene e mostra un piccolo grafico', lab);
await p.goForward(); await finche(async () => (await vista(p)) === 'diario', 3000);
verifica((await vista(p)) === 'diario', '«avanti» del browser rientra nel diario');
await p.reload(); await finche(async () => (await p.locator('#diario .dz-andamento').count()) === 1, 6000);
verifica((await vista(p)) === 'diario' && await p.locator('#diario .dz-andamento').count() === 1, 'ricaricando la pagina si resta nel diario, già caricato');
await p.keyboard.press('Escape'); await finche(async () => (await vista(p)) === 'bacheca', 3000);
verifica((await vista(p)) === 'bacheca' && await p.locator('#note .cartella:not(.speciale)').count() === 1, 'Esc (o «indietro») torna alla bacheca delle note');

console.log('F. Nel repository privato, e sugli altri dispositivi');
await attendiOk(p, 15000);
verifica(G.file().get(PERCORSO) === F1.testo, 'il diario è nel repository, in diario/, identico al file carattere per carattere');
verifica(G.note().size === 1 && !Object.keys(G.indice().note).some(k => /diario/i.test(k)), 'non è diventato una nota: l\'archivio delle note non cambia', [...G.note().keys()]);
verifica(G.messaggi()[0] === 'BiaWrite: aggiorna il diario alimentare', 'il salvataggio ha un messaggio leggibile nella cronologia', G.messaggi()[0]);
const commit0 = G.commitFatti;
await p.click('.pl-diario'); await finche(async () => (await vista(p)) === 'diario', 3000);
await carica(p, F1.testo);
await pausa(1500); await attendiOk(p);
verifica(G.commitFatti === commit0, 'ricaricare lo stesso file non produce un altro salvataggio');
const B = await dispositivo(br, G, URL_, 'B', { cartelle: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await senzaFSA(B.ctx); await B.p.reload();
B.p.on('pageerror', e => errori.push(e.message));
await collega(B.p, G.repo, BUONA, { tocco: true });
await attendiOk(B.p, 15000);
await finche(() => B.p.evaluate(() => /giorni/.test(document.querySelector('.pl-diario')?.getAttribute('aria-label') || '')), 8000);
await B.p.tap('.pl-diario'); await finche(async () => (await B.p.locator('#diario .dz-andamento').count()) === 1, 5000);
const b1 = await B.p.evaluate(() => ({ n: BiaCruscotto.modello?.giorni.length, fonte: document.querySelector('.dz-fonte')?.textContent, largo: document.documentElement.scrollWidth <= innerWidth && document.querySelector('#diario').scrollWidth <= document.querySelector('#diario').clientWidth + 1, svg: document.querySelector('[data-grafico="kcal"] svg').getBoundingClientRect().width }));
verifica(b1.n === A1.length && /ricevuto da GitHub/.test(b1.fonte), 'il telefono riceve il diario da sé, senza caricare alcun file', b1);
verifica(b1.largo && b1.svg <= 390, 'sul telefono il cockpit sta nello schermo', b1);
if (FOTO) { await pausa(600); await B.p.screenshot({ path: 'diario-telefono.png' }); }
// il diario cresce di un giorno: lo si carica dal telefono, il computer lo riceve
const F2 = diarioFinto(Object.assign({}, OPZ, { giorni: 41, fine: piu(OGGI, 1), buchi: [5, 6, 17], inCorso: true }));
await carica(B.p, F2.testo, 'diario-alimentare.md', true);
await finche(() => G.file().get(PERCORSO) === F2.testo, 10000);
verifica(G.file().get(PERCORSO) === F2.testo, 'un diario aggiornato caricato dal telefono sale nel repository');
await p.click('#stato'); await finche(() => p.evaluate(n => BiaCruscotto.modello.giorni.length === n, F2.attesi.length), 8000);
const a2 = await p.evaluate(() => ({ n: BiaCruscotto.modello.giorni.length, vista: document.querySelector('#app').dataset.vista, barre: document.querySelectorAll('[data-grafico="kcal"] .ba').length, fonte: document.querySelector('.dz-fonte').textContent }));
verifica(a2.n === F2.attesi.length && a2.vista === 'diario' && new RegExp(F2.attesi.length + ' giorni').test(a2.fonte), 'il computer, con il diario aperto, si aggiorna da solo alla sincronizzazione', a2);
await p.click('#indietro'); await finche(async () => (await vista(p)) === 'bacheca', 3000);
await p.click('#nuova'); await p.click('#carta'); await p.keyboard.type('Seconda nota, dopo il diario.'); await p.click('#indietro');
await finche(async () => (await luogo(p)) !== '', 3000); await p.click('#indietro'); await finche(async () => (await luogo(p)) === '', 3000);
await pausa(4500); await attendiOk(p, 12000);
verifica(G.note().size === 2 && G.file().get(PERCORSO) === F2.testo, 'le note continuano a salvarsi come prima, e il diario resta al suo posto', [...G.file().keys()]);
G.daFuori(f => f.scrivi(PERCORSO, F1.testo), 'diario caricato dal sito');
await p.click('#stato'); await finche(() => p.evaluate(n => BiaCruscotto.modello.giorni.length === n, A1.length), 8000);
verifica(await p.evaluate(() => BiaCruscotto.modello.giorni.length) === A1.length, 'anche un diario messo nel repository da fuori (dal sito di GitHub, da un altro programma) arriva nell\'app');
await B.ctx.close();

console.log('G. Il file ricordato (dove il browser lo consente)');
// serve un profilo vero (non «in incognito»): solo lì il browser sa conservare il riferimento a un file
const profilo = fs.mkdtempSync(path.join(os.tmpdir(), 'biawrite-'));
const ctxC = await chromium.launchPersistentContext(profilo, Object.assign({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' }, AVVIO));
await G.monta(ctxC);
const C = { ctx: ctxC, p: ctxC.pages()[0] || await ctxC.newPage() };
C.p.on('pageerror', e => errori.push(e.message));
await C.p.goto(URL_);
await C.p.click('#solo-locale');
const scrivi = t => C.p.evaluate(async t => { window.__collaudo = true; const d = await navigator.storage.getDirectory(); const h = await d.getFileHandle('diario-alimentare.md', { create: true }); const w = await h.createWritable(); await w.write(t); await w.close(); window.__collaudo = false; return true; }, t);
await scrivi(F1.testo);
await C.ctx.addInitScript(() => {
  window.__permessi = []; window.__scritture = 0;                         // ciò che l'app chiede al file, per la prova della sola lettura
  const rp = FileSystemFileHandle.prototype.requestPermission, cw = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.requestPermission = function (o) { window.__permessi.push((o && o.mode) || 'read'); return rp.call(this, o); };
  FileSystemFileHandle.prototype.createWritable = function (...a) { if (!window.__collaudo) window.__scritture++; return cw.apply(this, a); };
  window.showOpenFilePicker = async o => { window.__scelte = (window.__scelte || 0) + 1; window.__modo = (o && o.mode) || 'read'; const d = await navigator.storage.getDirectory(); return [await d.getFileHandle('diario-alimentare.md')]; };
});
await C.p.reload();
await C.p.click('.pl-diario'); await finche(async () => (await vista(C.p)) === 'diario', 3000);
await C.p.click('#diario [data-a="aggiorna"]');
await finche(async () => (await C.p.locator('#diario .dz-andamento').count()) === 1, 5000);
const c1 = await C.p.evaluate(() => ({ n: BiaCruscotto.modello?.giorni.length, tasto: document.querySelector('#diario [data-a="aggiorna"]').textContent, scelte: window.__scelte }));
verifica(c1.n === A1.length && c1.tasto === 'Rileggi il file' && c1.scelte === 1 && await C.p.evaluate(() => window.__modo) === 'read', 'scelto una volta, il file viene ricordato', c1);
await pausa(30); await scrivi(F2.testo);
await C.p.click('#indietro'); await finche(async () => (await vista(C.p)) === 'bacheca', 3000);
await C.p.click('.pl-diario');
await finche(() => C.p.evaluate(n => BiaCruscotto.modello.giorni.length === n, F2.attesi.length), 5000);
verifica(await C.p.evaluate(() => BiaCruscotto.modello.giorni.length) === F2.attesi.length && await C.p.evaluate(() => window.__scelte) === 1, 'riaprendo la cartella il diario si rilegge da solo, senza scegliere di nuovo il file');
await C.p.reload(); await finche(async () => (await C.p.locator('#diario .dz-andamento').count()) === 1, 6000);
await pausa(30); await scrivi(F1.testo);
await C.p.click('#diario [data-a="aggiorna"]');
await finche(() => C.p.evaluate(n => BiaCruscotto.modello.giorni.length === n, A1.length), 5000);
verifica(await C.p.evaluate(() => BiaCruscotto.modello.giorni.length) === A1.length && !(await C.p.evaluate(() => window.__scelte)), 'il ricordo del file resiste alla chiusura dell\'app; «Rileggi il file» lo rilegge subito');
verifica(await C.p.evaluate(() => BiaWrite.stato()) === 'locale', 'il diario funziona anche senza GitHub, solo su questo dispositivo');

console.log('G2. Sola lettura: BiaWrite non può modificare il diario');
// si usa a fondo il cockpit, poi si guarda il file: stessi byte, stessa data di modifica
const leggiFile = () => C.p.evaluate(async () => { const f = await (await (await navigator.storage.getDirectory()).getFileHandle('diario-alimentare.md')).getFile(); return { t: await f.text(), m: f.lastModified, scritture: window.__scritture, permessi: window.__permessi, modo: window.__modo }; });
const prima = await leggiFile();
await C.p.click('.dz-cal button.gc >> nth=0'); await C.p.click('#diario [data-a="periodo"][data-v="0"]'); await C.p.click('#diario [data-a="aggiorna"]'); await pausa(300);
await C.p.click('#indietro'); await finche(async () => (await vista(C.p)) === 'bacheca', 3000); await C.p.click('.pl-diario'); await finche(async () => (await vista(C.p)) === 'diario', 3000); await pausa(400);
const dopo = await leggiFile();
verifica(dopo.t === prima.t && dopo.t === F1.testo && dopo.m === prima.m, 'dopo l\'uso il file è identico: stesso contenuto, stessa data di modifica');
verifica(dopo.scritture === 0 && dopo.permessi.every(m => m === 'read'), 'l\'app non apre mai il file in scrittura e non ne chiede mai il permesso', { scritture: dopo.scritture, permessi: dopo.permessi });
const codice = ['diario.js', 'cruscotto.js'].map(f => fs.readFileSync(path.join(RADICE, f), 'utf8')).join('\n');
verifica(!/createWritable|showSaveFilePicker|mode:\s*'readwrite'|\.truncate\(|\.move\(/.test(codice) && /showOpenFilePicker\(\{[^}]*mode: 'read'/.test(codice), 'nel codice del modulo non esiste alcuna chiamata che scriva un file: il file si apre in modalità «read»');
const comandi = await C.p.evaluate(() => ({ campi: document.querySelectorAll('#diario input, #diario textarea, #diario select, #diario [contenteditable]').length, tasti: [...document.querySelectorAll('#diario button')].map(b => (b.dataset.a || (b.dataset.giorno !== undefined ? 'giorno' : b.textContent.trim()))).filter((x, i, a) => a.indexOf(x) === i), sola: document.querySelector('.dz-sola')?.textContent }));
verifica(comandi.campi === 0 && comandi.tasti.every(t => ['aggiorna', 'periodo', 'mese', 'giorno'].includes(t)) && comandi.sola === 'sola lettura', 'nel cockpit non c\'è nulla con cui scrivere: solo leggere il file, scegliere il periodo, il mese e il giorno', comandi);
await C.ctx.close(); fs.rmSync(profilo, { recursive: true, force: true });

console.log('H. Un file ostile non fa danni');
const cattivo = F1.testo.replace('| Latte parz. scremato (*) |', '| Latte <img src=x onerror="window.__colpito=1"> <script>window.__colpito=2</script> |').replace('- Bere con regolarità.', '- Bere <a href="javascript:window.__colpito=3">qui</a> <img src=x onerror="window.__colpito=4">.');
await p.click('.pl-diario'); await finche(async () => (await vista(p)) === 'diario', 3000);
await carica(p, cattivo);
await finche(() => p.evaluate(() => /onerror/.test(BiaCruscotto.stato().testo)), 4000);
await pausa(500);
const h = await p.evaluate(() => ({ colpito: window.__colpito || 0, gestori: document.querySelectorAll('#diario [onerror], #diario script, #diario a[href^="javascript"]').length, testo: document.querySelector('.dz-pasto td').textContent }));
verifica(h.colpito === 0 && h.gestori === 0 && /onerror/.test(h.testo), 'codice nascosto nel file non viene eseguito: resta testo', h);
await carica(p, F1.testo);
await finche(() => G.file().get(PERCORSO) === F1.testo, 10000); await attendiOk(p);

console.log('H2. La copia su GitHub si può escludere');
const copia = async v => { await p.click('#indietro'); await finche(async () => (await vista(p)) === 'bacheca', 3000); await imp(() => p.selectOption('#copia-diario', v)); await p.click('.pl-diario'); await finche(async () => (await vista(p)) === 'diario', 4000); };
await copia('no');
const commitPrima = G.commitFatti;
await carica(p, F2.testo);
await finche(() => p.evaluate(n => BiaCruscotto.modello.giorni.length === n, F2.attesi.length), 4000);
await pausa(4500); await p.click('#stato'); await pausa(1200);
verifica(await p.evaluate(() => BiaCruscotto.modello.giorni.length) === F2.attesi.length && G.file().get(PERCORSO) === F1.testo && G.commitFatti === commitPrima && await p.evaluate(() => BiaWrite.stato()) === 'ok', 'con «solo su questo dispositivo» il diario si legge qui e nel repository non viene scritto nulla');
G.daFuori(f => f.scrivi(PERCORSO, cattivo), 'altro diario nel repository');
await p.click('#stato'); await pausa(1500);
verifica(await p.evaluate(() => BiaCruscotto.modello.giorni.length) === F2.attesi.length && !(await p.evaluate(() => /onerror/.test(BiaCruscotto.stato().testo))), 'e nulla viene ricevuto dal repository');
await copia('si');
await finche(() => G.file().get(PERCORSO) === F2.testo, 10000);
verifica(G.file().get(PERCORSO) === F2.testo, 'rimessa la copia, ciò che è stato letto qui sale');
await carica(p, F1.testo); await finche(() => G.file().get(PERCORSO) === F1.testo, 10000);

console.log('I. Di notte, e a stampa');
await imp2('notte');
async function imp2(tema) { await p.click('#indietro'); await finche(async () => (await vista(p)) === 'bacheca', 3000); await imp(() => p.selectOption('#tema', tema)); await p.click('.pl-diario'); await finche(async () => (await vista(p)) === 'diario', 4000); await pausa(200); }
const lum = c => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
const nt = await p.evaluate(() => ({ foglio: getComputedStyle(document.querySelector('.dz-foglio')).backgroundColor, testo: getComputedStyle(document.querySelector('.dz-tessera .v')).color, barra: getComputedStyle(document.querySelector('[data-grafico="kcal"] .ba')).fill }));
verifica(lum(nt.foglio) < 0.2 && lum(nt.testo) > 0.7 && nt.barra === 'rgb(57, 135, 229)', 'in modalità notturna fogli scuri, testo chiaro e colori dei dati scelti per il fondo scuro', nt);
if (FOTO) { await p.mouse.move(5, 5); await pausa(500); await p.screenshot({ path: 'diario-notte.png' }); }
await p.emulateMedia({ media: 'print' });
const st = await p.evaluate(() => ({ barra: getComputedStyle(document.querySelector('#barra')).display, tasto: getComputedStyle(document.querySelector('#diario [data-a="aggiorna"]')).display, cockpit: getComputedStyle(document.querySelector('#diario')).display }));
verifica(st.barra === 'none' && st.tasto === 'none' && st.cockpit !== 'none', 'si può stampare: restano i fogli, spariscono i comandi', st);
await p.emulateMedia({ media: 'screen' });
await imp2('giorno');

verifica(errori.length === 0, 'nessun errore nella pagina', errori);
const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
