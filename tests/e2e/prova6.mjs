/* Collaudo 6 — spazio fra i capoversi: cambia l'aspetto, non il testo. */
import { chromium, servi, pausa, verifica, esito, RADICE, AVVIO , piatta } from './lib.mjs';

const srv = await servi(RADICE, 8770);
const br = await chromium.launch(AVVIO);
const FOTO = !!process.env.FOTO;
const ctx = await br.newContext({ viewport: { width: 900, height: 620 }, serviceWorkers: 'block' }); await piatta(ctx);
const p = await ctx.newPage();
p.on('pageerror', e => console.log('  ERRORE PAGINA', e.message));
await p.goto('http://localhost:8770/');
await p.click('#solo-locale');

console.log('Z. Spazio fra i capoversi');
await p.click('#nuova');
await p.fill('#titolo', 'Capoversi');
await p.click('#carta');
await p.keyboard.type('Come se l\'ultimo atto di un\'esistenza dovesse necessariamente contenere la spiegazione di tutti quelli precedenti.');
await p.keyboard.press('Enter');
await p.keyboard.type('Ma non è così. E forse bisognerebbe cominciare proprio da questa semplice considerazione.');
await p.keyboard.press('Enter');
await p.keyboard.type('Ci sono alcuni fatti. La Procura aveva chiesto una misura cautelare.');
await p.keyboard.press('Enter');
await p.keyboard.type('Una poesia, riga uno,');
await p.keyboard.press('Shift+Enter');
await p.keyboard.type('riga due.');
await pausa(600);
const contenuto = await p.evaluate(() => [...BiaWrite.note.values()][0].content);
verifica(contenuto === 'Come se l\'ultimo atto di un\'esistenza dovesse necessariamente contenere la spiegazione di tutti quelli precedenti.\n\nMa non è così. E forse bisognerebbe cominciare proprio da questa semplice considerazione.\n\nCi sono alcuni fatti. La Procura aveva chiesto una misura cautelare.\n\nUna poesia, riga uno,  \nriga due.\n',
  'ogni Invio resta un capoverso; Maiuscolo+Invio va a capo nello stesso capoverso', contenuto);
const misura = () => p.evaluate(() => { const [a, b] = document.querySelectorAll('#carta p'); return { stacco: Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom), rientro: getComputedStyle(b).textIndent }; });
const riga = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#carta p')).lineHeight));
const m0 = await misura();
verifica(m0.stacco > 0 && m0.stacco < riga * 0.35, 'di serie i capoversi sono appena staccati (meno di un terzo di riga)', { ...m0, riga });
const scegli = async v => { await p.click('#indietro'); await p.click('#impostazioni'); await p.selectOption('#spazio', v); await p.click('#pannello [data-a="chiudi"]'); await p.click('.nota'); await pausa(200); };
await scegli('nessuno');
const m1 = await misura();
verifica(m1.stacco === 0 && m1.rientro === '0px', '«come a macchina»: nessuno spazio', m1);
if (FOTO) await p.screenshot({ path: 'capoversi-nessuno.png' });
await scegli('rientro');
const m2 = await misura();
verifica(m2.stacco === 0 && parseFloat(m2.rientro) > 20, '«come nei libri»: niente spazio, rientro della prima riga', m2);
if (FOTO) await p.screenshot({ path: 'capoversi-rientro.png' });
await scegli('ampio');
const m3 = await misura();
verifica(m3.stacco > riga * 0.4, '«come in un blog»: lo spazio ampio di prima', { ...m3, riga });
await scegli('stretto');
if (FOTO) await p.screenshot({ path: 'capoversi-stretto.png' });
await p.reload(); await pausa(400);
await p.click('.nota');
verifica((await misura()).stacco === m0.stacco, 'la scelta resta dopo la riapertura');
verifica(await p.evaluate(() => [...BiaWrite.note.values()][0].content) === contenuto, 'il testo non è cambiato');

const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
