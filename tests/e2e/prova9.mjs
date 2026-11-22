/* Collaudo 9 — l'aspetto nuovo: plancia, meteo, cartelle piccole, formati dei foglietti, stile «terminale».
 * Il servizio meteo è finto (meteoFinto in lib.mjs): nessuna richiesta esce davvero. */
import { chromium, servi, pausa, finche, verifica, esito, RADICE, AVVIO, GitHubFinto, dispositivo, collega, attendiOk, meteoFinto, pronta } from './lib.mjs';
import fs from 'fs'; import path from 'path';

const PORTA = 8773, URL_ = 'http://localhost:' + PORTA + '/';
const srv = await servi(RADICE, PORTA);
const br = await chromium.launch(AVVIO);
const FOTO = !!process.env.FOTO;
const G = new GitHubFinto();
const BUONA = G.chiave('github_pat_nove');
const g = n => new Date(Date.now() - n * 86400000).toISOString();
const LUNGO = ('Una frase abbastanza lunga da riempire la riga e andare a capo più volte, come in un appunto vero. ').repeat(9);
const SEME = [
  ['Corta.md', 'Telefonare al tipografo', 'rosa', 1, false],
  ['Media.md', '# Riunione\n\nGiovedì alle 15, aula 12.\n\nPortare le griglie di valutazione e il verbale.', 'azzurro', 2, true],
  ['Lunga.md', '# Idee\n\n' + LUNGO, 'giallo', 3, false],
  ['listato.txt', Array.from({ length: 14 }, (x, i) => 'riga ' + (i + 1) + '  =  ' + (i * 1.5).toFixed(2)).join('\n'), 'carta', 4, false],
  ['breve.txt', 'git status\ngit add -A\ngit commit -m "note"\ngit push', 'grigio', 5, false],
  ['Elenco.md', '- pane\n- latte\n- caffè\n- limoni\n- carta per la stampante', 'verde', 6, false],
  ['Ottobre.md', 'Una nota di un mese fa, né corta né lunga: giusto qualche riga per riempire un foglietto.\n\nSeconda parte.', 'lilla', 40, false],
  ['Agosto.md', 'Estate', 'arancio', 100, false],
];
G.daFuori(f => { const idx = {}; for (const [n, t, c, gg, fx] of SEME) { f.scrivi('note/' + n, t + '\n'); idx[n] = Object.assign({ colore: c, auto: !/^#/.test(t) && !/\.txt$/.test(n), mod: g(gg), creata: g(gg) }, fx ? { fissata: true } : {}); } f.scrivi('note/.biawrite.json', JSON.stringify({ formato: 1, note: idx })); }, 'seme');

const errori = [];
const A = await dispositivo(br, G, URL_, 'A', { cartelle: true, viewport: { width: 1240, height: 900 } });
const M = await meteoFinto(A.ctx);
const p = A.p;
p.on('pageerror', e => errori.push(e.message));
await collega(p, G.repo, BUONA);
await attendiOk(p, 20000);
await finche(() => p.evaluate(n => BiaWrite.note.size === n, SEME.length));
const luogo = () => p.textContent('#luogo');
const imp = async fn => { await p.click('#impostazioni'); await p.waitForSelector('#pannello[open]'); await fn(); await p.click('#pannello [data-a="chiudi"]'); await pausa(150); };
const lum = c => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };

console.log('A. La plancia');
const oggi = new Date();
const a = await p.evaluate(() => { const e = document.querySelector('#plancia'); return { vis: !e.hidden && e.getBoundingClientRect().height > 40, data: e.querySelector('.pl-data').innerText.replace(/\s+/g, ' '), pezzi: [...e.children].map(x => x.className), sopra: e.getBoundingClientRect().bottom <= document.querySelector('#note').getBoundingClientRect().top + 1 }; });
verifica(a.vis && a.sopra && JSON.stringify(a.pezzi) === JSON.stringify(['pl-data', 'pl-meteo', 'pl-diario']), 'in testa alla bacheca: data, meteo, diario', a);
verifica(a.data.includes(String(oggi.getDate())) && a.data.includes(oggi.toLocaleDateString('it-IT', { weekday: 'long' })) && a.data.includes(oggi.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })) && a.data.includes('8 note · 1 fissata'), 'la data di oggi e il conto delle note', a.data);
await p.click('.cartella:not(.speciale) >> nth=0'); await finche(async () => (await luogo()) !== '', 3000);
verifica(await p.evaluate(() => document.querySelector('#plancia').hidden), 'dentro una cartella la plancia lascia il posto alle note');
await p.click('#indietro'); await finche(async () => (await luogo()) === '', 3000);
await p.fill('#cerca', 'riunione'); await pausa(300);
verifica(await p.evaluate(() => document.querySelector('#plancia').hidden) && await p.locator('#note .nota').count() === 1, 'e così durante la ricerca');
await p.fill('#cerca', ''); await pausa(300);

console.log('B. Il meteo');
const invito = await p.evaluate(() => ({ t: document.querySelector('.pl-meteo').innerText.replace(/\s+/g, ' '), tasto: !!document.querySelector('.pl-meteo button[data-a="meteo-luogo"]') }));
verifica(invito.tasto && /scegli la località/.test(invito.t) && M.previsioni === 0 && M.ricerche === 0, 'senza una località il meteo è spento: invita a sceglierla e non chiede nulla a nessuno', { invito, richieste: M.previsioni });
await p.click('.pl-meteo [data-a="meteo-luogo"]');
await p.waitForSelector('#pannello[open]');
await finche(() => p.evaluate(() => document.activeElement && document.activeElement.id === 'meteo-cerca'), 2000);
verifica(await p.evaluate(() => document.activeElement.id) === 'meteo-cerca', 'il pulsante porta alle impostazioni, sul campo della località');
await p.fill('#meteo-cerca', 'zzz'); await p.click('#meteo-trova');
await finche(async () => /Nessuna località/.test(await p.textContent('#meteo-esiti')), 3000);
verifica(/Nessuna località/.test(await p.textContent('#meteo-esiti')), 'una località che non esiste: lo dice');
await p.fill('#meteo-cerca', 'Napoli'); await p.keyboard.press('Enter');
await finche(async () => (await p.locator('#meteo-esiti .esito').count()) === 2, 3000);
const esiti = await p.locator('#meteo-esiti .esito').allTextContents();
verifica(esiti.length === 2 && /Napoli — .*Campania, Italia/.test(esiti[0]) && /Stati Uniti/.test(esiti[1]), 'la ricerca propone le località con regione e paese, per distinguere gli omonimi', esiti);
await p.click('#meteo-esiti .esito >> nth=0');
await finche(async () => /Napoli/.test(await p.textContent('#meteo-dove')), 2000);
await p.click('#pannello [data-a="chiudi"]');
await finche(() => p.evaluate(() => !!document.querySelector('.pl-meteo .mt-t')), 4000);
const m1 = await p.evaluate(() => { const e = document.querySelector('.pl-meteo .mt'); return { t: e.querySelector('.mt-t').textContent, desc: e.querySelector('.mt-desc').textContent, luogo: e.querySelector('.mt-luogo').textContent, fatti: [...e.querySelectorAll('.mt-fatti li')].map(x => x.textContent.trim()), ore: [...e.querySelectorAll('.mt-ore li')].map(x => [x.querySelector('time').textContent, x.querySelector('b').textContent, !!x.querySelector('svg')]),
  icone: e.querySelectorAll('svg.mt-i').length, grande: e.querySelector('svg.mt-i.grande').getBoundingClientRect().width, etichetta: e.getAttribute('aria-label'), fonte: e.querySelector('a.mt-fonte')?.href, larga: e.scrollWidth <= e.clientWidth + 1 }; });
verifica(m1.t === '14°' && m1.desc === 'Poco nuvoloso' && /Napoli/.test(m1.luogo), 'scelta la località: temperatura, tempo che fa, luogo', m1);
verifica(m1.fatti[0] === '9° / 17°' && m1.fatti[1] === '30%' && m1.fatti[2] === '12 km/h' && m1.fatti[3] === 'percepiti 12°', 'minima e massima, probabilità di pioggia, vento, temperatura percepita', m1.fatti);
verifica(m1.ore.length === 5 && m1.ore.every(o => o[2] && /°$/.test(o[1])) && m1.ore[4][0] === 'domani', 'le prossime ore (ogni tre) e domani, ciascuna con la sua icona', m1.ore);
verifica(m1.icone >= 9 && m1.grande >= 40 && m1.larga, 'icone al tratto, grande quella del tempo di adesso; tutto dentro il riquadro', { icone: m1.icone, grande: m1.grande });
verifica(/Napoli: 14°, poco nuvoloso; minima 9°, massima 17°; probabilità di pioggia 30%/.test(m1.etichetta), 'il riquadro si legge anche a voce, per intero', m1.etichetta);
verifica(/^https:\/\/open-meteo\.com\/?$/.test(m1.fonte), 'la fonte dei dati è dichiarata, con il collegamento', m1.fonte);
const u = new URL(M.url.find(x => x.includes('/v1/forecast')));
const chiavi = [...u.searchParams.keys()].sort().join(',');
verifica(u.searchParams.get('latitude') === '40.85' && u.searchParams.get('longitude') === '14.27' && chiavi === 'current,daily,forecast_days,hourly,latitude,longitude,timezone,wind_speed_unit', 'al servizio vanno solo le coordinate della località, arrotondate al centesimo di grado', u.search.slice(0, 120));
const csp = await p.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
verifica(/connect-src 'self' https:\/\/api\.github\.com https:\/\/api\.open-meteo\.com https:\/\/geocoding-api\.open-meteo\.com;/.test(csp), 'la pagina può parlare solo con GitHub e con Open-Meteo', csp.match(/connect-src[^;]*/)[0]);
if (FOTO) { await pausa(400); await p.screenshot({ path: 'aspetto-scrivania.png' }); }
const r1 = M.previsioni;
await p.reload(); await pronta(p); await finche(() => p.evaluate(() => !!document.querySelector('.pl-meteo .mt-t')), 6000);
verifica(M.previsioni === r1 && await p.textContent('.pl-meteo .mt-t') === '14°', 'riaprendo l\'app entro mezz\'ora il meteo viene dalla memoria: nessuna nuova richiesta', { prima: r1, dopo: M.previsioni });
await p.evaluate(() => { const k = 'biawrite.meteo', m = JSON.parse(localStorage.getItem(k)); m.dati.quando -= 2 * 3600000; localStorage.setItem(k, JSON.stringify(m)); });
M.codice = 95; M.t = 21.2;
await p.reload(); await pronta(p); await finche(async () => (await p.textContent('.pl-meteo .mt-t').catch(() => '')) === '21°', 6000);
verifica(await p.textContent('.pl-meteo .mt-t') === '21°' && await p.textContent('.pl-meteo .mt-desc') === 'Temporale' && M.previsioni === r1 + 1, 'passata mezz\'ora lo si richiede: ora dice temporale', await p.textContent('.pl-meteo .mt-desc'));
await p.evaluate(() => { const k = 'biawrite.meteo', m = JSON.parse(localStorage.getItem(k)); m.dati.quando -= 2 * 3600000; localStorage.setItem(k, JSON.stringify(m)); });
M.giu = true;
await p.reload(); await pronta(p); await finche(async () => / · alle \d\d:\d\d/.test(await p.textContent('.pl-meteo .mt-luogo').catch(() => '')), 6000);
verifica(await p.textContent('.pl-meteo .mt-t') === '21°' && / · alle \d\d:\d\d/.test(await p.textContent('.pl-meteo .mt-luogo')), 'senza rete resta l\'ultimo meteo, con l\'ora a cui risale');
await p.evaluate(() => localStorage.removeItem('biawrite.meteo'));
await p.reload(); await pronta(p); await finche(async () => /non raggiungibile/.test(await p.textContent('.pl-meteo').catch(() => '')), 6000);
verifica(/non raggiungibile/.test(await p.textContent('.pl-meteo')) && await p.locator('.pl-meteo [data-a="meteo-riprova"]').count() === 1 && await p.locator('#note .cartella').count() > 0, 'se il servizio non risponde e non c\'è memoria, lo dice e offre di riprovare; il resto dell\'app non ne risente');
M.giu = false; M.codice = 0; M.t = 14.4;
await p.click('.pl-meteo [data-a="meteo-riprova"]');
await finche(async () => (await p.textContent('.pl-meteo .mt-desc').catch(() => '')) === 'Sereno', 4000);
verifica(await p.textContent('.pl-meteo .mt-desc') === 'Sereno', '«Riprova» lo riprende');
const tabella = await p.evaluate(() => { const C = BiaMeteo.CODICI; return { n: Object.keys(C).length, senza: Object.entries(C).filter(([k, v]) => !v[0] || !BiaMeteo.svg(v[1]).includes('<path') && !BiaMeteo.svg(v[1]).includes('<circle')).length, notte: BiaMeteo.icona(0, false) !== BiaMeteo.icona(0, true), ignoto: BiaMeteo.icona(1234, true).includes('<svg') }; });
verifica(tabella.n >= 28 && tabella.senza === 0 && tabella.notte && tabella.ignoto, 'ogni codice del tempo ha una descrizione e un\'icona; di notte la luna al posto del sole', tabella);
const r2 = M.previsioni;
await imp(() => p.click('#meteo-via'));
await finche(() => p.evaluate(() => !!document.querySelector('.pl-meteo [data-a="meteo-luogo"]')), 3000);
await p.reload(); await pronta(p); await pausa(600);
verifica(await p.locator('.pl-meteo [data-a="meteo-luogo"]').count() === 1 && M.previsioni === r2, '«Nessun meteo» lo spegne: non parte più alcuna richiesta');
await imp(async () => { await p.fill('#meteo-cerca', 'Napoli'); await p.click('#meteo-trova'); await p.click('#meteo-esiti .esito >> nth=0'); });
await finche(() => p.evaluate(() => !!document.querySelector('.pl-meteo .mt-t')), 4000);

console.log('C. Le cartelle: piccole, come icone');
const c = await p.evaluate(() => { const cc = [...document.querySelectorAll('#note .cartella')].map(e => { const r = e.getBoundingClientRect(), ic = e.querySelector('.ic').getBoundingClientRect(), b = e.querySelector('b').getBoundingClientRect(); return { m: e.dataset.mese, w: Math.round(r.width), h: Math.round(r.height), ic: [Math.round(ic.width), Math.round(ic.height)], sotto: b.top >= ic.bottom - 1, nome: e.querySelector('b').textContent, conto: e.querySelector('small').textContent, pallini: e.querySelectorAll('.fogli i').length, top: Math.round(r.top), spilla: !!e.querySelector('.spilla') }; });
  return { cc, primo: document.querySelector('#note > :first-child .cartella')?.dataset.mese }; });
verifica(c.cc.every(x => x.ic[0] <= 72 && x.ic[1] <= 60 && x.w <= 140 && x.h <= 130), 'icone piccole (68 × 54), una cella poco più larga', c.cc.map(x => [x.w, x.h]));
verifica(c.cc.every(x => x.sotto && x.nome && /not[ae]/.test(x.conto)), 'il nome sta sotto l\'icona, con il numero delle note');
const novembre = c.cc.find(x => x.m !== 'fissate');
verifica(novembre.pallini >= 1 && novembre.pallini <= 4, 'i colori delle note sono pallini accanto al nome, come le etichette del Finder', novembre);
verifica(c.primo === 'fissate' && c.cc[0].spilla && c.cc[0].nome === 'Fissate' && c.cc[0].conto === '1 nota', 'la prima cartella è «Fissate», con la puntina', c.cc[0]);
const anno = c.cc.filter(x => x.m.startsWith(String(new Date(Date.now() - 86400000).getFullYear())));
verifica(anno.length >= 2 && new Set(anno.map(x => x.top)).size === 1, 'le cartelle di un anno stanno in fila sulla stessa riga', anno.map(x => x.top));

console.log('D. I formati dei foglietti');
await imp(() => p.selectOption('#ordine', 'tutte'));
await finche(async () => (await p.locator('#note .nota').count()) === SEME.length, 3000);
const d = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#note .nota')].map(e => { const r = e.getBoundingClientRect(); return [BiaWrite.note.get(e.dataset.id).name, { f: [...e.classList].filter(x => x.startsWith('f-') || x === 'corto').join(' '), w: Math.round(r.width), h: Math.round(r.height), x: r.left, y: r.top, r: r.right, b: r.bottom, font: getComputedStyle(e.querySelector('.faccia')).fontFamily.split(',')[0].replace(/"/g, '') }]; })));
verifica(d['Corta.md'].f === 'f-striscia' && d['Agosto.md'].f === 'f-striscia' && d['Media.md'].f === 'f-foglietto' && d['Elenco.md'].f === 'f-foglietto' && d['Lunga.md'].f === 'f-scheda' && d['listato.txt'].f === 'f-tabulato' && d['breve.txt'].f === 'f-tabulato corto', 'il formato segue il contenuto: una riga → striscia, poche righe → foglietto, testo lungo → scheda, testo semplice → tabulato', Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.f])));
verifica(d['Corta.md'].h < d['Media.md'].h * 0.6 && d['Lunga.md'].w > d['Media.md'].w * 1.8 && d['listato.txt'].h > d['Media.md'].h * 1.3 && Math.abs(d['Media.md'].w - d['Media.md'].h) < 40, 'striscia bassa, foglietto quasi quadrato, scheda larga il doppio, tabulato più alto', Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [v.w, v.h]])));
verifica(d['Media.md'].font === 'Kalam' && d['listato.txt'].font === 'IBM Plex Mono' && d['Lunga.md'].font !== 'Kalam' && d['Lunga.md'].font !== 'IBM Plex Mono', 'foglietto scritto a mano, scheda in carattere da libro, tabulato a spaziatura fissa', Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.font])));
const v = Object.values(d), urti = [];
for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i].x < v[j].r - 14 && v[j].x < v[i].r - 14 && v[i].y < v[j].b - 14 && v[j].y < v[i].b - 14) urti.push([i, j]);
verifica(urti.length === 0, 'formati diversi si incastrano senza sovrapporsi', urti);
const fisse = await p.evaluate(() => ({ prima: [...document.querySelectorAll('#note .griglia.fissate .nota')].map(e => BiaWrite.note.get(e.dataset.id).name), altre: document.querySelectorAll('#note .griglia:not(.fissate) .nota.fissata').length }));
verifica(JSON.stringify(fisse.prima) === JSON.stringify(['Media.md']) && fisse.altre === 0, 'nella bacheca unica le note fissate hanno una fila loro, in testa', fisse);
if (FOTO) { await pausa(900); await p.screenshot({ path: 'aspetto-formati.png' }); }
await p.click('#note .nota.f-scheda'); await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
verifica(await p.inputValue('#titolo') === 'Lunga', 'ogni formato si apre come sempre');
await p.click('#indietro'); await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'bacheca');
await imp(() => p.selectOption('#ordine', 'mesi'));

console.log('E. Lo stile «terminale»');
await p.emulateMedia({ colorScheme: 'light' });
const stile = () => p.evaluate(() => { const h = document.documentElement, cs = getComputedStyle(h), ca = document.querySelector('#note .cartella'), n = document.querySelector('#note .nota');
  return { stile: h.dataset.stile, notte: h.classList.contains('notte'), fondo: getComputedStyle(document.querySelector('#app')).backgroundColor, testo: getComputedStyle(document.body).color, font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, ''),
    marchio: getComputedStyle(document.querySelector('#marchio'), '::after').content, cartella: ca ? { dir: getComputedStyle(ca).flexDirection, ic: getComputedStyle(ca.querySelector('.ic')).display, prima: getComputedStyle(ca, '::before').content, h: Math.round(ca.getBoundingClientRect().height) } : null,
    nota: n ? { rot: getComputedStyle(n).rotate, filtro: getComputedStyle(n).filter, font: getComputedStyle(n.querySelector('.faccia')).fontFamily.split(',')[0].replace(/"/g, ''), fondo: getComputedStyle(n.querySelector('.faccia')).backgroundColor } : null,
    plancia: document.querySelector('#plancia > *') ? getComputedStyle(document.querySelector('#plancia > *'), '::before').content : '', meta: document.querySelector('meta[name="theme-color"]').content, tavolo: cs.getPropertyValue('--tavolo').trim() }; });
const s0 = await stile();
verifica(s0.stile === 'scrivania' && !s0.notte && s0.font !== 'IBM Plex Mono' && s0.cartella.dir === 'column', 'di serie lo stile è «scrivania»', s0);
await imp(() => p.selectOption('#stile', 'terminale'));
const s1 = await stile();
verifica(s1.stile === 'terminale' && s1.font === 'IBM Plex Mono', 'scelto «terminale», tutta l\'app passa alla spaziatura fissa', s1);
verifica(s1.notte && lum(s1.fondo) < 0.1 && lum(s1.testo) > 0.6, 'il terminale nasce scuro, anche se il dispositivo è in tema chiaro', s1);
verifica(s1.marchio === '":~$"' && /oggi/.test(s1.plancia), 'il nome dell\'app diventa una riga di comando; i riquadri della plancia hanno la loro etichetta', s1);
verifica(s1.cartella.dir === 'row' && s1.cartella.ic === 'none' && /drwx/.test(s1.cartella.prima) && s1.cartella.h < 40, 'le cartelle sono righe di un elenco, come da «ls -l»', s1.cartella);
verifica(s1.meta === s1.tavolo, 'anche la barra del telefono prende il colore del terminale');
await p.click('.cartella:not(.speciale) >> nth=0'); await finche(async () => (await luogo()) !== '', 3000); await pausa(300);
const s2 = await stile();
verifica(s2.nota.rot === '0deg' && s2.nota.filtro === 'none' && s2.nota.font === 'IBM Plex Mono' && lum(s2.nota.fondo) < 0.15, 'le note sono riquadri dritti a spaziatura fissa, senza ombre né pieghe', s2.nota);
const dritti = await p.evaluate(() => ({ puntine: [...document.querySelectorAll('#note .nota .puntina, #note .nota .orecchia')].filter(e => getComputedStyle(e).display !== 'none').length, fissata: getComputedStyle(document.querySelector('#note .nota.fissata footer'), '::before').content, formati: [...new Set([...document.querySelectorAll('#note .nota')].map(e => [...e.classList].find(x => x.startsWith('f-'))))].length }));
verifica(dritti.puntine === 0 && dritti.fissata === '"[fissata]"' && dritti.formati >= 3, 'niente puntine né orecchie: la nota fissata lo dice a parole; i formati restano', dritti);
if (FOTO) { await pausa(700); await p.screenshot({ path: 'aspetto-terminale-cartella.png' }); }
await p.click('#note .nota >> nth=1'); await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'editor');
const ed = await p.evaluate(() => getComputedStyle(document.querySelector(getComputedStyle(document.querySelector('#carta')).display !== 'none' ? '#carta' : '#testo')).fontFamily.split(',')[0].replace(/"/g, ''));
verifica(ed === 'IBM Plex Mono', 'anche l\'editor scrive a spaziatura fissa');
await p.click('#indietro'); await p.waitForFunction(() => document.querySelector('#app').dataset.vista === 'bacheca');
await p.click('#indietro'); await finche(async () => (await luogo()) === '', 3000);
if (FOTO) { await pausa(500); await p.screenshot({ path: 'aspetto-terminale.png' }); }
await p.reload(); await pronta(p);
const subito = await p.evaluate(() => ({ stile: document.documentElement.dataset.stile, notte: document.documentElement.classList.contains('notte') }));
verifica(subito.stile === 'terminale' && subito.notte, 'la scelta resta alla riapertura');
await finche(() => p.evaluate(() => !!document.querySelector('#note .cartella')), 6000);
await imp(() => p.selectOption('#tema', 'giorno'));
const s3 = await stile();
verifica(s3.stile === 'terminale' && !s3.notte && lum(s3.fondo) > 0.8 && lum(s3.testo) < 0.25, 'a richiesta il terminale è chiaro: carta e inchiostro', s3);
if (FOTO) { await pausa(400); await p.screenshot({ path: 'aspetto-terminale-giorno.png' }); }
await imp(async () => { await p.selectOption('#tema', 'auto'); await p.selectOption('#stile', 'scrivania'); });
const s4 = await stile();
verifica(s4.stile === 'scrivania' && !s4.notte && s4.cartella.dir === 'column' && s4.marchio === 'none', 'e si torna alla scrivania quando si vuole', s4);
const codice = fs.readFileSync(path.join(RADICE, 'tema.js'), 'utf8');
verifica(/data-stile/.test(codice) && await p.evaluate(() => { const t = document.querySelector('head script[src="tema.js"]'); return !!t && !t.defer && !t.async; }), 'lo stile è deciso prima che la pagina si disegni (niente lampo dello stile sbagliato)');

console.log('F. Al telefono');
const T = await dispositivo(br, G, URL_, 'T', { cartelle: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await meteoFinto(T.ctx);
T.p.on('pageerror', e => errori.push(e.message));
await T.ctx.addInitScript(() => { const k = 'biawrite.impostazioni', s = JSON.parse(localStorage.getItem(k) || '{}'); if (!s.meteo) { s.meteo = { nome: 'Napoli', lat: 40.85, lon: 14.27 }; localStorage.setItem(k, JSON.stringify(s)); } });
await T.p.reload(); await pronta(T.p);
await collega(T.p, G.repo, BUONA, { tocco: true });
await attendiOk(T.p, 20000);
await finche(() => T.p.evaluate(() => !!document.querySelector('.pl-meteo .mt-t') && document.querySelectorAll('#note .cartella').length > 2), 8000);
const tel = () => T.p.evaluate(() => { const pl = document.querySelector('#plancia'); return { largo: document.documentElement.scrollWidth <= innerWidth && document.querySelector('#bacheca').scrollWidth <= document.querySelector('#bacheca').clientWidth + 1, dentro: [...pl.children].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && e.scrollWidth <= e.clientWidth + 2; }), ore: document.querySelectorAll('.mt-ore li').length, perRiga: (() => { const c = [...document.querySelectorAll('#note .griglia.cartelle:not(.in-testa) .cartella')].map(e => Math.round(e.getBoundingClientRect().top)); return c.filter(x => x === c[0]).length; })() }; });
const t1 = await tel();
verifica(t1.largo && t1.dentro && t1.ore === 5, 'sul telefono la plancia sta nello schermo, meteo compreso', t1);
verifica(t1.perRiga >= 3, 'e le cartelle piccole stanno in tre o più per riga', t1.perRiga);
if (FOTO) { await pausa(500); await T.p.screenshot({ path: 'aspetto-telefono.png' }); }
await T.p.evaluate(() => { const k = 'biawrite.impostazioni', s = JSON.parse(localStorage.getItem(k)); s.stile = 'terminale'; localStorage.setItem(k, JSON.stringify(s)); });
await T.p.reload(); await pronta(T.p);
await finche(() => T.p.evaluate(() => !!document.querySelector('.pl-meteo .mt-t') && document.querySelectorAll('#note .cartella').length > 2), 8000);
const t2 = await tel();
verifica(t2.largo && t2.dentro && await T.p.evaluate(() => document.documentElement.dataset.stile) === 'terminale', 'anche nello stile terminale', t2);
if (FOTO) { await pausa(500); await T.p.screenshot({ path: 'aspetto-telefono-terminale.png' }); }
await T.ctx.close();

verifica(errori.length === 0, 'nessun errore nella pagina', errori);
const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
