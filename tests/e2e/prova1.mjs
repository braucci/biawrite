/* Collaudo 1 — collegamento a GitHub, scrittura, due dispositivi, conflitti, chiave revocata. */
import { chromium, servi, GitHubFinto, pausa, finche, verifica, esito, RADICE, AVVIO, dispositivo, stato, attendiOk, collega, infondo } from './lib.mjs';

const srv = await servi(RADICE, 8765);
const URL_ = 'http://localhost:8765/';
const br = await chromium.launch(AVVIO);
const G = new GitHubFinto();
const BUONA = G.chiave('github_pat_A'), BUONA_B = G.chiave('github_pat_B');
const CIECA = G.chiave('github_pat_cieca', { repo: false }), LETTRICE = G.chiave('github_pat_lettrice', { scrive: false });
const note = () => [...G.note()].map(([p, t]) => p + ' ⟶ ' + JSON.stringify(t.slice(0, 80)));

console.log('1. Primo avvio');
const A = await dispositivo(br, G, URL_, 'A');
verifica(await A.p.isVisible('#benvenuto'), 'schermata di benvenuto');
const hrefRepo = await A.p.getAttribute('#link-repo', 'href'), hrefChiave = await A.p.getAttribute('#link-chiave', 'href');
verifica(hrefRepo.startsWith('https://github.com/new?name=biawrite-note&visibility=private'), 'link al repository già privato', hrefRepo);
verifica(/^https:\/\/github\.com\/settings\/personal-access-tokens\/new\?name=BiaWrite%20/.test(hrefChiave) && hrefChiave.includes('expires_in=none') && hrefChiave.includes('contents=write'), 'link alla chiave precompilato', hrefChiave);
verifica(await A.p.inputValue('#campo-repo') === 'biawrite-note', 'nome del repository proposto');

console.log('2. Errori di collegamento, spiegati');
const prova = async (repo, k) => { await A.p.fill('#campo-repo', repo); await A.p.fill('#campo-chiave', k); await A.p.click('#collega'); await pausa(700); return A.p.textContent('#errore-collega'); };
verifica((await prova('biawrite-note', 'sbagliata')).includes('non riconosce la chiave'), 'chiave sbagliata');
verifica((await prova('biawrite-note', CIECA)).includes('non esiste, oppure la chiave non può vederlo'), 'chiave che non vede il repository');
G.privato = false;
verifica((await prova('biawrite-note', BUONA)).includes('è pubblico'), 'repository pubblico rifiutato');
G.privato = true;
verifica((await prova('biawrite-note', LETTRICE)).includes('leggere ma non scrivere'), 'chiave di sola lettura');
verifica(G.ref === null, 'nel frattempo il repository non è stato toccato');

console.log('3. Collegamento');
await collega(A.p, 'biawrite-note', BUONA);
verifica(await attendiOk(A.p) === 'ok', 'stato «Su GitHub»', await stato(A.p));
verifica(G.file().has('note/.biawrite.json'), 'repository vuoto preparato con la cartella delle note');
const imp = await A.p.evaluate(() => JSON.parse(localStorage.getItem('biawrite.impostazioni')));
verifica(imp.repo === 'braucci/biawrite-note' && imp.token === BUONA, 'proprietario ricavato dalla chiave', imp.repo);

console.log('4. Nota al volo: basta scriverla');
await A.p.click('#nuova');
await A.p.keyboard.type('Idea per il blog');
await A.p.keyboard.press('Enter');
await A.p.keyboard.type('Un testo con ');
await A.p.keyboard.press('Control+b'); await A.p.keyboard.type('grassetto'); await A.p.keyboard.press('Control+b');
await A.p.keyboard.type(' e ');
await A.p.keyboard.press('Control+i'); await A.p.keyboard.type('corsivo'); await A.p.keyboard.press('Control+i');
await A.p.keyboard.type('.');
await pausa(4500);
const n1 = G.note();
verifica(n1.size === 1 && n1.get('note/Idea per il blog.md') === 'Idea per il blog\n\nUn testo con **grassetto** e *corsivo*.\n', 'file Markdown nel repository, senza alcun «salva»', note());
const ix = G.indice();
verifica(ix && ix.note['Idea per il blog.md'] && ix.note['Idea per il blog.md'].auto === true && ix.note['Idea per il blog.md'].colore, 'colore e titolo automatico nell\'indice', ix);
const commitScrittura = G.commitFatti;

console.log('5. Scrittura lunga: pochi commit');
for (let i = 0; i < 6; i++) { await A.p.keyboard.press('Enter'); await A.p.keyboard.type('Paragrafo ' + i + ' scritto con calma, parola dopo parola.', { delay: 25 }); }
await pausa(4500);
verifica(G.commitFatti - commitScrittura <= 4, 'una scrittura di molti secondi produce pochi commit', G.commitFatti - commitScrittura);
verifica(G.note().get('note/Idea per il blog.md').includes('Paragrafo 5 scritto'), 'il testo è arrivato tutto');

console.log('6. Titolo esplicito: il file cambia nome in un solo commit');
const c0 = G.commitFatti;
await A.p.fill('#titolo', 'Bozza: articolo/novembre');
await pausa(4500);
verifica([...G.note().keys()].join() === 'note/Bozza articolo novembre.md', 'rinominato, nessun doppione', [...G.note().keys()]);
verifica(G.commitFatti - c0 === 1 && G.messaggi()[0] === 'BiaWrite: rinomina «Bozza articolo novembre»', 'un commit con un messaggio leggibile', G.messaggi().slice(0, 2));
verifica(!G.indice().note['Idea per il blog.md'] && G.indice().note['Bozza articolo novembre.md'].auto === false, 'indice aggiornato');

console.log('7. Copia formattata');
await A.p.click('#copia');
await pausa(300);
const ricco = await A.p.evaluate(async () => { const it = await navigator.clipboard.read(); return await (await it[0].getType('text/html')).text(); });
verifica(/<strong>grassetto<\/strong>/.test(ricco) && /<em>corsivo<\/em>/.test(ricco), 'testo formattato negli appunti');
await A.p.click('#indietro');
await pausa(300);
verifica(await A.p.locator('.nota').count() === 1, 'un foglietto in bacheca');

console.log('8. Secondo dispositivo');
const B = await dispositivo(br, G, URL_, 'B', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await collega(B.p, 'braucci/biawrite-note', BUONA_B, { tocco: true });
await attendiOk(B.p);
verifica(await B.p.locator('.nota').count() === 1, 'B vede la nota di A');
await B.p.tap('.nota');
await pausa(300);
verifica(await B.p.inputValue('#titolo') === 'Bozza articolo novembre', 'B apre la nota col suo titolo');
await infondo(B.p);
await B.p.keyboard.type(' Aggiunta dal telefono.');
await pausa(4500);
verifica(G.note().get('note/Bozza articolo novembre.md').includes('Aggiunta dal telefono.'), 'la modifica di B arriva nel repository');

console.log('9. A riceve la modifica');
await A.p.click('#stato');
await pausa(1200);
verifica((await A.p.evaluate(() => [...BiaWrite.note.values()][0].content)).includes('Aggiunta dal telefono.'), 'A ha il testo aggiornato');

console.log('10. Conflitto: stessa nota modificata su due dispositivi');
await B.p.keyboard.type(' Versione B.');
await pausa(4500);
await A.p.click('.nota');
await infondo(A.p);
await A.p.keyboard.type(' Versione A.');
await pausa(5000);
const tutte = [...G.note()];
const orig = tutte.find(([p]) => !p.includes('altra versione')), copia = tutte.find(([p]) => p.includes('altra versione'));
verifica(tutte.length === 2 && copia, 'la versione dell\'altro dispositivo è conservata in una copia', note());
verifica(orig && orig[1].includes('Versione A.') && !orig[1].includes('Versione B.') && copia && copia[1].includes('Versione B.'), 'nessuna delle due versioni è persa');
await A.p.click('#indietro');
await pausa(2000);
verifica(await A.p.locator('.nota').count() === 2, 'A vede anche la copia');

console.log('11. Colore');
await A.p.click('.nota[data-colore="grigio"] .altro');
await A.p.click('#menu .campione[data-colore="verde"]');
await pausa(4500);
verifica(Object.values(G.indice().note).some(x => x.colore === 'verde'), 'colore nell\'indice');
await B.p.goBack(); await pausa(300);
await B.p.tap('#stato'); await pausa(1500);
verifica(await B.p.locator('.nota[data-colore="verde"]').count() === 1, 'B vede il colore cambiato');

console.log('12. Eliminazione');
await A.p.click('.nota[data-colore="verde"] .altro');
await A.p.click('#menu .voce.rosso');
await A.p.click('#finestra button[value="ok"]');
await pausa(4500);
verifica(G.note().size === 1, 'file tolto dal repository', note());
await B.p.tap('#stato'); await pausa(1500);
verifica(await B.p.locator('.nota').count() === 1, 'sparisce anche da B');

console.log('13. Cambiamenti fatti sul sito di GitHub');
G.daFuori(f => { f.sposta('note/Bozza articolo novembre.md', 'note/Articolo di novembre.md'); f.scrivi('note/Caricata dal sito.md', '# Dal sito\n\nUn file caricato a mano.\n'); f.scrivi('README.md', 'non è una nota'); });
await A.p.click('#stato'); await pausa(1500);
const nomiA = await A.p.evaluate(() => [...BiaWrite.note.values()].map(n => n.name).sort());
verifica(JSON.stringify(nomiA) === JSON.stringify(['Articolo di novembre.md', 'Caricata dal sito.md']), 'rinomina seguita, file nuovo arrivato, il resto del repository ignorato', nomiA);
verifica(await A.p.locator('.nota').count() === 2, 'due foglietti');

console.log('14. Chiave revocata');
G.revoca(BUONA);
await A.p.click('.nota >> nth=0');
await A.p.click('#carta');
await A.p.keyboard.type('Scritto con la chiave revocata. ');
await pausa(4500);
verifica(await stato(A.p) === 'attesa' && (await A.p.textContent('#stato span')) === 'Salvato qui', 'la scrittura continua, stato «Salvato qui»', await stato(A.p));
verifica((await A.p.getAttribute('#stato', 'title')).includes('non accetta più la chiave'), 'il motivo è spiegato');
await A.p.click('#stato');
await A.p.waitForSelector('#finestra-campo');
verifica((await A.p.textContent('#finestra h2')) === 'Nuova chiave', 'toccando lo stato si inserisce una chiave nuova');
const NUOVA = G.chiave('github_pat_A2');
await A.p.fill('#finestra-campo', NUOVA);
await A.p.click('#finestra button[value="ok"]');
await pausa(2500);
verifica(await attendiOk(A.p) === 'ok' && [...G.note().values()].some(t => t.includes('Scritto con la chiave revocata.')), 'con la chiave nuova le modifiche salgono');

console.log('15. Nota nuova lasciata vuota');
await A.p.click('#indietro'); await pausa(300);
const c1 = G.commitFatti;
await A.p.click('#nuova'); await A.p.click('#indietro'); await pausa(4000);
verifica(await A.p.locator('.nota').count() === 2 && G.commitFatti === c1, 'nessuna traccia, nessun commit');

console.log('16. Nota in testo semplice');
await A.p.click('#impostazioni');
await A.p.selectOption('#formato', 'txt');
await A.p.click('#pannello [data-a="chiudi"]');
await A.p.click('#nuova');
verifica(!(await A.p.isVisible('#strumenti')), 'niente barra di formattazione per i .txt');
await A.p.keyboard.type('Lista della spesa\n- pane\n- **latte**');
await pausa(4500);
verifica(G.note().get('note/Lista della spesa.txt') === 'Lista della spesa\n- pane\n- **latte**', 'file .txt scritto tale e quale', note());
await A.p.click('#indietro');

console.log('17. Nomi uguali');
await A.p.evaluate(() => { const s = JSON.parse(localStorage.getItem('biawrite.impostazioni')); s.formato = 'md'; localStorage.setItem('biawrite.impostazioni', JSON.stringify(s)); });
await A.p.reload(); await attendiOk(A.p);
await A.p.click('#nuova'); await A.p.fill('#titolo', 'Caricata dal sito'); await A.p.click('#carta'); await A.p.keyboard.type('omonima');
await pausa(4500);
verifica(G.note().has('note/Caricata dal sito (2).md') && G.note().get('note/Caricata dal sito.md').includes('Dal sito'), 'una nota omonima non sovrascrive l\'altra', note());
await A.p.click('#indietro');

console.log('18. Repository diventato pubblico');
G.privato = false;
await A.p.reload(); await pausa(1500);
await A.p.click('#nuova'); await A.p.keyboard.type('Non deve partire'); await pausa(4000);
verifica(![...G.note().values()].some(t => t.includes('Non deve partire')), 'BiaWrite smette di scrivere');
verifica((await A.p.getAttribute('#stato', 'title')).includes('è diventato pubblico'), 'e dice perché');
G.privato = true;

console.log('\nRichieste a GitHub: ' + G.richieste.length + ', commit: ' + G.commitFatti);
const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
