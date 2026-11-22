/* Collaudo 3 — impronta o volto (autenticatore virtuale, con e senza PRF), trascinamento sulla bacheca. */
import { chromium, servi, GitHubFinto, pausa, finche, verifica, esito, RADICE, AVVIO, attendiOk, collega , piatta } from './lib.mjs';

const srv = await servi(RADICE, 8767);
const URL_ = 'http://localhost:8767/';
const br = await chromium.launch(AVVIO);
const G = new GitHubFinto();

async function conAutenticatore(prf) {
  const ctx = await br.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: 'block' }); await piatta(ctx);
  await G.monta(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  ERRORE PAGINA', e.message));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: prf } });
  await p.goto(URL_);
  return { ctx, p };
}
async function pinEImpronta(p, chiave) {
  await collega(p, 'biawrite-note', chiave, { pin: true });
  await p.click('#finestra button[value="ok"]');
  await p.fill('#finestra-campo', 'segreto9'); await p.keyboard.press('Enter'); await pausa(200);
  await p.fill('#finestra-campo', 'segreto9'); await p.keyboard.press('Enter'); await pausa(1200);
  const h = await p.textContent('#finestra h2').catch(() => '');
  if (h.includes('impronta')) await p.click('#finestra button[value="ok"]');
  await pausa(1200);
  return h;
}

console.log('J. Impronta o volto con un autenticatore che protegge la chiave (PRF)');
{
  const CH = G.chiave('github_pat_impronta');
  const { ctx, p } = await conAutenticatore(true);
  const h = await pinEImpronta(p, CH);
  verifica(h.includes('impronta'), 'propone impronta o volto', h);
  const S = JSON.parse(await p.evaluate(() => localStorage.getItem('biawrite.impostazioni')));
  verifica(S.lock && S.lock.bio && S.lock.bio.busta && !JSON.stringify(S).includes(CH), 'la chiave è cifrata anche per l\'impronta, mai in chiaro');
  await attendiOk(p);
  await p.click('#nuova'); await p.keyboard.type('Nota riservata'); await pausa(4500);
  await p.reload();
  await pausa(1800);
  verifica(!(await p.isVisible('#blocco')), 'alla riapertura basta il riconoscimento');
  verifica(await attendiOk(p) === 'ok', 'e la chiave decifrata con l\'impronta funziona');
  await p.click('.nota'); await p.click('#carta'); await p.keyboard.type(' Dopo l\'impronta.'); await pausa(4500);
  verifica([...G.note().values()].some(t => t.includes('Dopo l\'impronta.')), 'le modifiche salgono su GitHub');
  await ctx.close();
}

console.log('K. Autenticatore senza PRF: l\'impronta non protegge la chiave, resta il PIN');
{
  const CH = G.chiave('github_pat_senza_prf');
  const { ctx, p } = await conAutenticatore(false);
  await pinEImpronta(p, CH);
  const testi = await p.$$eval('.avviso', a => a.map(x => x.textContent).join(' | '));
  verifica(testi.includes('non sa proteggere la chiave con l\'impronta'), 'spiega perché l\'impronta non si attiva', testi);
  const S = JSON.parse(await p.evaluate(() => localStorage.getItem('biawrite.impostazioni')));
  verifica(S.lock && !S.lock.bio, 'resta solo il PIN');
  await p.reload(); await pausa(500);
  verifica(await p.isVisible('#blocco') && !(await p.isVisible('#biometria')), 'alla riapertura chiede il PIN, senza il tasto dell\'impronta');
  await ctx.close();
}

console.log('L. Trascinare file sulla bacheca');
{
  const ctx = await br.newContext({ viewport: { width: 1000, height: 760 }, serviceWorkers: 'block' }); await piatta(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  ERRORE PAGINA', e.message));
  await p.goto(URL_);
  await p.click('#solo-locale');
  await p.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['# Trascinata\n\ntesto\n'], 'Trascinata.md', { type: 'text/markdown', lastModified: Date.UTC(2017, 5, 1) }));
    dt.items.add(new File(['semplice'], 'Semplice.txt', { type: 'text/plain' }));
    const b = document.querySelector('#bacheca');
    b.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.__evid = b.classList.contains('trascina');
    b.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  verifica(await p.evaluate(() => window.__evid), 'la bacheca si evidenzia mentre si trascina');
  await p.waitForSelector('#finestra[open]');
  verifica((await p.textContent('#finestra')).includes('Pronte: 2 note'), 'i file trascinati vanno nell\'importazione');
  await p.click('#finestra button[value="ok"]');
  await pausa(400);
  verifica(await p.locator('.nota').count() === 2 && !(await p.evaluate(() => document.querySelector('#bacheca').classList.contains('trascina'))), 'importati, evidenziazione tolta');
  await ctx.close();
}

const k = esito();
await br.close(); srv.close();
process.exit(k ? 1 : 0);
