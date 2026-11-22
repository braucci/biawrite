/* Strumenti per il collaudo di BiaWrite: server locale, GitHub simulato, verifiche. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
export { chromium } from 'playwright';

/* cartella del progetto e opzioni di avvio del browser */
export const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const AVVIO = process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {};

const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
export function servi(dir, porta) {
  const s = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('no'); return; }
    r.writeHead(200, { 'Content-Type': TIPI[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    r.end(fs.readFileSync(f));
  });
  return new Promise(res => s.listen(porta, '127.0.0.1', () => res(s)));
}

const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const shaBlob = buf => sha1(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf]));

/* ---- GitHub simulato: un repository, un ramo, oggetti git in memoria ----
 * Gli alberi sono conservati «piatti» (percorso completo → sha del blob): basta per l'API usata. */
export class GitHubFinto {
  constructor({ login = 'braucci', nome = 'biawrite-note', privato = true } = {}) {
    this.login = login; this.repo = login + '/' + nome; this.privato = privato;
    this.blob = new Map(); this.alberi = new Map(); this.commit = new Map(); this.ref = null;
    this.chiavi = new Map();          // chiave → { repo: bool, scrive: bool }
    this.richieste = []; this.senzaRete = false; this.commitFatti = 0;
  }
  chiave(nome, { repo = true, scrive = true } = {}) { this.chiavi.set(nome, { repo, scrive }); return nome; }
  revoca(nome) { this.chiavi.delete(nome); }
  metti(buf) { const s = shaBlob(buf); this.blob.set(s, buf); return s; }
  albero(mappa) { const s = sha1(JSON.stringify([...mappa].sort())); this.alberi.set(s, new Map(mappa)); return s; }
  nuovoCommit(tree, parents, message) {
    const s = sha1(tree + parents.join() + message + Math.random());
    this.commit.set(s, { tree, parents, message });
    return s;
  }
  /* stato attuale del ramo: percorso → testo */
  file() {
    if (!this.ref) return new Map();
    const t = this.alberi.get(this.commit.get(this.ref).tree);
    return new Map([...t].map(([p, s]) => [p, this.blob.get(s).toString('utf8')]));
  }
  note() { return new Map([...this.file()].filter(([p]) => p.startsWith('note/') && !p.endsWith('.biawrite.json'))); }
  indice() { const x = this.file().get('note/.biawrite.json'); return x ? JSON.parse(x) : null; }
  messaggi() { const m = []; let c = this.ref; while (c) { const o = this.commit.get(c); m.push(o.message); c = o.parents[0]; } return m; }
  /* un altro programma (o il sito di GitHub) cambia il repository */
  daFuori(fn, message = 'modifica dal sito') {
    const base = this.ref ? new Map(this.alberi.get(this.commit.get(this.ref).tree)) : new Map();
    fn({ scrivi: (p, t) => base.set(p, this.metti(Buffer.from(t))), togli: p => base.delete(p), sposta: (a, b) => { base.set(b, base.get(a)); base.delete(a); } });
    this.ref = this.nuovoCommit(this.albero(base), this.ref ? [this.ref] : [], message);
  }

  async gestisci(route) {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
    const json = (o, st = 200) => route.fulfill({ status: st, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (this.senzaRete) return route.abort('internetdisconnected');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url()), m = req.method(), p = decodeURIComponent(u.pathname);
    this.richieste.push(m + ' ' + p);
    const k = this.chiavi.get((req.headers().authorization || '').replace('Bearer ', ''));
    if (!k) return json({ message: 'Bad credentials' }, 401);
    if (p === '/user') return json({ login: this.login });
    const R = '/repos/' + this.repo;
    if (!p.startsWith(R) || !k.repo) return json({ message: 'Not Found' }, 404);
    const corpo = () => JSON.parse(req.postData() || '{}');
    const vietato = () => json({ message: 'Resource not accessible by personal access token' }, 403);
    const q = p.slice(R.length);
    let mm;
    if (q === '') return json({ full_name: this.repo, private: this.privato, default_branch: 'main', html_url: 'https://github.com/' + this.repo });
    if (q === '/git/ref/heads/main') return this.ref ? json({ object: { sha: this.ref, type: 'commit' } }) : json({ message: 'Git Repository is empty.' }, 409);
    if ((mm = q.match(/^\/git\/commits\/(\w+)$/)) && m === 'GET') {
      const c = this.commit.get(mm[1]); return c ? json({ sha: mm[1], tree: { sha: c.tree } }) : json({ message: 'Not Found' }, 404);
    }
    if ((mm = q.match(/^\/git\/trees\/(\w+)$/)) && m === 'GET') {
      const t = this.alberi.get(mm[1]); if (!t) return json({ message: 'Not Found' }, 404);
      const cartelle = new Set();
      for (const x of t.keys()) { const parti = x.split('/'); for (let i = 1; i < parti.length; i++) cartelle.add(parti.slice(0, i).join('/')); }
      return json({ sha: mm[1], truncated: false, tree: [...[...cartelle].map(c => ({ path: c, type: 'tree', mode: '040000' })), ...[...t].map(([x, s]) => ({ path: x, type: 'blob', mode: '100644', sha: s }))] });
    }
    if ((mm = q.match(/^\/git\/blobs\/(\w+)$/))) {
      const b = this.blob.get(mm[1]); return b ? json({ sha: mm[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n'), size: b.length }) : json({ message: 'Not Found' }, 404);
    }
    if (q === '/git/trees' && m === 'POST') {
      if (!k.scrive) return vietato();
      const c = corpo();
      const base = c.base_tree ? this.alberi.get(c.base_tree) : new Map();
      if (!base) return json({ message: 'base_tree non valido' }, 422);
      const t = new Map(base);
      for (const v of c.tree) {
        if (v.sha === null) { if (!t.has(v.path)) return json({ message: 'GitRPC::BadObjectState' }, 422); t.delete(v.path); }
        else if (v.sha) { if (!this.blob.has(v.sha)) return json({ message: 'Invalid tree info' }, 422); t.set(v.path, v.sha); }
        else t.set(v.path, this.metti(Buffer.from(v.content, 'utf8')));
      }
      return json({ sha: this.albero(t) }, 201);
    }
    if (q === '/git/commits' && m === 'POST') {
      if (!k.scrive) return vietato();
      const c = corpo();
      return json({ sha: this.nuovoCommit(c.tree, c.parents, c.message) }, 201);
    }
    if (q === '/git/refs/heads/main' && m === 'PATCH') {
      if (!k.scrive) return vietato();
      const c = corpo(), nuovo = this.commit.get(c.sha);
      if (!nuovo) return json({ message: 'Object does not exist' }, 422);
      if (!c.force && nuovo.parents[0] !== this.ref) return json({ message: 'Update is not a fast forward' }, 422);
      this.ref = c.sha; this.commitFatti++;
      return json({ object: { sha: c.sha } });
    }
    if ((mm = q.match(/^\/contents\/(.+)$/)) && m === 'PUT') {
      if (!k.scrive) return vietato();
      const c = corpo();
      const base = this.ref ? new Map(this.alberi.get(this.commit.get(this.ref).tree)) : new Map();
      if (base.has(mm[1]) && !c.sha) return json({ message: '"sha" wasn\'t supplied.' }, 422);
      const s = this.metti(Buffer.from(c.content, 'base64'));
      base.set(mm[1], s);
      this.ref = this.nuovoCommit(this.albero(base), this.ref ? [this.ref] : [], c.message); this.commitFatti++;
      return json({ content: { sha: s, path: mm[1] }, commit: { sha: this.ref } }, 201);
    }
    return json({ message: 'non gestito ' + m + ' ' + q }, 400);
  }
  async monta(ctx) { await ctx.route('https://api.github.com/**', r => this.gestisci(r)); }
}

/* ---- piccolo scrittore di archivi zip, per provare l'importazione ---- */
import zlib from 'zlib';
export function creaZip(voci) {          // voci: [{ nome, testo|dati, data: Date, comprimi: bool, utf8: bool }]
  const locali = [], centrali = [];
  let scarto = 0;
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  for (const v of voci) {
    const dati = v.dati || Buffer.from(v.testo, 'utf8');
    const corpo = v.comprimi === false ? dati : zlib.deflateRawSync(dati);
    const metodo = v.comprimi === false ? 0 : 8;
    const nome = Buffer.from(v.nome, v.utf8 === false ? 'latin1' : 'utf8');
    const d = v.data || new Date(2020, 0, 1);
    const ora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const giorno = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const flag = v.utf8 === false ? 0 : 0x800;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(flag, 6); l.writeUInt16LE(metodo, 8);
    l.writeUInt16LE(ora, 10); l.writeUInt16LE(giorno, 12); l.writeUInt32LE(crc(dati), 14); l.writeUInt32LE(corpo.length, 18); l.writeUInt32LE(dati.length, 22);
    l.writeUInt16LE(nome.length, 26); l.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flag, 8); c.writeUInt16LE(metodo, 10);
    c.writeUInt16LE(ora, 12); c.writeUInt16LE(giorno, 14); c.writeUInt32LE(crc(dati), 16); c.writeUInt32LE(corpo.length, 20); c.writeUInt32LE(dati.length, 24);
    c.writeUInt16LE(nome.length, 28); c.writeUInt32LE(scarto, 42);
    locali.push(l, nome, corpo); centrali.push(c, nome);
    scarto += 30 + nome.length + corpo.length;
  }
  const cd = Buffer.concat(centrali);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(voci.length, 8); e.writeUInt16LE(voci.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(scarto, 16);
  return Buffer.concat([...locali, cd, e]);
}

export const pausa = ms => new Promise(r => setTimeout(r, ms));
/* aspetta che una condizione diventi vera (al massimo ms), invece di una pausa fissa */
export async function finche(cond, ms = 12000) {
  const fine = Date.now() + ms;
  for (;;) { if (await cond()) return true; if (Date.now() > fine) return false; await pausa(150); }
}
let ok = 0, ko = 0;
export function verifica(cond, nome, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nome); } else { ko++; console.log('  ✗ ' + nome + (extra !== undefined ? '\n      ' + JSON.stringify(extra) : '')); }
}
export const esito = () => { console.log(`\n${ok} verifiche superate, ${ko} fallite`); return ko; };

/* un «dispositivo»: contesto del browser con GitHub simulato */
export async function dispositivo(br, G, url, nome, opz = {}) {
  const ctx = await br.newContext({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'], ...opz });
  await G.monta(ctx);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(`  [${nome}] ERRORE PAGINA`, e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) console.log(`  [${nome}] console.error:`, m.text().slice(0, 300)); });
  await p.goto(url);
  return { ctx, p };
}
export const stato = p => p.evaluate(() => BiaWrite.stato());
export const attendiOk = async (p, ms = 9000) => { await p.waitForFunction(() => BiaWrite.stato() === 'ok', null, { timeout: ms }).catch(() => {}); return stato(p); };
export async function collega(p, repo, chiave, { pin = false, tocco = false } = {}) {
  await p.fill('#campo-repo', repo);
  await p.fill('#campo-chiave', chiave);
  await (tocco ? p.tap('#collega') : p.click('#collega'));
  await p.waitForSelector('#finestra[open]', { timeout: 8000 });
  if (!pin) await (tocco ? p.tap('#finestra-no') : p.click('#finestra-no'));
}
export async function infondo(p) {
  await p.evaluate(() => { const c = document.querySelector('#carta'); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); c.focus(); });
}
