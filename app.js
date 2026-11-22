/* BiaWrite — app.js
 * Interfaccia, archivio locale, sincronizzazione con un repository privato di GitHub,
 * blocco del dispositivo, importazione delle vecchie note.
 * Il principio: ogni modifica finisce subito nell'archivio del browser (IndexedDB) e,
 * appena possibile, nel repository. L'utente non salva mai.
 * © B. Raucci — licenza MIT
 */
(() => {
  'use strict';

  const VERSIONE = '1.9.0';
  const CFG = Object.assign({ repository: 'biawrite-note', cartella: 'note' }, window.BIAWRITE_CONFIG || {});
  const COLORI = ['giallo', 'arancio', 'rosa', 'lilla', 'azzurro', 'verde', 'carta', 'grigio'];
  const NOMI_COLORI = { giallo: 'Giallo', arancio: 'Arancio', rosa: 'Rosa', lilla: 'Lilla', azzurro: 'Azzurro', verde: 'Verde', carta: 'Bianco', grigio: 'Grigio' };
  const RIBLOCCO_MS = 5 * 60 * 1000;
  const QUIETE_MS = 3000, MASSIMA_ATTESA_MS = 30000;          // invio dopo 3 s di quiete, comunque ogni 30 s

  const Core = window.BiaCore, Arch = window.BiaArchivio, Imp = window.BiaImporta;
  const Meteo = window.BiaMeteo || null;                         // modulo «meteo» della plancia (facoltativo)
  const Cru = window.BiaCruscotto || null;                       // modulo «diario alimentare» (facoltativo)
  const CARTELLA_DIARIO = String(CFG.diario || 'diario'), PERCORSO_DIARIO = CARTELLA_DIARIO + '/diario-alimentare.md';
  const { esc, escA } = Core;
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $('#app'), elNote = $('#note'), elVuoto = $('#vuoto'), elCerca = $('#cerca'), elStato = $('#stato');
  const editor = $('#editor'), carta = $('#carta'), testo = $('#testo'), titolo = $('#titolo'), menu = $('#menu');
  const utf8 = s => new TextEncoder().encode(s);
  const b64 = u => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
  const deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  /* ============================================================ impostazioni */
  const K_IMP = 'biawrite.impostazioni', K_BOZZA = 'biawrite.bozza';
  let S = {};
  try { S = JSON.parse(localStorage.getItem(K_IMP)) || {}; } catch (e) { S = {}; }
  const salvaS = () => { try { localStorage.setItem(K_IMP, JSON.stringify(S)); } catch (e) { /* archivio pieno o negato */ } };
  // dalle versioni con Google Drive: si riparte dal collegamento, le note locali restano
  if (S.mode === 'drive') { S.mode = undefined; delete S.token; delete S.email; delete S.cartellaId; delete S.clientId; }
  if (S.lock && !S.lock.kPin) S.lock = null;                  // blocco del vecchio formato: va reimpostato
  salvaS();

  /* ============================================================ archivio locale (IndexedDB) */
  /* due depositi: «note» (i testi) e «allegati» (immagini e file, con il loro percorso nel repository) */
  const DB = {
    _p: null, _mem: null,
    apri() {
      if (this._mem) return Promise.resolve(null);
      if (!this._p) {
        const memoria = () => { this._mem = { note: new Map(), allegati: new Map() }; };
        this._p = new Promise(res => {
          try {
            const r = indexedDB.open('biawrite', 2);
            r.onupgradeneeded = () => {
              const db = r.result;
              if (!db.objectStoreNames.contains('note')) db.createObjectStore('note', { keyPath: 'id' });
              if (!db.objectStoreNames.contains('allegati')) db.createObjectStore('allegati', { keyPath: 'percorso' });
            };
            r.onsuccess = () => res(r.result);
            r.onerror = () => { memoria(); res(null); };
          } catch (e) { memoria(); res(null); }
        });
      }
      return this._p;
    },
    async _tx(nome, modo, fn) {
      const db = await this.apri();
      if (!db) { const r = fn(null, this._mem[nome]); return r && typeof r === 'object' && 'result' in r ? r.result : undefined; }
      return new Promise((res, rej) => {
        const tx = db.transaction(nome, modo);
        const r = fn(tx.objectStore(nome));
        tx.oncomplete = () => res(r && r.result);
        tx.onerror = tx.onabort = () => rej(tx.error);
      });
    },
    _chiave: x => x.id || x.percorso,
    tutte(nome = 'note') { return this._tx(nome, 'readonly', (s, m) => (s ? s.getAll() : { result: [...m.values()] })); },
    prendi(nome, k) { return this._tx(nome, 'readonly', (s, m) => (s ? s.get(k) : { result: m.get(k) })).catch(() => undefined); },
    metti(x, nome = 'note') { return this._tx(nome, 'readwrite', (s, m) => (s ? s.put(x) : m.set(this._chiave(x), x))).catch(e => console.warn('archivio', e)); },
    mettiTutte(arr, nome = 'note') {                         // una sola transazione: migliaia di note in un colpo
      return this._tx(nome, 'readwrite', (s, m) => { for (const x of arr) (s ? s.put(x) : m.set(this._chiave(x), x)); }).catch(e => console.warn('archivio', e));
    },
    togli(id, nome = 'note') { return this._tx(nome, 'readwrite', (s, m) => (s ? s.delete(id) : m.delete(id))).catch(e => console.warn('archivio', e)); },
    async svuota() {
      for (const nome of ['note', 'allegati']) await this._tx(nome, 'readwrite', (s, m) => (s ? s.clear() : m.clear())).catch(e => console.warn('archivio', e));
    },
  };

  /* ============================================================ note */
  /* nota = { id, path, sha, name, content, color, creata, modified, autoName, dirty, metaDirty, deleted, rev }
   * path e sha: dove sta e quale versione è l'ultima vista nel repository (null se non c'è ancora). */
  const note = new Map();
  const memo = new WeakMap();
  let aperta = null, sporco = false, timerScrivi = 0, timerSync = 0, primaInAttesa = 0;
  let ultimaIst = null;                                       // ultima istantanea del repository

  const nuovoId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const estensione = nome => (/\.txt$/i.test(nome) ? 'txt' : 'md');
  const titoloDi = n => n.name.replace(/\.(md|markdown|txt)$/i, '');
  const baseDi = p => p.slice(p.lastIndexOf('/') + 1);
  const percorsoDi = nome => CFG.cartella + '/' + nome;
  const due = x => String(x).padStart(2, '0');
  function nomeFile(t, ext) {
    t = String(t).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/^\.+/, '').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
    return (t || 'Nota senza titolo') + '.' + ext;
  }
  function nomeData(ms) {
    const d = new Date(ms);
    return 'Nota ' + d.getFullYear() + '-' + due(d.getMonth() + 1) + '-' + due(d.getDate()) + ' ' + due(d.getHours()) + '.' + due(d.getMinutes());
  }
  const stampaData = d => due(d.getDate()) + '-' + due(d.getMonth() + 1) + ' ' + due(d.getHours()) + '.' + due(d.getMinutes());
  function primaRiga(c, ext) {
    for (const r of c.split('\n', 40)) {                // la prima riga con del testo vero («#» da solo non conta)
      if (!r.trim()) continue;
      let t = (ext === 'txt' ? r : Core.mdToText(r)).replace(/^(?:[-•]|\d+\.)\s+/, '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, '');
      return t;
    }
    return '';
  }
  /* Un nome di file libero: né fra le altre note, né fra i file del repository che non sono di questa nota. */
  function nomeLibero(nome, n, ist) {
    const basso = s => s.toLowerCase();
    const mio = n && n.path ? basso(n.path) : null;
    const occupato = x => {
      for (const o of note.values()) if (o !== n && !o.deleted && basso(o.name) === basso(x)) return true;
      if (ist) { const p = basso(percorsoDi(x)); for (const k of ist.file.keys()) if (basso(k) === p && p !== mio) return true; }
      return false;
    };
    const m = nome.match(/^(.*?)(\.[^.]+)$/) || [nome, nome, ''];
    let x = nome, k = 1;
    while (occupato(x)) { k++; x = m[1] + ' (' + k + ')' + m[2]; }
    return x;
  }
  function coloreDa(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORI[h % 6]; }
  /* Ogni foglietto è «attaccato» a modo suo, sempre uguale per la stessa nota. */
  function posa(id) {
    let h = 2166136261;
    for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const u = k => ((h >>> k) & 255) / 255;
    let r = (u(0) * 2 - 1) * 3.6;
    if (Math.abs(r) < 0.7) r = r < 0 ? -0.9 : 0.9;
    const e = [0, 15, 20, 20, 26, 30][Math.floor(u(24) * 5.999)];
    return '--r:' + r.toFixed(2) + 'deg;--dx:' + Math.round((u(8) * 2 - 1) * 4) + 'px;--dy:' + Math.round((u(16) * 2 - 1) * 5) + 'px;--e:' + e + 'px';
  }
  const collegato = () => S.mode === 'github';
  const daInviare = n => !n.deleted && (n.dirty || n.metaDirty || !n.path) && !(!n.path && !n.content.trim() && n.autoName);
  let allegatiInAttesa = 0, ricevendo = 0;
  const copiaDiario = () => S.copiaDiario !== 'no';               // la copia del diario nel repository privato (mai il file d'origine)
  const diarioDaInviare = () => !!Cru && copiaDiario() && Cru.stato().sporco;
  const conDiario = () => !!Cru && S.diario !== 'no';
  const inSospeso = () => allegatiInAttesa > 0 || diarioDaInviare() || [...note.values()].some(n => (n.deleted && n.path) || daInviare(n));
  const pendenti = () => { let k = allegatiInAttesa + (diarioDaInviare() ? 1 : 0); for (const n of note.values()) if ((n.deleted && n.path) || daInviare(n)) k++; return k; };

  function anteprima(n) {
    const c = memo.get(n);
    if (c && c.rev === n.rev) return c.html;
    let t = n.content;
    if (!n.autoName) {                         // il titolo è già sul foglietto: non lo si ripete
      const m = t.match(/^\s*([^\n]*)\n?/);
      const prima = m ? (estensione(n.name) === 'txt' ? m[1] : Core.mdToText(m[1])).trim().toLowerCase() : '';
      if (prima && prima === titoloDi(n).trim().toLowerCase()) t = t.slice(m[0].length);
    }
    if (t.length > 1100) { t = t.slice(0, 1100); const k = t.lastIndexOf('\n'); if (k > 200) t = t.slice(0, k); }
    const html = estensione(n.name) === 'txt' ? Core.textToHtml(t) : Core.mdToHtml(t);
    memo.set(n, { rev: n.rev, html });
    return html;
  }
  function quando(ms) {
    const d = new Date(ms), o = new Date();
    if (d.toDateString() === o.toDateString()) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const f = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== o.getFullYear()) f.year = 'numeric';
    return d.toLocaleDateString('it-IT', f);
  }

  /* ============================================================ bacheca */
  const vista = () => app.dataset.vista;

  /* Con migliaia di note la bacheca si disegna a blocchi: i foglietti successivi arrivano
   * quando si scorre verso il fondo. */
  const PASSO = 120;
  let limite = PASSO;
  const osservatore = 'IntersectionObserver' in window
    ? new IntersectionObserver(v => { if (v.some(x => x.isIntersecting)) { limite += PASSO; disegna(); } }, { root: $('#bacheca'), rootMargin: '900px 0px' })
    : null;
  /* Segni di vita su qualche foglietto (sempre gli stessi per la stessa nota): un alone di caffè,
   * un alone interrotto, una gocciolina; a parte, una piega. */
  function segni(id, soloAloni) {
    let h = 0x9747b28c;
    for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    const u = k => ((h >>> k) & 255) / 255;
    let cls = '', st = '';
    const t = u(0);
    if (t < .13) cls = ' m-anello'; else if (t < .21) cls = ' m-rotto'; else if (t < .28 && !soloAloni) cls = ' m-goccia';
    if (cls) st = ';--mx:' + Math.round(u(8) * 78 - 10) + '%;--my:' + Math.round(u(16) * 34 + 36) + '%;--ms:' + Math.round((cls === ' m-goccia' ? 26 : 30) + u(24) * 16) + '%;--mr:' + Math.round(u(4) * 360) + 'deg';
    if (!soloAloni && u(20) < .13) { cls += ' m-piega'; st += ';--pa:' + Math.round(25 + u(12) * 130) + 'deg'; }
    return { cls, st };
  }
  const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  /* La cartella di una nota è il mese in cui è nata: non cambia quando la si ritocca. */
  const mese = n => { const d = new Date(n.creata || n.modified); return d.getFullYear() + '-' + due(d.getMonth() + 1); };
  const FISSATE = 'fissate';                                      // la cartella delle note con la puntina
  const nomeMese = m => (m === FISSATE ? 'Fissate' : MESI[+m.slice(5) - 1] + ' ' + m.slice(0, 4));
  const inCartella = (n, c) => (c === FISSATE ? !!n.pinned : mese(n) === c);
  let cartellaAperta = null, scrollRadice = 0, appenaFissata = null, timerAnima = 0;
  const ridotto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const perMesi = () => S.bacheca !== 'tutte';

  /* Inclinazione e macchie dipendono da qualcosa che è uguale su tutti i dispositivi (la data di
   * nascita, sincronizzata nell'indice): lo stesso foglietto ha lo stesso aspetto sul Mac e sul telefono. */
  const impronta = n => n.creata ? 'c' + n.creata : 'n' + n.name;
  const fissaPer = txt => S.fisso === 'sempre' || ((S.fisso || 'txt') === 'txt' && txt);
  /* Il formato lo decide il contenuto, così è lo stesso su ogni dispositivo: una riga sta su una
   * striscia, un testo lungo su una scheda da schedario, il testo semplice su un foglio di tabulato. */
  function formato(n) {
    const righe = n.content.split('\n').filter(l => l.trim()).length, lung = n.content.trim().length;
    if (lung < 90 && righe <= 2) return 'striscia';
    if (estensione(n.name) === 'txt') return righe <= 7 ? 'tabulato corto' : 'tabulato';
    return lung > 650 || righe > 14 ? 'scheda' : 'foglietto';
  }
  function scheda(n, i, data) {
    const ext = estensione(n.name);
    const fuori = collegato() && (n.dirty || n.metaDirty || !n.path);
    const m = segni(impronta(n));
    return '<article class="nota f-' + formato(n) + (n.pinned ? ' fissata' : '') + m.cls + '" data-id="' + escA(n.id) + '" data-colore="' + escA(n.color) +
      '" style="' + posa(impronta(n)) + m.st + ';--i:' + i + '" tabindex="0" role="button" aria-label="' +
      escA('Apri: ' + titoloDi(n) + (n.pinned ? ' (fissata in alto)' : '')) + '">' +
      (n.pinned ? '<svg class="puntina' + (n.id === appenaFissata ? ' conficcata' : '') + '" viewBox="0 0 34 40" aria-hidden="true"><use href="#puntina"/></svg>' : '') +
      '<div class="faccia">' + (n.autoName ? '' : '<h3>' + esc(titoloDi(n)) + '</h3>') +
      '<div class="anteprima' + (fissaPer(ext === 'txt') ? ' fissa' : '') + '">' + anteprima(n) + '</div><footer>' +
      (fuori ? '<span class="segno" title="Non ancora su GitHub"></span>' : '') +
      '<time>' + esc(quando(data === 'creata' ? n.creata || n.modified : n.modified)) + '</time>' + (ext === 'txt' ? '<span>.txt</span>' : '') + '</footer></div><i class="orecchia"></i>' +
      '<button class="altro" aria-label="Colore, nome, elimina" aria-haspopup="menu"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>' +
      '</article>';
  }
  /* Una cartella come nel Finder: icona piccola, nome sotto, e i colori delle note come pallini. */
  function cartellaHtml(m, lista, i) {
    const colori = lista.slice().sort((a, b) => b.modified - a.modified).slice(0, 4).map(n => n.color);
    const speciale = m === FISSATE;
    return '<button class="cartella' + (speciale ? ' speciale' : '') + '" data-mese="' + m + '" style="--i:' + i + '" aria-label="' + escA(nomeMese(m) + ', ' + quanti(lista.length)) + '">' +
      '<span class="ic" aria-hidden="true">' + (speciale ? '<svg class="spilla" viewBox="0 0 34 40"><use href="#puntina"/></svg>' : '') + '</span>' +
      '<b>' + (speciale ? 'Fissate' : MESI[+m.slice(5) - 1]) + '</b><small>' + quanti(lista.length) + '</small>' +
      '<span class="fogli" aria-hidden="true">' + colori.map((c, k) => '<i data-colore="' + escA(c) + '" style="--k:' + k + '"></i>').join('') + '</span></button>';
  }

  /* Tre modi: la radice (puntine in testa, poi anni e cartelle dei mesi), l'interno di una cartella,
   * e l'elenco piatto (ricerca, oppure bacheca «tutte insieme»). */
  function disegna(opz) {
    const q = elCerca.value.trim().toLowerCase();
    const vive = [...note.values()].filter(n => !n.deleted);
    if (cartellaAperta && !vive.some(n => inCartella(n, cartellaAperta))) cartellaAperta = null;     // cartella rimasta vuota
    const modo = q ? 'ricerca' : !perMesi() ? 'tutte' : cartellaAperta ? 'cartella' : 'radice';
    app.dataset.cartella = modo === 'cartella' ? '1' : '';
    $('#luogo').textContent = modo === 'cartella' ? nomeMese(cartellaAperta) : '';
    if (osservatore) osservatore.disconnect();
    clearTimeout(timerAnima);
    elNote.classList.toggle('anima', !!(opz && opz.anima) && !ridotto());
    if (elNote.classList.contains('anima')) timerAnima = setTimeout(() => elNote.classList.remove('anima'), 1300);
    let html = '', quante = 0;
    if (modo === 'radice') {
      const fissate = vive.filter(n => n.pinned).sort((a, b) => b.modified - a.modified);
      const gruppi = new Map();
      for (const n of vive) { const m = mese(n); if (!gruppi.has(m)) gruppi.set(m, []); gruppi.get(m).push(n); }
      const mesi = [...gruppi.keys()].sort().reverse();
      let k = 0;
      if (fissate.length) html += '<div class="griglia cartelle in-testa">' + cartellaHtml(FISSATE, fissate, k++) + '</div>';
      let anno = null;
      for (const m of mesi) {
        const a = m.slice(0, 4);
        if (a !== anno) {
          if (anno) html += '</div>';
          anno = a;
          const tot = mesi.filter(x => x.startsWith(a)).reduce((t, x) => t + gruppi.get(x).length, 0);
          html += '<h2 class="anno">' + a + ' <small>' + quanti(tot) + '</small></h2><div class="griglia cartelle">';
        }
        html += cartellaHtml(m, gruppi.get(m), k++);
      }
      if (anno) html += '</div>';
      quante = vive.length;
    } else {
      let elenco;
      if (modo === 'cartella' && cartellaAperta === FISSATE) elenco = vive.filter(n => n.pinned).sort((a, b) => b.modified - a.modified);
      else if (modo === 'cartella') elenco = vive.filter(n => mese(n) === cartellaAperta).sort((a, b) => (!!b.pinned - !!a.pinned) || (b.creata || b.modified) - (a.creata || a.modified));
      else elenco = vive.filter(n => !q || n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
        .sort((a, b) => (!!b.pinned - !!a.pinned) || b.modified - a.modified);
      const fissate = elenco.filter(n => n.pinned).length;
      const tutti = elenco.length;
      if (osservatore) elenco.splice(limite);
      // le note con la puntina hanno una fila loro: i formati diversi si incastrano, e non devono mescolarsi alle altre
      const come = modo === 'cartella' && cartellaAperta !== FISSATE ? 'creata' : 'modificata', sciolte = cartellaAperta === FISSATE && modo === 'cartella' ? 0 : fissate;
      html = (sciolte ? '<div class="griglia fissate">' + elenco.slice(0, sciolte).map((n, i) => scheda(n, i, come)).join('') + '</div>' : '') +
        '<div class="griglia">' + elenco.slice(sciolte).map((n, i) => scheda(n, i + sciolte, come)).join('') +
        (tutti > elenco.length ? '<div class="ancora" aria-hidden="true"></div>' : '') + '</div>';
      quante = elenco.length;
    }
    elNote.innerHTML = html;
    plancia(modo, vive);
    appenaFissata = null;
    const ancora = elNote.querySelector('.ancora');
    if (osservatore && ancora) osservatore.observe(ancora);
    elVuoto.hidden = quante > 0;
    if (!quante) {
      if (q) elVuoto.textContent = 'Nessuna nota contiene «' + elCerca.value.trim() + '».';
      else elVuoto.innerHTML = 'Nessuna nota ancora. Tocca «Nuova nota» per cominciare, oppure <button class="filo" id="vuoto-importa">importa le vecchie note</button>.';
    }
  }

  /* La plancia: la data, il tempo che fa, il diario. Sta sopra la bacheca, non dentro una cartella né durante la ricerca. */
  let meteoEsito = null, meteoErrore = false, meteoGiro = 0;
  function plancia(modo, vive) {
    const el = $('#plancia');
    const mostra = modo === 'radice' || modo === 'tutte';
    el.hidden = !mostra;
    if (!mostra) { el.innerHTML = ''; return; }
    const o = new Date(), fissate = vive.filter(n => n.pinned).length;
    el.innerHTML = '<div class="pl-data" data-t="oggi"><span class="g">' + esc(o.toLocaleDateString('it-IT', { weekday: 'long' })) + '</span><b>' + o.getDate() + '</b><span class="m">' + esc(o.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })) + '</span>' +
      '<small>' + quanti(vive.length) + (fissate ? ' · ' + fissate + (fissate === 1 ? ' fissata' : ' fissate') : '') + '</small></div>' +
      (Meteo ? '<div class="pl-meteo" data-t="meteo">' + Meteo.html(S.meteo || null, meteoEsito, meteoErrore) + '</div>' : '') +
      (conDiario() ? Cru.pulsanteHtml() : '');
  }
  async function aggiornaMeteo(forza) {
    if (!Meteo) return;
    const giro = ++meteoGiro, luogo = S.meteo || null;
    const metti = () => { const m = $('#plancia .pl-meteo'); if (m) m.innerHTML = Meteo.html(S.meteo || null, meteoEsito, meteoErrore); };
    if (!luogo) { meteoEsito = null; meteoErrore = false; metti(); return; }
    try { const r = await Meteo.prendi(luogo, { forza }); if (giro !== meteoGiro) return; meteoEsito = r; meteoErrore = false; }
    catch (e) { if (giro !== meteoGiro) return; meteoErrore = true; }
    metti();
  }
  $('#plancia').addEventListener('click', e => {
    if (e.target.closest('.pl-diario')) { apriDiario(); return; }
    const a = e.target.closest('[data-a]');
    if (!a) return;
    if (a.dataset.a === 'meteo-luogo') pannello().then(() => { const c = $('#meteo-cerca'); if (c) { c.scrollIntoView({ block: 'center' }); c.focus(); } });
    else if (a.dataset.a === 'meteo-riprova') { meteoErrore = false; aggiornaMeteo(true); }
  });

  /* Entrare in una cartella: l'icona si ingrandisce e svanisce, poi la vista cambia. */
  function apriCartella(m, el) {
    const vai = () => {
      scrollRadice = $('#bacheca').scrollTop;
      history.pushState({ cartella: m }, '');
      cartellaAperta = m; limite = PASSO;
      disegna({ anima: true });
      $('#bacheca').scrollTop = 0;
    };
    if (el && !ridotto()) { el.classList.add('apre'); setTimeout(vai, 230); } else vai();
  }
  /* Il diario alimentare: una cartella fissa della bacheca che si apre sul cockpit. */
  function mostraDiario() {
    if (!Cru) return;
    app.dataset.vista = 'diario'; app.dataset.cartella = '';
    $('#luogo').textContent = 'Diario alimentare';
    Cru.apri($('#diario'));
  }
  function apriDiario(el) {
    const vai = () => { scrollRadice = $('#bacheca').scrollTop; history.pushState({ diario: true }, ''); mostraDiario(); };
    if (el && !ridotto()) { el.classList.add('apre'); setTimeout(vai, 230); } else vai();
  }
  function lasciaDiario() {
    Cru.chiudi();
    app.dataset.vista = 'bacheca';
    disegna({ anima: true });
    $('#bacheca').scrollTop = scrollRadice;
  }
  function vaiACartella(m, sostituisci) {
    if (!perMesi() || m === cartellaAperta) return;
    if (!cartellaAperta) scrollRadice = $('#bacheca').scrollTop;
    history[sostituisci ? 'replaceState' : 'pushState']({ cartella: m }, '');
    cartellaAperta = m; limite = PASSO;
    $('#bacheca').scrollTop = 0;
  }

  elNote.addEventListener('click', e => {
    const c = e.target.closest('.cartella');
    if (c) { apriCartella(c.dataset.mese, c); return; }
    const el = e.target.closest('.nota');
    if (!el) return;
    const n = note.get(el.dataset.id);
    if (!n) return;
    if (e.target.closest('.altro')) { e.stopPropagation(); menuNota(n, e.target.closest('.altro')); return; }
    apri(n);
  });
  elNote.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('nota')) { e.preventDefault(); const n = note.get(e.target.dataset.id); if (n) apri(n); }
  });
  elVuoto.addEventListener('click', e => { if (e.target.id === 'vuoto-importa') sceltaImporta(e.target); });
  let timerCerca = 0;
  elCerca.addEventListener('input', () => { clearTimeout(timerCerca); timerCerca = setTimeout(() => { limite = PASSO; disegna(); }, 120); });
  $('#nuova').addEventListener('click', () => nuovaNota());

  function nuovaNota() {
    const ora = Date.now();
    const ext = S.formato === 'txt' ? 'txt' : 'md';
    S.giro = ((S.giro || 0) + 1) % 6;
    salvaS();
    const n = { id: nuovoId(), path: null, sha: null, name: nomeLibero(nomeData(ora) + '.' + ext, null, ultimaIst),
      content: '', color: COLORI[S.giro], creata: ora, modified: ora, autoName: true, dirty: false, metaDirty: false, deleted: false, rev: 0 };
    Object.defineProperty(n, 'nata', { value: true, writable: true, configurable: true, enumerable: false });   // solo in questa sessione
    note.set(n.id, n);
    DB.metti(n);
    apri(n, true);
  }

  /* ============================================================ editor */
  function apri(n, nuova) {
    chiudiMenu();
    aperta = n; sporco = false;
    const txt = estensione(n.name) === 'txt';
    editor.classList.toggle('semplice', txt);
    editor.classList.toggle('fissa', fissaPer(txt));
    editor.dataset.colore = n.color;
    titolo.value = n.autoName ? '' : titoloDi(n);
    $('#estensione').textContent = '.' + estensione(n.name);
    liberaImmagini();
    if (txt) testo.value = n.content;
    else { carta.innerHTML = preparaHtml(Core.mdToHtml(n.content)) || '<p><br></p>'; mostraImmagini(); }
    app.dataset.vista = 'editor';
    $('#foglio').scrollTop = 0;
    if (txt) cresci();
    segnaVuota();
    aggiornaStrumenti();
    aggiornaStato();
    history.pushState({ nota: true }, '');
    if (nuova) (txt ? testo : carta).focus();
  }
  function apriContenuto(n) {
    if (estensione(n.name) === 'txt') { testo.value = n.content; cresci(); }
    else { liberaImmagini(); carta.innerHTML = preparaHtml(Core.mdToHtml(n.content)) || '<p><br></p>'; mostraImmagini(); }
    aggiornaTesta(n);
    segnaVuota();
  }
  function aggiornaTesta(n) {
    editor.dataset.colore = n.color;
    if (document.activeElement !== titolo) titolo.value = n.autoName ? '' : titoloDi(n);
  }

  function leggiEditor() { return estensione(aperta.name) === 'txt' ? testo.value : Core.htmlToMd(htmlVero()); }

  /* Le immagini salvate nel repository (allegati/…) hanno un indirizzo relativo, che il browser
   * non può aprire da solo: si mostrano da una copia locale, ma nel testo resta l'indirizzo vero. */
  const relativo = s => !!s && !/^(https?:|data:|blob:|mailto:|\/\/)/i.test(s);
  function preparaHtml(html) {
    if (!/<img/i.test(html)) return html;
    const t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('img').forEach(i => { const s = i.getAttribute('src'); if (relativo(s)) { i.dataset.vero = s; i.removeAttribute('src'); } });
    return t.innerHTML;
  }
  function htmlVero(senzaImmaginiLocali) {
    if (!carta.querySelector('img[data-vero]')) return carta.innerHTML;
    const c = carta.cloneNode(true);
    c.querySelectorAll('img[data-vero]').forEach(i => { if (senzaImmaginiLocali) i.remove(); else { i.setAttribute('src', i.dataset.vero); i.removeAttribute('data-vero'); } });
    return c.innerHTML;
  }
  const urlImmagini = [];
  function liberaImmagini() { urlImmagini.splice(0).forEach(u => URL.revokeObjectURL(u)); }
  async function immagine(percorso) {
    const a = await DB.prendi('allegati', percorso);
    if (a && a.dati) return a.dati;
    const sha = ultimaIst && ultimaIst.allegati && ultimaIst.allegati.get(percorso);
    if (!sha || !arch || !chiave) return null;
    const blob = new Blob([await arch.leggiBinario(sha)], { type: Imp.mime(percorso) });
    await DB.metti({ percorso, tipo: blob.type, dati: blob, inviato: true, sha }, 'allegati');
    return blob;
  }
  async function mostraImmagini() {
    const nota = aperta;
    for (const img of [...carta.querySelectorAll('img[data-vero]:not([src])')]) {
      let percorso;
      try { percorso = CFG.cartella + '/' + decodeURIComponent(img.dataset.vero).replace(/^\.\//, ''); } catch (e) { continue; }
      try {
        const b = await immagine(percorso);
        if (!b || aperta !== nota || !img.isConnected) continue;
        const u = URL.createObjectURL(b);
        urlImmagini.push(u);
        img.src = u;
      } catch (e) { /* resta il segnaposto */ }
    }
  }

  /* Porta nell'archivio ciò che è scritto nell'editor. */
  function conferma() {
    clearTimeout(timerScrivi); timerScrivi = 0;
    const n = aperta;
    if (!n || !sporco) return false;
    sporco = false;
    const ext = estensione(n.name), contenuto = leggiEditor(), t = titolo.value.trim();
    const auto = !t;
    let nome = auto ? nomeFile(primaRiga(contenuto, ext) || nomeData(n.creata), ext) : nomeFile(t, ext);
    if (nome.toLowerCase() !== n.name.toLowerCase()) nome = nomeLibero(nome, n, ultimaIst);
    let cambiata = false;
    if (contenuto !== n.content) { n.content = contenuto; n.dirty = true; n.modified = Date.now(); cambiata = true; }
    if (nome !== n.name || auto !== n.autoName) { n.name = nome; n.autoName = auto; n.metaDirty = true; cambiata = true; }
    if (!cambiata) return false;
    n.rev++;
    const fatto = DB.metti(n);
    programmaSync();
    aggiornaStato();
    return fatto;
  }
  function modificato() {
    sporco = true;
    clearTimeout(timerScrivi);
    timerScrivi = setTimeout(conferma, 350);
    if (elStato.dataset.s === 'ok') aggiornaStato();
  }

  function chiudi() {
    const n = aperta;
    if (!n) return;
    conferma();
    aperta = null;
    liberaImmagini();
    const vuota = !n.content.trim() && n.autoName && !n.path;
    if (vuota) { note.delete(n.id); DB.togli(n.id); }                                         // nota nuova lasciata vuota
    app.dataset.vista = 'bacheca';
    if (!vuota && n.nata && perMesi() && !elCerca.value.trim() && mese(n) !== cartellaAperta) vaiACartella(mese(n), !!cartellaAperta);
    delete n.nata;
    disegna();
    aggiornaStato();
    if (collegato()) sync();
  }
  $('#indietro').addEventListener('click', () => history.back());
  window.addEventListener('popstate', e => {
    if (aperta) { chiudi(); return; }
    if (e.state && e.state.diario) { mostraDiario(); return; }
    if (vista() === 'diario') lasciaDiario();
    const c = (e.state && e.state.cartella) || null;
    if (c !== cartellaAperta) {
      cartellaAperta = c; limite = PASSO;
      disegna({ anima: true });
      $('#bacheca').scrollTop = c ? 0 : scrollRadice;
    }
  });
  function chiudiPerForza(messaggio) {
    if (!aperta) return;
    sporco = false; clearTimeout(timerScrivi); timerScrivi = 0; aperta = null;
    app.dataset.vista = 'bacheca';
    history.back();
    if (messaggio) avviso(messaggio);
  }

  function segnaVuota() { carta.classList.toggle('vuota', !carta.textContent && !carta.querySelector('img,hr,li,blockquote,pre,h1,h2,h3')); }
  function cresci() { testo.style.height = 'auto'; testo.style.height = Math.max(testo.scrollHeight, 200) + 'px'; }

  carta.addEventListener('input', () => {
    if (app.dataset.tastiera === '1') cursoreInVista();
    if (!carta.firstChild || (carta.childNodes.length === 1 && carta.firstChild.nodeName === 'BR')) {
      carta.innerHTML = '<p><br></p>';
      const r = document.createRange(); r.setStart(carta.firstChild, 0); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    segnaVuota(); modificato();
  });
  testo.addEventListener('input', () => { cresci(); modificato(); if (app.dataset.tastiera === '1') cursoreInVista(); });
  titolo.addEventListener('input', modificato);
  titolo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); (editor.classList.contains('semplice') ? testo : carta).focus(); } });

  /* --- incolla: entra solo formattazione pulita */
  carta.addEventListener('paste', e => {
    const cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    const h = cd.getData('text/html'), t = cd.getData('text/plain');
    let html = h ? Core.pulisci(h) : Core.textToHtml(t);
    if (!html) return;
    const unico = html.match(/^<p>([\s\S]*)<\/p>$/);
    if (unico && !/<p[ >]/.test(unico[1])) html = unico[1];
    document.execCommand('insertHTML', false, html);
  });
  /* --- copia e taglia: negli appunti va HTML pulito, senza gli stili del browser */
  function negliAppunti(e) {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed || !e.clipboardData) return false;
    const d = document.createElement('div');
    d.appendChild(s.getRangeAt(0).cloneContents());
    e.clipboardData.setData('text/html', Core.perAppunti(d.innerHTML));
    e.clipboardData.setData('text/plain', Core.htmlToText(d.innerHTML));
    e.preventDefault();
    return true;
  }
  carta.addEventListener('copy', negliAppunti);
  carta.addEventListener('cut', e => { if (negliAppunti(e)) document.execCommand('delete'); });

  /* --- barra di formattazione */
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch (e) { /* non essenziale */ }
  const strumenti = $('#strumenti');
  strumenti.addEventListener('mousedown', e => e.preventDefault());
  strumenti.addEventListener('click', e => { const b = e.target.closest('button[data-c]'); if (b) comando(b.dataset.c); });

  function antenato(tag) {
    const s = getSelection();
    let n = s.rangeCount ? s.anchorNode : null;
    while (n && n !== carta) { if (n.nodeType === 1 && n.tagName === tag) return n; n = n.parentNode; }
    return null;
  }
  function conSelezione(fn) {
    const s = getSelection();
    const r = s.rangeCount ? s.getRangeAt(0) : null;
    const p = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
    fn();
    if (p) { try { const q = document.createRange(); q.setStart(p[0], p[1]); q.setEnd(p[2], p[3]); s.removeAllRanges(); s.addRange(q); } catch (e) { /* nodo sparito */ } }
  }
  async function comando(c) {
    if (!carta.contains(getSelection().anchorNode)) carta.focus();
    if (c === 'h2' || c === 'h3') {
      document.execCommand('formatBlock', false, antenato(c.toUpperCase()) ? 'p' : c);
    } else if (c === 'quote') {
      const q = antenato('BLOCKQUOTE');
      if (!q) document.execCommand('formatBlock', false, 'blockquote');
      else conSelezione(() => {
        const sciolto = [...q.childNodes].some(x => (x.nodeType === 3 && x.nodeValue.trim()) || (x.nodeType === 1 && !/^(P|H\d|UL|OL|PRE|DIV)$/.test(x.tagName)));
        if (sciolto) { const p = document.createElement('p'); while (q.firstChild) p.appendChild(q.firstChild); q.replaceWith(p); }
        else { while (q.firstChild) q.parentNode.insertBefore(q.firstChild, q); q.remove(); }
      });
    } else if (c === 'pre') {
      document.execCommand('formatBlock', false, antenato('PRE') ? 'p' : 'pre');
    } else if (c === 'link') {
      const s = getSelection();
      const r = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      const a = antenato('A');
      const u = await chiedi({ titolo: 'Collegamento', campo: { valore: a ? a.getAttribute('href') : 'https://', tipo: 'url' },
        testo: a ? 'Lascia vuoto per togliere il collegamento.' : '', ok: 'Applica' });
      if (u === null) return;
      carta.focus();
      if (r) { s.removeAllRanges(); s.addRange(r); }
      const url = u.trim();
      if (!url || url === 'https://') document.execCommand('unlink');
      else if (a) a.setAttribute('href', url);
      else if (s.isCollapsed) document.execCommand('insertHTML', false, '<a href="' + escA(url) + '">' + esc(url) + '</a>');
      else document.execCommand('createLink', false, url);
    } else if (c === 'removeFormat') {
      document.execCommand('removeFormat'); document.execCommand('unlink');
    } else {
      document.execCommand(c, false, null);
    }
    segnaVuota(); modificato(); aggiornaStrumenti();
  }
  function aggiornaStrumenti() {
    if (vista() !== 'editor' || editor.classList.contains('semplice')) return;
    const dentro = carta.contains(getSelection().anchorNode);
    strumenti.querySelectorAll('button[data-c]').forEach(b => {
      const c = b.dataset.c;
      let on = false;
      if (dentro) {
        try {
          if (c === 'h2' || c === 'h3') on = !!antenato(c.toUpperCase());
          else if (c === 'quote') on = !!antenato('BLOCKQUOTE');
          else if (c === 'link') on = !!antenato('A');
          else if (c === 'pre') on = !!antenato('PRE');
          else if (c === 'underline') on = !!antenato('U') || (!antenato('A') && document.queryCommandState(c));
          else if (c !== 'removeFormat') on = document.queryCommandState(c);
        } catch (e) { on = false; }
      }
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.addEventListener('selectionchange', aggiornaStrumenti);

  /* --- copia negli appunti */
  async function copia(html, semplice) {
    // nell'app per Mac gli appunti li scrive il sistema: HTML per l'editor visuale, testo semplice per il resto
    if (window.BiaMac && BiaMac.copia) { try { return BiaMac.copia(html, semplice) !== false; } catch (e) { /* si tenta la via del browser */ } }
    try {
      if (html && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([semplice], { type: 'text/plain' }) })]);
        return true;
      }
    } catch (e) { /* si tenta la via classica */ }
    let ok = false;
    const su = e => { if (html) e.clipboardData.setData('text/html', html); e.clipboardData.setData('text/plain', semplice); e.preventDefault(); ok = true; };
    document.addEventListener('copy', su, true);
    try { document.execCommand('copy'); } catch (e) { /* niente */ }
    document.removeEventListener('copy', su, true);
    return ok;
  }
  /* Un solo gesto: tutta la nota negli appunti come testo formattato, da incollare
   * in un editor visuale (WordPress, posta, Word…). Insieme va la versione senza formattazione. */
  $('#copia').addEventListener('click', async () => {
    if (!aperta) return;
    conferma();
    const html = estensione(aperta.name) === 'txt' ? Core.textToHtml(testo.value) : Core.pulisci(htmlVero(true));
    if (!html) { avviso('La nota è vuota: non c\'è nulla da copiare.'); return; }
    const ok = await copia(Core.perAppunti(html), Core.htmlToText(html));
    avviso(ok ? 'Copiato con la formattazione: ora incollalo.' : 'Il browser non ha permesso la copia: seleziona il testo e copia a mano.');
  });
  $('#altro').addEventListener('click', e => { if (aperta) menuNota(aperta, e.currentTarget); });

  /* ============================================================ menu */
  function voce(m, etichetta, nota_, fn, rosso) {
    const b = document.createElement('button');
    b.className = 'voce' + (rosso ? ' rosso' : '');
    b.setAttribute('role', 'menuitem');
    b.textContent = etichetta;
    if (nota_) { const s = document.createElement('small'); s.textContent = nota_; b.appendChild(s); }
    b.addEventListener('click', () => { chiudiMenu(); fn(); });
    m.appendChild(b);
    return b;
  }
  function apriMenu(ancora, costruisci) {
    menu.innerHTML = '';
    costruisci(menu);
    menu.hidden = false;
    const a = ancora.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    const x = Math.min(a.right - w, innerWidth - w - 8);
    let y = a.bottom + 6;
    if (y + h > innerHeight - 8) y = Math.max(8, a.top - h - 6);
    menu.style.left = Math.max(8, x) + 'px';
    menu.style.top = y + 'px';
    const primo = menu.querySelector('button');
    if (primo && !('ontouchstart' in window)) primo.focus({ preventScroll: true });
  }
  function chiudiMenu() { menu.hidden = true; menu.innerHTML = ''; }
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) chiudiMenu(); }, true);

  function menuNota(n, ancora) {
    apriMenu(ancora, m => {
      const c = document.createElement('div');
      c.className = 'campioni'; c.setAttribute('role', 'radiogroup'); c.setAttribute('aria-label', 'Colore');
      COLORI.forEach(col => {
        const b = document.createElement('button');
        b.className = 'campione'; b.dataset.colore = col; b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', n.color === col ? 'true' : 'false'); b.setAttribute('aria-label', NOMI_COLORI[col]); b.title = NOMI_COLORI[col];
        b.addEventListener('click', () => { chiudiMenu(); cambiaColore(n, col); });
        c.appendChild(b);
      });
      m.appendChild(c);
      m.appendChild(document.createElement('hr'));
      voce(m, n.pinned ? 'Togli la puntina' : 'Fissa in alto', '', () => fissa(n));
      voce(m, 'Rinomina', '', () => rinomina(n));
      voce(m, 'Duplica', '', () => duplica(n));
      voce(m, 'Elimina', '', () => elimina(n), true);
    });
  }
  function toccata(n) { n.rev++; DB.metti(n); programmaSync(); aggiornaStato(); if (vista() === 'bacheca') disegna(); }
  /* La puntina: la nota resta in testa alla bacheca, su tutti i dispositivi. Non cambia la data. */
  function fissa(n) {
    n.pinned = !n.pinned; n.metaDirty = true;
    if (n.pinned) appenaFissata = n.id;
    toccata(n);
    if (n === aperta) avviso(n.pinned ? 'Fissata in alto nella bacheca.' : 'Puntina tolta.');
  }
  function cambiaColore(n, col) {
    if (n.color === col) return;
    n.color = col; n.metaDirty = true;
    if (n === aperta) editor.dataset.colore = col;
    toccata(n);
  }
  async function rinomina(n) {
    if (n === aperta) conferma();
    const t = await chiedi({ titolo: 'Rinomina la nota', campo: { valore: titoloDi(n) }, ok: 'Rinomina' });
    if (t === null || !t.trim()) return;
    const nome = nomeFile(t, estensione(n.name));
    n.name = nome.toLowerCase() === n.name.toLowerCase() ? nome : nomeLibero(nome, n, ultimaIst);
    n.autoName = false; n.metaDirty = true;
    if (n === aperta) titolo.value = titoloDi(n);
    toccata(n);
  }
  function duplica(n) {
    if (n === aperta) conferma();
    const ora = Date.now();
    const c = Object.assign({}, n, { id: nuovoId(), path: null, sha: null,
      name: nomeLibero(nomeFile(titoloDi(n) + ' (copia)', estensione(n.name)), null, ultimaIst),
      autoName: false, pinned: false, bear: undefined, creata: ora, modified: ora, dirty: true, metaDirty: false, rev: 0 });
    note.set(c.id, c);
    toccata(c);
    avviso('Nota duplicata.');
  }
  async function elimina(n) {
    const ok = await chiedi({ titolo: 'Eliminare la nota?', testo: '«' + titoloDi(n) + '» ' +
      (collegato() && n.path ? 'verrà tolta dal repository; una copia resta comunque nella cronologia di GitHub.' : 'verrà cancellata da questo dispositivo.'),
      ok: 'Elimina', rosso: true });
    if (!ok) return;
    if (n === aperta) chiudiPerForza();
    const el = elNote.querySelector('.nota[data-id="' + CSS.escape(n.id) + '"]');
    if (el && !ridotto()) { el.classList.add('via'); await new Promise(r => setTimeout(r, 380)); }
    n.deleted = true;
    if (!n.path || !collegato()) { note.delete(n.id); DB.togli(n.id); }
    else { DB.metti(n); programmaSync(); }
    disegna(); aggiornaStato();
  }

  /* ============================================================ finestre e avvisi */
  function chiedi(o) {
    const d = $('#finestra'), f = $('#finestra-corpo');
    f.innerHTML = '<h2></h2>' + (o.testo ? '<p></p>' : '') + (o.campo ? '<input class="campo" id="finestra-campo">' : '') +
      (o.html || '') +
      '<div class="azioni">' + (o.soloOk ? '' : '<button class="tasto" type="button" id="finestra-no">' + esc(o.annulla || 'Annulla') + '</button>') +
      '<button class="tasto ' + (o.rosso ? 'rosso bordo' : 'pieno') + '" value="ok">' + esc(o.ok || 'Va bene') + '</button></div>';
    $('h2', f).textContent = o.titolo;
    if (o.testo) $('p', f).textContent = o.testo;
    const c = $('#finestra-campo');
    if (c) {
      c.type = o.campo.tipo || 'text'; c.value = o.campo.valore || ''; c.placeholder = o.campo.segnaposto || '';
      c.autocomplete = 'off'; c.spellcheck = false;
      if (o.campo.tipo === 'password') c.setAttribute('autocomplete', 'new-password');
    }
    if ($('#finestra-no')) $('#finestra-no').onclick = () => d.close('no');
    return new Promise(res => {
      d.onclose = () => res(d.returnValue === 'ok' ? (c ? c.value : true) : null);
      d.returnValue = 'no';
      d.showModal();
      if (c) { c.focus(); if (c.type !== 'password') c.select(); }
    });
  }
  function avviso(t, ms) {
    const a = document.createElement('div');
    a.className = 'avviso'; a.textContent = t;
    $('#avvisi').appendChild(a);
    setTimeout(() => a.remove(), ms || 3800);
  }

  /* ============================================================ stato */
  let inCorso = null, erroreSync = '', erroreChiave = false, bloccoPubblico = false;
  function aggiornaStato() {
    let s, t, d = '';
    const sosp = inSospeso() || !!timerScrivi;
    const quante = collegato() ? pendenti() : 0;
    if (!collegato()) { s = 'locale'; t = 'Solo qui'; d = 'Le note restano su questo dispositivo. Tocca per collegare GitHub.'; }
    else if (inCorso) {
      s = 'lavoro';
      t = ricevendo > 10 ? 'Ricevo… ' + ricevendo : quante > 10 ? 'Invio… ' + quante : 'Sincronizzo…';
      d = ricevendo > 10 ? 'Arrivano le note dal repository: ne mancano ' + ricevendo + '.' : quante > 10 ? 'Le note salgono su GitHub a gruppi: ne mancano ' + quante + '. Lascia BiaWrite aperta.' : '';
    }
    else if (bloccoPubblico) { s = 'attesa'; t = 'Salvato qui'; d = 'Il repository ' + S.repo + ' è diventato pubblico: BiaWrite non ci scrive finché non torna privato.'; }
    else if (erroreChiave) { s = 'attesa'; t = 'Salvato qui'; d = 'GitHub non accetta più la chiave (scaduta o revocata). Tocca per inserirne una nuova.'; }
    else if (!navigator.onLine) { s = 'attesa'; t = sosp ? 'Salvato qui' : 'Non in linea'; d = 'Senza rete: le modifiche restano su questo dispositivo e partono appena torna la connessione.'; }
    else if (!chiave) { s = 'attesa'; t = 'Salvato qui'; d = 'Le note sono chiuse: si sincronizzano dopo lo sblocco.'; }
    else if (erroreSync) { s = 'attesa'; t = 'Salvato qui'; d = erroreSync; }
    else if (sosp) { s = 'lavoro'; t = quante > 10 ? 'Salvo… ' + quante : 'Salvo…'; }
    else { s = 'ok'; t = 'Su GitHub'; d = 'Tutto è nel repository privato ' + S.repo + '.'; }
    elStato.dataset.s = s;
    elStato.lastElementChild.textContent = t;
    elStato.title = d;
    elStato.setAttribute('aria-label', t + (d ? '. ' + d : ''));
  }
  elStato.addEventListener('click', async () => {
    if (!collegato()) { mostraBenvenuto(); return; }
    if (erroreChiave) { cambiaChiave(); return; }
    if (!navigator.onLine || bloccoPubblico) { avviso(elStato.title, 6000); return; }
    conferma();
    await sync();
    avviso(erroreSync || (erroreChiave ? elStato.title : 'Sincronizzato con GitHub.'));
  });

  /* ============================================================ GitHub */
  let arch = null;            // archivio collegato
  let chiave = '';            // chiave d'accesso in chiaro: solo in memoria
  let verificato = false;     // in questa sessione si è già controllato che il repository sia privato
  function preparaArchivio() {
    arch = collegato() && S.repo ? Arch.crea({ repo: S.repo, chiave: () => chiave, cartella: CFG.cartella, ramo: S.ramo, altre: [CARTELLA_DIARIO] }) : null;
    verificato = false;
  }

  function applicaMeta(n, m) {
    const col = m && COLORI.includes(m.colore) ? m.colore : (n.color || coloreDa(n.path || n.id));
    const auto = !!(m && m.auto);
    const mod = (m && Date.parse(m.mod)) || n.modified;
    const fissata = !!(m && m.fissata);
    const creata = (m && (Date.parse(m.creata) || Date.parse(m.mod))) || n.creata;      // senza «creata» l'indice dice che coincide con la modifica
    const bear = (m && m.bear) || n.bear;
    if (col === n.color && auto === n.autoName && mod === n.modified && fissata === !!n.pinned && creata === n.creata && bear === n.bear) return false;
    n.color = col; n.autoName = auto; n.modified = mod; n.pinned = fissata; n.creata = creata; n.bear = bear;
    return true;
  }

  async function scarica(p, sha, n, m) {
    const t = await arch.leggi(sha);
    if (n && (n.dirty || n.deleted || n.path !== p)) return;           // nel frattempo è cambiata qui
    if (n && n === aperta && sporco) return;
    if (!n) {
      for (const o of note.values()) if (o.path === p) return;
      const ora = Date.now();
      n = { id: nuovoId(), path: p, sha, name: baseDi(p), content: '', color: '', creata: ora, modified: ora,
        autoName: false, dirty: false, metaDirty: false, deleted: false, rev: 0 };
      note.set(n.id, n);
    }
    n.content = t.replace(/\r\n?/g, '\n'); n.sha = sha; n.name = baseDi(p);
    applicaMeta(n, m);
    n.rev++;
    await DB.metti(n);
    if (n === aperta) { const s = $('#foglio').scrollTop; apriContenuto(n); $('#foglio').scrollTop = s; avviso('Nota aggiornata da un altro dispositivo.'); }
  }

  /* Porta in locale ciò che è cambiato nel repository. */
  async function applica(ist) {
    const meta = ist.indice.note || {};
    const perPercorso = new Map();
    note.forEach(n => { if (n.path) perPercorso.set(n.path, n); });
    const lavori = [], nuovi = [];
    for (const [p, sha] of ist.file) {
      const n = perPercorso.get(p);
      if (!n) { nuovi.push([p, sha]); continue; }
      if (n.deleted) continue;
      if (sha === n.sha) {
        if (!n.metaDirty && !n.dirty && applicaMeta(n, meta[baseDi(p)])) { n.rev++; DB.metti(n); if (n === aperta) aggiornaTesta(n); }
        continue;
      }
      if (!n.dirty) lavori.push(() => scarica(p, sha, n, meta[baseDi(p)]));    // se è cambiata anche qui, decide l'invio
    }
    for (const n of [...note.values()]) {
      if (!n.path || ist.file.has(n.path) || n.deleted) continue;
      const k = nuovi.findIndex(x => x[1] === n.sha);
      if (k >= 0) {                                                        // stessa versione con un altro nome: rinominata altrove
        const [p] = nuovi.splice(k, 1)[0];
        n.path = p;
        if (!n.metaDirty) { n.name = baseDi(p); applicaMeta(n, meta[baseDi(p)]); if (n === aperta) aggiornaTesta(n); }
        n.rev++; DB.metti(n);
        continue;
      }
      if (n.dirty || n.metaDirty) { n.path = null; n.sha = null; DB.metti(n); continue; }   // eliminata altrove ma cambiata qui: si ricrea
      note.delete(n.id); DB.togli(n.id);
      if (n === aperta) chiudiPerForza('La nota è stata eliminata da un altro dispositivo.');
    }
    for (const [p, sha] of nuovi) {
      // la stessa nota creata qui e mai inviata (per esempio la stessa importazione su due dispositivi)?
      let gemella = null;
      for (const o of note.values()) if (!o.path && !o.deleted && o.name.toLowerCase() === baseDi(p).toLowerCase()) { gemella = o; break; }
      if (gemella && await Arch.shaBlob(gemella.content) === sha) {
        gemella.path = p; gemella.sha = sha; gemella.name = baseDi(p); gemella.dirty = false;
        DB.metti(gemella);
        continue;
      }
      lavori.push(() => scarica(p, sha, null, meta[baseDi(p)]));
    }
    let k = 0, fatti_ = 0;
    ricevendo = lavori.length;
    if (ricevendo > 10) aggiornaStato();
    const operaio = async () => {
      while (k < lavori.length) {
        await lavori[k++]();
        ricevendo--; fatti_++;
        if (fatti_ % 25 === 0) { aggiornaStato(); if (fatti_ % 200 === 0 && vista() === 'bacheca' && menu.hidden) disegna(); }
      }
    };
    try { await Promise.all(Array.from({ length: 8 }, operaio)); } finally { ricevendo = 0; }
  }

  /* Invia in un commit le note da inviare (a lotti, se sono tante). */
  async function invia(ist) {
    const tutte = [...note.values()].filter(n => (n.deleted && n.path) || daInviare(n));
    if (!tutte.length) return null;
    const lotto = [];
    let peso = 0;
    for (const n of tutte) {
      const w = n.content.length + 200;
      if (lotto.length && (lotto.length >= 300 || peso + w > 1500000)) break;
      lotto.push(n); peso += w;
    }
    const indice = { formato: 1, note: Object.assign({}, ist.indice.note || {}) };
    const modifiche = [], fatti = [], conflitti = [];
    const ora = new Date();
    for (const n of lotto) {
      const rev = n.rev;
      if (n.deleted) {
        if (ist.file.has(n.path)) modifiche.push({ percorso: n.path, elimina: true });
        delete indice.note[baseDi(n.path)];
        fatti.push({ n, rev, elimina: true });
        continue;
      }
      const libero = nomeLibero(n.name, n, ist);
      if (libero !== n.name) { n.name = libero; n.metaDirty = true; }
      const dest = percorsoDi(n.name);
      const remoto = n.path ? ist.file.get(n.path) : undefined;
      if (n.dirty && remoto && n.sha && remoto !== n.sha) {
        // cambiata qui e anche altrove: la versione del repository si conserva in una copia
        const copia = nomeLibero(nomeFile(titoloDi(n) + ' (altra versione ' + stampaData(ora) + ')', estensione(n.name)), null, ist);
        modifiche.push({ percorso: percorsoDi(copia), sha: remoto });
        indice.note[copia] = { colore: 'grigio', auto: false, mod: ora.toISOString() };
        conflitti.push(titoloDi(n));
      }
      if (n.path && n.path !== dest) {                                       // rinomina
        if (ist.file.has(n.path)) modifiche.push({ percorso: n.path, elimina: true });
        delete indice.note[baseDi(n.path)];
      }
      let contenuto = null;
      if (n.dirty || !n.sha) { contenuto = n.content; modifiche.push({ percorso: dest, contenuto }); }
      else if (n.path !== dest || !remoto) modifiche.push({ percorso: dest, sha: n.sha });
      indice.note[n.name] = Object.assign({ colore: n.color, auto: n.autoName, mod: new Date(n.modified).toISOString() },
        n.creata && n.creata !== n.modified ? { creata: new Date(n.creata).toISOString() } : {}, n.pinned ? { fissata: true } : {}, n.bear ? { bear: n.bear } : {});
      fatti.push({ n, rev, dest, contenuto });
    }
    const nuovo = await arch.scrivi(ist, modifiche, indice, messaggio(fatti, tutte.length > lotto.length));
    conflitti.forEach(t => avviso('«' + t + '» era stata modificata anche altrove: l\'altra versione è salvata in una copia.', 7000));
    for (const f of fatti) {
      const n = f.n;
      if (f.elimina) { note.delete(n.id); await DB.togli(n.id); continue; }
      n.path = f.dest;
      if (f.contenuto !== null) n.sha = await Arch.shaBlob(f.contenuto);
      if (n.rev === f.rev) { n.dirty = false; n.metaDirty = false; }
      else if (f.contenuto !== null && n.content === f.contenuto) n.dirty = false;
      await DB.metti(n);
    }
    return { nuovo, altri: tutte.length > lotto.length };
  }
  /* Immagini e allegati: ogni file diventa un oggetto git (una richiesta ciascuno, con il freno
   * dell'archivio), poi un commit li mette nella cartella allegati/. Lo sha si ricorda subito,
   * così un commit interrotto non costringe a ricaricare. */
  async function inviaAllegati(ist) {
    if (!allegatiInAttesa) return null;
    const tutti = ((await DB.tutte('allegati')) || []).filter(a => !a.inviato);
    allegatiInAttesa = tutti.length;
    if (!tutti.length) return null;
    const lotto = tutti.slice(0, 40), modifiche = [];
    for (const a of lotto) {
      if (!a.sha || ist.allegati.get(a.percorso) !== a.sha) {
        if (!a.sha) { a.sha = await arch.caricaBlob(new Uint8Array(await a.dati.arrayBuffer())); await DB.metti(a, 'allegati'); }
        modifiche.push({ percorso: a.percorso, sha: a.sha });
      }
    }
    const nuovo = modifiche.length
      ? await arch.scrivi(ist, modifiche, ist.indice, 'BiaWrite: ' + (modifiche.length === 1 ? '1 allegato' : modifiche.length + ' allegati'))
      : ist;
    for (const a of lotto) { a.inviato = true; await DB.metti(a, 'allegati'); }
    allegatiInAttesa = tutti.length - lotto.length;
    aggiornaStato();
    return { nuovo };
  }
  function messaggio(fatti, altri) {
    if (fatti.length === 1 && !altri) {
      const f = fatti[0], t = '«' + titoloDi(f.n) + '»';
      if (f.elimina) return 'BiaWrite: elimina ' + t;
      if (!f.n.path) return 'BiaWrite: nuova nota ' + t;
      if (f.n.path !== f.dest) return 'BiaWrite: rinomina ' + t;
      return 'BiaWrite: modifica ' + t;
    }
    return 'BiaWrite: aggiorna ' + fatti.length + ' note';
  }

  /* Il diario viaggia nello stesso repository privato, in una cartella sua (fuori da quella delle note):
   * ciò che è stato caricato qui da un file sale; altrimenti vale la copia del repository. */
  async function sincronizzaDiario(ist) {
    if (!Cru || !copiaDiario()) return null;
    const d = Cru.stato(), remoto = ist.altri && ist.altri.get(PERCORSO_DIARIO);
    if (d.sporco && d.testo) {
      if (remoto !== d.sha) {
        const nuovo = await arch.scrivi(ist, [{ percorso: PERCORSO_DIARIO, contenuto: d.testo }], ist.indice, 'BiaWrite: aggiorna il diario alimentare');
        await Cru.segnaInviato();
        return nuovo;
      }
      await Cru.segnaInviato();
    } else if (remoto && remoto !== d.sha) {
      try { await Cru.imposta(await arch.leggi(remoto), { origine: 'remoto', sha: remoto }); }
      catch (e) { if (e instanceof Arch.Errore) throw e; console.warn('diario', e); }           // file non leggibile come diario: si lascia stare
    }
    return null;
  }

  async function giro() {
    if (!verificato) {
      const info = await arch.verifica();
      if (!info.privato) throw new Arch.Errore('pubblico');
      if (info.ramo !== S.ramo) { S.ramo = info.ramo; salvaS(); }
      verificato = true; bloccoPubblico = false;
    }
    conferma();
    for (let i = 0; i < 60; i++) {
      const ist = await arch.istantanea();
      ultimaIst = ist;
      await applica(ist);
      try {
        const rd = await sincronizzaDiario(ist);
        if (rd) { ultimaIst = rd; continue; }
        const ra = await inviaAllegati(ist);                                   // prima le immagini, poi le note che le citano
        if (ra) { ultimaIst = ra.nuovo; continue; }
        const r = await invia(ist);
        if (!r) return;
        ultimaIst = r.nuovo;
        if (!r.altri && !inSospeso()) return;
      } catch (e) {
        if (e.codice !== 'avanti') throw e;                                  // il ramo è andato avanti: si rilegge e si riprova
      }
    }
  }

  let ancora = false, timerRiprova = 0;
  /* Un solo giro alla volta; le richieste arrivate nel frattempo ne provocano un altro. */
  function sync() {
    if (!collegato() || !arch || !chiave || erroreChiave) { aggiornaStato(); return Promise.resolve(); }
    if (inCorso) { ancora = true; return inCorso; }
    clearTimeout(timerSync); clearTimeout(timerRiprova);
    timerSync = 0; primaInAttesa = 0;
    inCorso = (async () => {
      try {
        do { ancora = false; await giro(); } while (ancora);
        erroreSync = '';
      } catch (e) {
        let riprova = 0;
        switch (e.codice) {
          case 'chiave': erroreChiave = true; erroreSync = ''; break;
          case 'pubblico': bloccoPubblico = true; erroreSync = ''; break;
          case 'permesso': erroreSync = 'La chiave può leggere ma non scrivere: su GitHub, alla voce «Contents», serve «Read and write».'; break;
          case 'non-trovato': erroreSync = 'Il repository ' + S.repo + ' non è più raggiungibile con questa chiave.'; break;
          case 'limite': erroreSync = 'GitHub chiede di rallentare: riprovo tra qualche minuto.'; riprova = 120000; break;
          case 'rete': erroreSync = 'GitHub non è raggiungibile: le modifiche restano qui e ripartono da sole.'; riprova = 25000; break;
          case 'bloccato': erroreSync = ''; break;
          default: erroreSync = e.message; riprova = 60000; console.warn('BiaWrite', e);
        }
        if (riprova && inSospeso()) timerRiprova = setTimeout(sync, riprova);
      } finally {
        inCorso = null;
        aggiornaStato();
        if (vista() === 'bacheca' && menu.hidden) disegna();
      }
    })();
    aggiornaStato();
    return inCorso;
  }
  function programmaSync() {
    if (!collegato()) return;
    clearTimeout(timerSync);
    const ora = Date.now();
    if (!primaInAttesa) primaInAttesa = ora;
    timerSync = setTimeout(sync, ora - primaInAttesa > MASSIMA_ATTESA_MS ? 0 : QUIETE_MS);
  }

  /* ============================================================ chiave e blocco
   * Senza blocco la chiave sta in chiaro nell'archivio del browser.
   * Con il blocco: una chiave «maestra» casuale cifra (AES-GCM) la chiave di GitHub;
   * la maestra a sua volta è cifrata con il PIN (PBKDF2) e, se attivata, con l'impronta
   * (estensione PRF di WebAuthn). Sbloccando in uno dei due modi si riottiene la maestra. */
  let maestra = null;         // Uint8Array, solo in memoria e solo a dispositivo sbloccato
  const aes = (bytes, usi) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, usi || ['encrypt', 'decrypt']);
  async function sigilla(chiaveAes, dati) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return { iv: b64(iv), dati: b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chiaveAes, dati))) };
  }
  async function dissigilla(chiaveAes, busta) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(busta.iv) }, chiaveAes, deb64(busta.dati)));
  }
  async function daPin(pin, sale) {
    const k = await crypto.subtle.importKey('raw', utf8(pin), 'PBKDF2', false, ['deriveBits']);
    const bit = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deb64(sale), iterations: 310000 }, k, 512));
    return { verifica: b64(bit.slice(0, 32)), chiave: await aes(bit.slice(32)) };
  }
  async function daPrf(segreto) {
    const k = await crypto.subtle.importKey('raw', segreto, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8('BiaWrite impronta') },
      k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function salvaChiave(t) {
    chiave = t;
    if (S.lock && maestra) { S.tokenCifrato = await sigilla(await aes(maestra), utf8(t)); delete S.token; }
    else { S.token = t; delete S.tokenCifrato; }
    salvaS();
  }
  async function usaMaestra(m) {
    maestra = m;
    chiave = S.tokenCifrato ? new TextDecoder().decode(await dissigilla(await aes(m), S.tokenCifrato)) : (S.token || '');
  }

  async function bioDisponibile() {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
    catch (e) { return false; }
  }
  async function bioRegistra() {
    const saleBio = crypto.getRandomValues(new Uint8Array(32));
    const c = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'BiaWrite' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: S.login || 'BiaWrite', displayName: 'BiaWrite' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: saleBio } } }, timeout: 60000, attestation: 'none' } });
    const est = c.getClientExtensionResults().prf || {};
    if (!est.enabled && !(est.results && est.results.first)) throw new Error('prf');
    let segreto = est.results && est.results.first;
    const id = new Uint8Array(c.rawId);
    if (!segreto) segreto = await bioSegreto(id, saleBio);
    S.lock.bio = { cred: b64(id), sale: b64(saleBio), busta: await sigilla(await daPrf(segreto), maestra) };
    salvaS();
  }
  async function bioSegreto(id, sale) {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id }], extensions: { prf: { eval: { first: sale } } } } });
    const r = (a.getClientExtensionResults().prf || {}).results;
    if (!r || !r.first) throw new Error('prf');
    return r.first;
  }

  async function impostaPin() {
    if (!(window.crypto && crypto.subtle)) { avviso('Il blocco richiede una pagina servita in https.'); return false; }
    const p = await chiedi({ titolo: S.lock ? 'Nuovo PIN' : 'Scegli un PIN', campo: { tipo: 'password', segnaposto: 'Almeno 4 caratteri' },
      testo: 'Servirà per aprire BiaWrite su questo dispositivo, e cifra la chiave di GitHub. Cifre o lettere, come preferisci.', ok: 'Avanti' });
    if (p === null) return false;
    if (p.length < 4) { avviso('Il PIN deve avere almeno 4 caratteri.'); return false; }
    const r = await chiedi({ titolo: 'Ripeti il PIN', campo: { tipo: 'password' }, ok: 'Imposta' });
    if (r === null) return false;
    if (r !== p) { avviso('I due PIN non coincidono: non è cambiato nulla.'); return false; }
    if (!maestra) maestra = crypto.getRandomValues(new Uint8Array(32));
    const sale = b64(crypto.getRandomValues(new Uint8Array(16)));
    const d = await daPin(p, sale);
    S.lock = { sale, verifica: d.verifica, kPin: await sigilla(d.chiave, maestra), bio: S.lock ? S.lock.bio : null };
    if (chiave) await salvaChiave(chiave); else salvaS();
    avviso('PIN impostato.');
    return true;
  }
  function togliBlocco() {
    S.lock = null; maestra = null;
    if (chiave) S.token = chiave;
    delete S.tokenCifrato;
    salvaS();
  }
  async function attivaBio() {
    try { await bioRegistra(); avviso('Impronta o volto attivati.'); return true; }
    catch (e) {
      avviso(e && e.message === 'prf' ? 'Questo browser non sa proteggere la chiave con l\'impronta: resta il PIN.' : 'Attivazione non riuscita o annullata.', 6000);
      return false;
    }
  }

  let errori = 0, fermoFino = 0, nascostoDa = 0;
  function chiudiTutto() {                       // al riblocco la chiave esce dalla memoria
    conferma();
    if (S.lock) { chiave = ''; maestra = null; }
    mostraBlocco();
  }
  function mostraBlocco() {
    $('#blocco').hidden = false;
    $('#campo-pin').value = ''; $('#errore-pin').textContent = '';
    $('#biometria').hidden = !(S.lock && S.lock.bio);
    if (S.lock && S.lock.bio) sbloccaBio(true); else setTimeout(() => $('#campo-pin').focus(), 50);
  }
  function sbloccato() {
    errori = 0;
    $('#blocco').hidden = true;
    if (vista() === 'avvio') entra();
    else if (collegato()) sync();
  }
  async function sbloccaBio(automatico) {
    try {
      const b = S.lock.bio;
      const segreto = await bioSegreto(deb64(b.cred), deb64(b.sale));
      await usaMaestra(await dissigilla(await daPrf(segreto), b.busta));
      sbloccato();
    } catch (e) {
      if (!automatico) $('#errore-pin').textContent = 'Riconoscimento non riuscito: usa il PIN.';
      $('#campo-pin').focus();
    }
  }
  $('#biometria').addEventListener('click', () => sbloccaBio(false));
  $('#modulo-blocco').addEventListener('submit', async e => {
    e.preventDefault();
    const c = $('#campo-pin'), err = $('#errore-pin');
    if (Date.now() < fermoFino) { err.textContent = 'Troppi tentativi: riprova tra ' + Math.ceil((fermoFino - Date.now()) / 1000) + ' secondi.'; return; }
    if (!c.value) return;
    const d = await daPin(c.value, S.lock.sale);
    c.value = '';
    if (d.verifica === S.lock.verifica) {
      try { await usaMaestra(await dissigilla(d.chiave, S.lock.kPin)); sbloccato(); return; }
      catch (x) { err.textContent = 'Archivio del blocco danneggiato: usa «PIN dimenticato».'; return; }
    }
    errori++;
    if (errori >= 4) fermoFino = Date.now() + Math.min(300, 5 * 2 ** (errori - 4)) * 1000;
    err.textContent = 'PIN errato.';
    const b = $('#modulo-blocco'); b.classList.remove('scossa'); void b.offsetWidth; b.classList.add('scossa');
    c.focus();
  });
  $('#pin-perso').addEventListener('click', async () => {
    const ok = await chiedi({ titolo: 'Azzerare BiaWrite su questo dispositivo?', rosso: true, ok: 'Azzera',
      testo: 'Il PIN non si può recuperare. Azzerando si cancellano da questo dispositivo il blocco, la chiave di GitHub e la copia locale delle note; poi servirà di nuovo una chiave. Le note già su GitHub restano intatte, quelle non ancora sincronizzate vanno perse.' });
    if (ok) azzera();
  });
  async function azzera() {
    await DB.svuota(); note.clear(); aperta = null; chiave = ''; maestra = null;
    if (Cru) await Cru.svuota();
    try { localStorage.removeItem(K_BOZZA); } catch (e) { /* niente */ }
    S = {}; salvaS();
    location.reload();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      nascostoDa = Date.now();
      salvaDiCorsa();
      if (collegato() && inSospeso()) sync();
    } else {
      if (S.lock && nascostoDa && Date.now() - nascostoDa > RIBLOCCO_MS && $('#blocco').hidden && vista() !== 'avvio') chiudiTutto();
      else if (collegato() && $('#blocco').hidden && vista() !== 'avvio') sync();
      if (vista() === 'bacheca') { if (!$('#plancia').hidden) disegna(); aggiornaMeteo(); }          // la data può essere cambiata, il meteo invecchiato
    }
  });
  /* Se la pagina viene chiusa di colpo, il testo aperto va anche in localStorage (scrittura sincrona). */
  function salvaDiCorsa() {
    if (!aperta) return;
    const fatto = conferma();
    const n = aperta;
    if (!fatto) return;
    try { localStorage.setItem(K_BOZZA, JSON.stringify({ id: n.id, content: n.content, name: n.name, autoName: n.autoName, t: n.modified })); } catch (e) { return; }
    Promise.resolve(fatto).then(() => { try { localStorage.removeItem(K_BOZZA); } catch (e) { /* niente */ } });
  }
  window.addEventListener('pagehide', salvaDiCorsa);
  window.addEventListener('online', () => { aggiornaStato(); if (collegato()) sync(); });
  window.addEventListener('offline', aggiornaStato);

  /* ============================================================ collegamento a GitHub */
  function dispositivo() {
    const u = navigator.userAgent;
    if (/iPhone/.test(u)) return 'iPhone';
    if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Android/.test(u)) return 'Android';
    if (/Macintosh/.test(u)) return 'Mac';
    if (/Windows/.test(u)) return 'Windows';
    if (/Linux/.test(u)) return 'Linux';
    return 'browser';
  }
  function linkChiave() {
    const d = new Date();
    const nome = 'BiaWrite ' + dispositivo() + ' ' + due(d.getDate()) + '-' + due(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + due(d.getHours()) + '.' + due(d.getMinutes());
    return 'https://github.com/settings/personal-access-tokens/new?name=' + encodeURIComponent(nome.slice(0, 40)) +
      '&description=' + encodeURIComponent('Accesso di BiaWrite al repository delle note, da ' + dispositivo() + '.') +
      '&expires_in=none&contents=write';
  }
  const linkRepo = () => 'https://github.com/new?name=' + encodeURIComponent((CFG.repository || 'biawrite-note').split('/').pop()) +
    '&visibility=private&description=' + encodeURIComponent('Note di BiaWrite');

  function messaggioCollega(e, repo) {
    switch (e && e.codice) {
      case 'chiave': return 'GitHub non riconosce la chiave: controlla di averla copiata per intero.';
      case 'non-trovato': return 'Il repository «' + repo + '» non esiste, oppure la chiave non può vederlo: creando la chiave, alla voce «Repository access», va scelto proprio questo repository.';
      case 'pubblico': return 'Il repository «' + repo + '» è pubblico: chiunque potrebbe leggere le note. Rendilo privato su GitHub (Settings → General → Change visibility) e riprova.';
      case 'permesso': return 'La chiave può leggere ma non scrivere: creandola, alla voce «Contents», serve «Read and write».';
      case 'rete': return 'GitHub non è raggiungibile: controlla la connessione.';
      case 'limite': return 'GitHub chiede di attendere qualche minuto prima di riprovare.';
      default: return 'Collegamento non riuscito: ' + ((e && e.message) || 'errore sconosciuto') + '.';
    }
  }
  /* Controlla chiave e repository; se tutto va, restituisce { repo, ramo, login }. */
  async function provaCollegamento(repo, t) {
    repo = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    let login = '';
    if (!repo.includes('/')) {
      login = await Arch.crea({ repo: 'x/x', chiave: t }).utente();
      repo = login + '/' + repo;
    }
    const a = Arch.crea({ repo, chiave: t, cartella: CFG.cartella });
    const info = await a.verifica();
    if (!info.privato) throw new Arch.Errore('pubblico');
    await a.prepara();
    return { repo: info.nome, ramo: info.ramo, login: login || info.nome.split('/')[0] };
  }

  function mostraBenvenuto() {
    $('#benvenuto').hidden = false;
    $('#link-repo').href = linkRepo();
    $('#link-chiave').href = linkChiave();
    $('#campo-repo').value = S.repo || CFG.repository || '';
    $('#campo-chiave').value = '';
    $('#errore-collega').textContent = '';
    $('#collega').disabled = false;
    $('#solo-locale').textContent = S.mode === 'local' ? 'Resta solo su questo dispositivo' : 'Prova senza GitHub, solo su questo dispositivo';
  }
  $('#link-chiave').addEventListener('click', () => { $('#link-chiave').href = linkChiave(); });
  $('#modulo-collega').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#errore-collega'), b = $('#collega');
    const repo = $('#campo-repo').value, t = $('#campo-chiave').value.trim();
    if (!repo.trim()) { err.textContent = 'Scrivi il nome del repository delle note.'; return; }
    if (!t) { err.textContent = 'Incolla la chiave creata su GitHub.'; return; }
    b.disabled = true; err.textContent = 'Verifico…';
    let r;
    try { r = await provaCollegamento(repo, t); }
    catch (x) { err.textContent = messaggioCollega(x, repo.trim()); b.disabled = false; return; }
    const prima = S.mode;
    S.mode = 'github'; S.repo = r.repo; S.ramo = r.ramo; S.login = r.login;
    await salvaChiave(t);
    erroreChiave = false; erroreSync = '';
    preparaArchivio();
    $('#benvenuto').hidden = true;
    note.forEach(n => { if (!n.path && n.content.trim()) n.dirty = true; });      // le note nate qui salgono nel repository
    entra();
    if (prima !== 'github' && !S.lock) offriBlocco();
  });
  $('#solo-locale').addEventListener('click', () => {
    if (!S.mode) { S.mode = 'local'; salvaS(); }
    $('#benvenuto').hidden = true;
    if (vista() === 'avvio') entra();
  });
  async function offriBlocco() {
    const ok = await chiedi({ titolo: 'Proteggere la chiave su questo dispositivo?', ok: 'Imposta un PIN', annulla: 'Non ora',
      testo: 'Con un PIN la chiave di GitHub resta cifrata e BiaWrite si apre solo a te; poi, se il dispositivo lo consente, anche con impronta o volto. Puoi farlo anche più tardi dalle impostazioni.' });
    if (!ok || !(await impostaPin())) return;
    if (await bioDisponibile()) {
      const si = await chiedi({ titolo: 'Usare anche impronta o volto?', ok: 'Attiva', annulla: 'Solo PIN', testo: 'Il dispositivo ti chiederà una conferma adesso.' });
      if (si) await attivaBio();
    }
  }
  async function cambiaChiave() {
    const t = await chiedi({ titolo: 'Nuova chiave', campo: { tipo: 'password', segnaposto: 'github_pat_…' },
      html: '<p class="nota-bene">Creane una su GitHub con lo stesso repository (' + esc(S.repo) + ') e il permesso «Contents: Read and write», poi incollala qui. <a href="' + escA(linkChiave()) + '" target="_blank" rel="noopener">Crea la chiave</a></p>',
      ok: 'Usa questa chiave' });
    if (t === null || !t.trim()) return;
    try {
      const r = await provaCollegamento(S.repo, t.trim());
      if (r.repo.toLowerCase() !== S.repo.toLowerCase()) throw new Error('repository diverso');
    } catch (x) { avviso(messaggioCollega(x, S.repo), 8000); return; }
    await salvaChiave(t.trim());
    erroreChiave = false; erroreSync = '';
    preparaArchivio();
    avviso('Chiave aggiornata.');
    sync();
  }

  /* ============================================================ importazione */
  const selFile = $('#scegli-file'), selCartella = $('#scegli-cartella');
  const puoCartella = 'webkitdirectory' in selCartella && matchMedia('(pointer: fine)').matches;
  function sceltaImporta(ancora) {
    if (!puoCartella) { selFile.click(); return; }
    apriMenu(ancora, m => {
      voce(m, 'Scegli i file…', '.md .txt .zip Bear', () => selFile.click());
      voce(m, 'Scegli una cartella…', '', () => selCartella.click());
    });
  }
  $('#importa').addEventListener('click', e => sceltaImporta(e.currentTarget));
  selFile.addEventListener('change', () => { const f = [...selFile.files]; selFile.value = ''; if (f.length) importa(f); });
  selCartella.addEventListener('change', () => { const f = [...selCartella.files]; selCartella.value = ''; if (f.length) importa(f); });

  /* trascinare file o cartelle sulla bacheca */
  const bacheca = $('#bacheca');
  let dentroTrascina = 0;
  const conFile = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  bacheca.addEventListener('dragenter', e => { if (!conFile(e) || vista() !== 'bacheca') return; e.preventDefault(); dentroTrascina++; bacheca.classList.add('trascina'); });
  bacheca.addEventListener('dragover', e => { if (conFile(e) && vista() === 'bacheca') { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  bacheca.addEventListener('dragleave', () => { if (--dentroTrascina <= 0) { dentroTrascina = 0; bacheca.classList.remove('trascina'); } });
  bacheca.addEventListener('drop', async e => {
    if (!conFile(e)) return;
    e.preventDefault();
    dentroTrascina = 0; bacheca.classList.remove('trascina');
    const voci = [...e.dataTransfer.items].map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    let elementi = [];
    if (voci.some(Boolean)) { for (const v of voci) elementi.push(...await Imp.daVoceTrascinata(v, '')); }
    else elementi = [...e.dataTransfer.files];
    if (elementi.length) importa(elementi);
  });

  /* Testo «normalizzato» per riconoscere una nota già presente anche se importata in un altro formato. */
  const normale = t => t.replace(/<mark>([^<]*)<\/mark>/g, '==$1==').replace(/\s+/g, ' ').trim().toLowerCase();
  const quanti = n => n === 1 ? '1 nota' : n.toLocaleString('it-IT') + ' note';

  async function importa(elementi) {
    if (vista() === 'editor') history.back();
    avviso('Leggo i file…', 2500);
    let esame;
    try {
      const { voci, scartati } = await Imp.raccogli(elementi);
      esame = await Imp.esamina(voci, Core);
      esame.scartati.unshift(...scartati);
    } catch (e) { avviso('Non sono riuscito a leggere i file: ' + e.message, 6000); return; }

    // doppioni: già in BiaWrite (con lo stesso testo, anche in un altro formato) o ripetuti nella stessa scelta
    const perTesto = new Map(), perBear = new Map();
    note.forEach(n => { if (!n.deleted) { perTesto.set(normale(n.content), n); if (n.bear) perBear.set(n.bear, n); } });
    const toccate = [];                                     // importate da Bear e poi modificate qui: restano come sono
    // Dentro un backup di Bear ogni nota conta, anche se uguale a un'altra: Bear la teneva come nota a sé.
    // Fra file sciolti si salta solo lo stesso file scelto due volte (stesso nome, stesso testo esatto).
    // Una nota già presente può corrispondere a una sola nota importata.
    const visti = new Set(), usate = new Set(), nuove_ = [], gia = [];
    for (const x of esame.pronte) {
      if (x.origine !== 'bear') {
        const k = x.titolo.toLowerCase() + '\u0000' + x.testo;
        if (visti.has(k)) continue;
        visti.add(k);
      }
      const varianti = [normale(x.testo)];
      if (x.grezzo) varianti.push(normale(x.grezzo), normale(x.grezzo.replace(/^# /, '')));
      if (x.tipo === 'txt' && x.origine !== 'bear') varianti.push(normale(Core.htmlToMd(Core.textToHtml(x.testo))));
      const corto = varianti[0].length < 20;
      let n = null;
      const stessa = x.bear && perBear.get(x.bear);
      if (stessa && !usate.has(stessa)) {
        usate.add(stessa);
        if (varianti.includes(normale(stessa.content))) gia.push({ x, n: stessa }); else toccate.push(x);
        continue;
      }
      for (const v of varianti) {
        const o = perTesto.get(v);
        if (o && !usate.has(o) && (!corto || titoloDi(o).toLowerCase() === x.titolo.toLowerCase())) { n = o; break; }
      }
      if (n) { usate.add(n); gia.push({ x, n }); } else nuove_.push(x);
    }

    const bear = esame.pronte.some(x => x.origine === 'bear');
    const vive = nuove_.filter(x => !x.cestino), cestino = nuove_.filter(x => x.cestino);
    const giaBear = gia.filter(g => g.x.origine === 'bear');
    const immagini = l => l.reduce((t, x) => t + (x.allegati ? x.allegati.length : 0), 0);
    const altri = esame.scartati.length;
    let html = '';
    if (bear) {
      const fissate = vive.filter(x => x.fissata).length, esatte = vive.filter(x => x.tipo === 'txt').length, img = immagini(vive);
      html += '<p>Dal backup di Bear: <b>' + quanti(vive.length) + '</b>, con le loro date di creazione e di modifica' +
        (fissate ? '; ' + fissate + ' con la puntina' : '') + (img ? '; ' + img + (img === 1 ? ' immagine' : ' immagini') : '') + '.</p>' +
        '<p class="nota-bene">Gli a capo di Bear restano a capo e il titolo resta la prima riga, come in Bear.' +
        (esatte ? ' ' + quanti(esatte) + ' con codice o formule LaTeX ' + (esatte === 1 ? 'resta' : 'restano') + ' testo esatto, carattere per carattere.' : '') + '</p>';
      if (cestino.length) {
        const ic = immagini(cestino);
        html += '<label class="spunta"><input type="checkbox" id="bear-cestino"> Importa anche ' + (cestino.length === 1 ? 'la nota che è' : 'le ' + cestino.length + ' note che sono') +
          ' nel cestino di Bear' + (ic ? ' (con ' + ic + (ic === 1 ? ' immagine)' : ' immagini)') : '') + '</label>';
      }
      if (giaBear.length) {
        html += '<label class="spunta"><input type="checkbox" id="bear-aggiorna" checked> ' + (giaBear.length === 1 ? 'Una nota è' : giaBear.length + ' note sono') +
          ' già in BiaWrite con lo stesso testo: ' + (giaBear.length === 1 ? 'aggiornala' : 'aggiornale') + ' con la versione di Bear (date, puntina, a capo)</label>';
      }
    } else if (vive.length) {
      const conta = t => vive.filter(x => x.origine === t).length;
      const dett = [['md', 'Markdown'], ['txt', 'di testo'], ['html', 'pagine web']].filter(([t]) => conta(t)).map(([t, n]) => conta(t) + ' ' + n).join(', ');
      html += '<p>Pronte: <b>' + quanti(vive.length) + '</b>' + (dett ? ' (' + esc(dett) + ')' : '') + '. Ognuna conserva il nome del file e la sua data.</p>';
    }
    if (!vive.length && !cestino.length && !giaBear.length) html += '<p>Nessuna nota nuova da importare.</p>';
    if (toccate.length) html += '<p class="nota-bene">' + (toccate.length === 1 ? 'Una nota era già stata importata e l\'hai modificata qui: resta' : toccate.length + ' note erano già state importate e le hai modificate qui: restano') + ' come sono.</p>';
    const giaAltre = gia.length - giaBear.length;
    if (giaAltre || altri) {
      const saltati = bear ? (altri === 1 ? ' nota saltata' : ' note saltate') : (altri === 1 ? ' file saltato' : ' file saltati');
      html += '<p class="nota-bene">' + [giaAltre ? (giaAltre === 1 ? '1 già presente' : giaAltre + ' già presenti') : '', altri ? altri + saltati : ''].filter(Boolean).join(', ') + '.</p>';
      if (altri) {
        html += '<details class="elenco-saltati"><summary>' + (bear ? 'Quali e perché' : 'Quali file sono stati saltati') + '</summary><ul>' +
          esame.scartati.slice(0, 80).map(x => '<li>' + esc(x.percorso) + ' — ' + esc(x.motivo) + '</li>').join('') +
          (altri > 80 ? '<li>e altri ' + (altri - 80) + '</li>' : '') + '</ul></details>';
      }
    }
    if (vive.some(x => x.tipo === 'txt' && x.origine === 'txt')) {
      html += '<label class="spunta"><input type="checkbox" id="txt-in-md"> Trasforma le note di testo (.txt) in note formattabili (.md)</label>';
    }
    const scelte = iniziali => {                          // iniziali: le caselle come appariranno all'apertura
      const casella = (id, prima) => { const e = $('#' + id); return !iniziali && e ? e.checked : prima; };
      const c = casella('bear-cestino', false), a = casella('bear-aggiorna', true);
      return { nuove: vive.concat(c ? cestino : []), aggiorna: a ? giaBear.filter(g => !g.x.cestino || c) : [] };
    };
    const etichetta = iniziali => { const s_ = scelte(iniziali), k = s_.nuove.length + s_.aggiorna.length; return k ? 'Importa ' + quanti(k) : 'Chiudi'; };
    const nulla = !vive.length && !cestino.length && !giaBear.length;
    const attesa = chiedi({ titolo: bear ? 'Importa da Bear' : 'Importa le vecchie note', html, ok: etichetta(true), soloOk: nulla });
    $('#finestra-corpo').addEventListener('change', () => { const b = $('#finestra-corpo button[value="ok"]'); if (b) b.textContent = etichetta(); });
    const ok = await attesa;
    const sc = scelte();
    if (!ok || nulla || (!sc.nuove.length && !sc.aggiorna.length)) return;
    const inMd = !!($('#txt-in-md') && $('#txt-in-md').checked);

    avviso('Importo…', 2500);
    const ora = Date.now();
    const occupati = new Set();
    note.forEach(n => { if (!n.deleted) occupati.add(n.name.toLowerCase()); });
    if (ultimaIst) for (const p of ultimaIst.file.keys()) occupati.add(baseDi(p).toLowerCase());
    const libero = (nome, vecchio) => {
      if (vecchio && vecchio.toLowerCase() === nome.toLowerCase()) return vecchio;
      const m = nome.match(/^(.*?)(\.[^.]+)$/);
      let x = nome, k = 1;
      while (occupati.has(x.toLowerCase())) { k++; x = m[1] + ' (' + k + ')' + m[2]; }
      occupati.add(x.toLowerCase());
      return x;
    };
    const allegati = [];
    /* Il testo e i metadati di una nota importata; le immagini vanno in allegati/<id>/ e il testo le cita da lì. */
    async function prepara(x) {
      let tipo = x.tipo, contenuto = x.testo;
      if (tipo === 'txt' && inMd && x.origine === 'txt') { tipo = 'md'; contenuto = Core.htmlToMd(Core.textToHtml(x.testo)); }
      if (x.allegati && x.allegati.length) {
        const id = x.id || coloreDa(x.percorso) + Math.abs([...x.percorso].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36);
        contenuto = contenuto.replace(/(\]\(\s*<?|src=["'])assets\//g, '$1allegati/' + id + '/');
        for (const a of x.allegati) {
          try {
            const dati = await a.voce.leggi();
            allegati.push({ percorso: CFG.cartella + '/allegati/' + id + '/' + a.nome, tipo: Imp.mime(a.nome), dati: new Blob([dati], { type: Imp.mime(a.nome) }), inviato: false, sha: null });
          } catch (e) { /* allegato illeggibile: il testo lo cita comunque */ }
        }
      }
      const quando_ = x.data && x.data < ora + 86400000 ? x.data : ora;
      const daBear = x.origine === 'bear';
      return { tipo, contenuto, quando_, creata: x.creata || quando_, daBear,                // le date di Bear come sono, anche se incoerenti
        titolo: daBear ? (primaRiga(contenuto, tipo) || nomeData(x.creata || quando_)) : x.titolo };
    }
    const nuove = [];
    sc.nuove.sort((a, b) => (a.data || ora) - (b.data || ora));
    for (const x of sc.nuove) {
      const p_ = await prepara(x);
      const n = { id: nuovoId(), path: null, sha: null, name: libero(nomeFile(p_.titolo, p_.tipo)), content: p_.contenuto,
        color: coloreDa(x.percorso), creata: p_.creata, modified: p_.quando_, autoName: p_.daBear, pinned: !!x.fissata,
        bear: x.bear || undefined, dirty: true, metaDirty: false, deleted: false, rev: 1 };
      note.set(n.id, n);
      nuove.push(n);
    }
    for (const { x, n } of sc.aggiorna) {                  // la stessa nota, già presente: prende testo e metadati di Bear
      const p_ = await prepara(x);
      const proposto = nomeFile(p_.titolo, p_.tipo);
      const radice = n.name.replace(/ \(\d+\)(\.[^.]+)$/, '$1');   // «NATALE (2).md» resta tale se il titolo è «NATALE»
      if (radice.toLowerCase() !== proposto.toLowerCase()) { occupati.delete(n.name.toLowerCase()); n.name = libero(proposto); }
      n.content = p_.contenuto; n.autoName = true;
      n.modified = p_.quando_; n.creata = p_.creata; n.pinned = !!x.fissata; n.bear = x.bear || n.bear;
      n.dirty = true; n.metaDirty = true; n.rev++;
      nuove.push(n);
    }
    await DB.mettiTutte(nuove);
    if (allegati.length) { await DB.mettiTutte(allegati, 'allegati'); allegatiInAttesa += allegati.length; }
    elCerca.value = ''; limite = PASSO;
    disegna();
    aggiornaStato();
    const k = sc.nuove.length, a = sc.aggiorna.length;
    avviso((k ? quanti(k) + (k === 1 ? ' importata' : ' importate') : '') + (k && a ? ', ' : '') + (a ? quanti(a) + (a === 1 ? ' aggiornata' : ' aggiornate') : '') +
      (collegato() ? ': le carico su GitHub, a gruppi. Lascia BiaWrite aperta finché lo stato dice «Su GitHub».' : '.'), 8000);
    if (collegato()) sync();
  }

  /* ============================================================ impostazioni (pannello) */
  async function pannello() {
    const d = $('#pannello'), c = $('#pannello-corpo');
    const bio = await bioDisponibile();
    const gh = collegato();
    const url = S.repo ? 'https://github.com/' + S.repo + '/tree/' + encodeURIComponent(S.ramo || 'main') + '/' + CFG.cartella : '';
    c.innerHTML = '<h2>Impostazioni</h2>' +
      '<h3>GitHub</h3>' +
      (gh ? '<p>Collegato al repository privato <b>' + esc(S.repo) + '</b>. Le note stanno nella cartella «' + esc(CFG.cartella) + '».</p>' +
        '<div class="fila"><button class="tasto bordo" data-a="sync">Sincronizza ora</button><a class="tasto bordo" href="' + escA(url) + '" target="_blank" rel="noopener">Apri su GitHub</a>' +
        '<button class="tasto bordo" data-a="chiave">Cambia chiave</button><button class="tasto rosso" data-a="scollega">Scollega</button></div>'
        : '<p>Non collegato: le note restano soltanto su questo dispositivo.</p><div class="fila"><button class="tasto pieno" data-a="collega">Collega GitHub</button></div>') +
      '<h3>Importa</h3>' +
      '<p class="nota-bene">Porta in BiaWrite le note di un altro programma: file .md, .txt, .html, una cartella o un archivio .zip. Sul computer puoi anche trascinarli sulla bacheca.</p>' +
      '<div class="fila"><button class="tasto bordo" data-a="importa">Importa note…</button></div>' +
      '<h3>Blocco su questo dispositivo</h3>' +
      '<p class="nota-bene">' + (S.lock ? 'BiaWrite si apre con il PIN' + (S.lock.bio ? ', oppure con impronta o volto' : '') + ', la chiave di GitHub è cifrata, e tutto si richiude dopo cinque minuti in secondo piano.'
        : 'Nessun blocco: chi usa questo dispositivo può aprire le note, e la chiave di GitHub è conservata in chiaro.') + '</p>' +
      '<div class="fila"><button class="tasto bordo" data-a="pin">' + (S.lock ? 'Cambia PIN' : 'Imposta un PIN') + '</button>' +
      (S.lock && bio ? '<button class="tasto bordo" data-a="bio">' + (S.lock.bio ? 'Disattiva impronta o volto' : 'Attiva impronta o volto') + '</button>' : '') +
      (S.lock ? '<button class="tasto rosso" data-a="sblocca">Togli il blocco</button>' : '') + '</div>' +
      '<h3>Aspetto</h3>' +
      '<div class="fila"><select class="campo" id="stile" aria-label="Stile"><option value="scrivania">Stile scrivania: foglietti, cartelle, carta</option><option value="terminale">Stile terminale: caratteri fissi, riquadri, righe di comando</option></select></div>' +
      '<div class="fila"><select class="campo" id="tema" aria-label="Giorno o notte"><option value="auto">Giorno e notte come il dispositivo</option><option value="giorno">Sempre giorno</option><option value="notte">Sempre notte</option></select></div>' +
      '<div class="sfondi" role="radiogroup" aria-label="Sfondo">' + [['salvia', 'Salvia', '#E2EAE0'], ['cielo', 'Cielo', '#DFE8F0'], ['cipria', 'Cipria', '#EFE3E2'], ['lavanda', 'Lavanda', '#E6E2EF'], ['menta', 'Menta', '#DBEBE5'], ['quadretti', 'Quadretti', '#E7ECEC']]
        .map(([v, t, c]) => '<button role="radio" data-v="' + v + '" title="' + t + '" aria-label="' + t + '" aria-checked="' + ((S.sfondo || 'salvia') === v) + '" style="--s:' + c + '"></button>').join('') + '</div>' +
      '<div class="fila"><select class="campo" id="ordine" aria-label="Bacheca"><option value="mesi">Bacheca in cartelle, una per mese</option><option value="tutte">Bacheca con tutte le note insieme</option></select></div>' +
      (Cru ? '<div class="fila"><select class="campo" id="mostra-diario" aria-label="Diario alimentare"><option value="si">Pulsante «Diario alimentare» sulla plancia</option><option value="no">Senza il diario alimentare</option></select></div>' +
        '<div class="fila"><select class="campo" id="copia-diario" aria-label="Copia del diario"><option value="si">Diario: copia nel repository privato, per gli altri dispositivi</option><option value="no">Diario: solo su questo dispositivo, nessuna copia</option></select></div>' +
        '<p class="nota-bene">Il file del diario è sempre e solo letto: BiaWrite non lo può modificare.</p>' : '') +
      (Meteo ? '<h3>Meteo</h3>' +
        '<div class="fila"><input class="campo" id="meteo-cerca" type="search" placeholder="Località, per esempio Napoli" aria-label="Località per il meteo" autocomplete="off"><button class="tasto bordo" id="meteo-trova">Cerca</button></div>' +
        '<div id="meteo-esiti" class="esiti" aria-live="polite"></div>' +
        '<div class="fila"><button class="tasto bordo" id="meteo-qui">Usa la posizione di questo dispositivo</button><button class="tasto" id="meteo-via">Nessun meteo</button></div>' +
        '<p class="nota-bene" id="meteo-dove"></p>' : '') +
      '<h3>Scrittura</h3>' +
      '<div class="fila"><select class="campo" id="spazio" aria-label="Spazio fra i capoversi">' +
        '<option value="stretto">Capoversi appena staccati</option><option value="nessuno">Capoversi senza spazio, come a macchina</option>' +
        '<option value="rientro">Capoversi con rientro, come nei libri</option><option value="ampio">Capoversi ben staccati, come in un blog</option></select></div>' +
      '<p class="nota-bene">Cambia solo l\'aspetto qui: nel file e in WordPress ogni Invio resta un capoverso. Per andare a capo dentro lo stesso capoverso (una poesia, un indirizzo) usa Maiuscolo+Invio.</p>' +
      '<div class="fila"><select class="campo" id="fisso" aria-label="Carattere a spaziatura fissa"><option value="mai">Carattere normale in tutte le note</option><option value="txt">Spaziatura fissa nelle note di testo (.txt)</option><option value="sempre">Spaziatura fissa in tutte le note</option></select></div>' +
      '<div class="fila"><select class="campo" id="formato" aria-label="Formato delle nuove note"><option value="md">Nuove note in Markdown (.md), con formattazione</option><option value="txt">Nuove note in testo semplice (.txt)</option></select></div>' +
      '<p class="nota-bene">BiaWrite ' + VERSIONE + '</p>' +
      '<div class="azioni"><button class="tasto pieno" data-a="chiudi">Chiudi</button></div>';
    const tema = () => { if (window.BiaTema) BiaTema.applica(S); };
    $('#stile', c).value = S.stile === 'terminale' ? 'terminale' : 'scrivania';
    $('#stile', c).onchange = e => { S.stile = e.target.value; salvaS(); tema(); disegna(); };
    if (Meteo) {
      const esiti = $('#meteo-esiti', c), dove = $('#meteo-dove', c), campo = $('#meteo-cerca', c);
      const dici = () => { dove.textContent = S.meteo ? 'Località: ' + S.meteo.nome + (S.meteo.dove ? ' (' + S.meteo.dove + ')' : '') + '. Il meteo viene chiesto a Open-Meteo inviando solo le coordinate, arrotondate.' : 'Nessuna località: il meteo è spento e non viene chiesto nulla.'; };
      const scegli = l => { S.meteo = l; salvaS(); esiti.textContent = ''; dici(); meteoEsito = null; meteoErrore = false; aggiornaMeteo(true); };
      const trova = async () => {
        if (!campo.value.trim()) return;
        esiti.textContent = 'Cerco…';
        try {
          const r = await Meteo.cerca(campo.value);
          esiti.textContent = r.length ? '' : 'Nessuna località con questo nome.';
          for (const l of r) { const b = document.createElement('button'); b.className = 'esito'; b.textContent = l.nome + (l.dove ? ' — ' + l.dove : ''); b.onclick = () => scegli(l); esiti.appendChild(b); }
        } catch (e) { esiti.textContent = 'La ricerca non è riuscita: serve la rete.'; }
      };
      $('#meteo-trova', c).onclick = trova;
      campo.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); trova(); } };
      $('#meteo-qui', c).onclick = async () => { try { scegli(await Meteo.qui()); } catch (e) { avviso(e.message); } };
      $('#meteo-via', c).onclick = () => scegli(null);
      dici();
    }
    $('#tema', c).value = S.tema || 'auto';
    $('#tema', c).onchange = e => { S.tema = e.target.value; salvaS(); tema(); };
    c.querySelectorAll('.sfondi button').forEach(b => b.onclick = () => {
      S.sfondo = b.dataset.v; salvaS(); tema();
      c.querySelectorAll('.sfondi button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    });
    $('#ordine', c).value = perMesi() ? 'mesi' : 'tutte';
    $('#ordine', c).onchange = e => { S.bacheca = e.target.value; salvaS(); cartellaAperta = null; history.replaceState({ bacheca: true }, ''); limite = PASSO; disegna({ anima: true }); };
    if (Cru) { $('#copia-diario', c).value = copiaDiario() ? 'si' : 'no'; $('#copia-diario', c).onchange = e => { S.copiaDiario = e.target.value; salvaS(); aggiornaStato(); if (copiaDiario() && collegato()) sync(); }; }
    if (Cru) { $('#mostra-diario', c).value = S.diario === 'no' ? 'no' : 'si'; $('#mostra-diario', c).onchange = e => { S.diario = e.target.value; salvaS(); disegna(); }; }
    $('#fisso', c).value = S.fisso || 'txt';
    $('#fisso', c).onchange = e => { S.fisso = e.target.value; salvaS(); disegna(); };
    $('#spazio', c).value = S.spazio || 'stretto';
    $('#spazio', c).onchange = e => { S.spazio = e.target.value; salvaS(); carta.dataset.spazio = S.spazio; };
    $('#formato', c).value = S.formato === 'txt' ? 'txt' : 'md';
    $('#formato', c).onchange = e => { S.formato = e.target.value; salvaS(); };
    c.onclick = async e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      const az = a.dataset.a;
      if (az === 'chiudi') { d.close(); return; }
      if (az === 'sync') { d.close(); elStato.click(); return; }
      if (az === 'collega') { d.close(); mostraBenvenuto(); return; }
      if (az === 'chiave') { d.close(); cambiaChiave(); return; }
      if (az === 'importa') { d.close(); sceltaImporta($('#importa')); return; }
      if (az === 'pin') { d.close(); await impostaPin(); return; }
      if (az === 'sblocca') { togliBlocco(); avviso('Blocco tolto.'); pannello(); return; }
      if (az === 'bio') {
        if (S.lock.bio) { S.lock.bio = null; salvaS(); } else await attivaBio();
        pannello(); return;
      }
      if (az === 'scollega') {
        d.close();
        const ok = await chiedi({ titolo: 'Scollegare questo dispositivo?', rosso: true, ok: 'Scollega',
          html: '<p>Si cancellano da qui la copia locale delle note, il blocco e la chiave. Le note su GitHub restano intatte' +
            (inSospeso() ? '; <b>attenzione: ci sono modifiche non ancora sincronizzate, che andrebbero perse.</b>' : '.') + '</p>' +
            '<p class="nota-bene">Per revocare la chiave anche su GitHub: <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">Fine-grained tokens</a>.</p>' });
        if (ok) azzera();
      }
    };
    if (!d.open) d.showModal();
  }
  $('#impostazioni').addEventListener('click', pannello);

  /* ============================================================ avvio */
  function entra() {
    app.dataset.vista = 'bacheca';
    disegna();
    aggiornaMeteo();
    if (history.state && history.state.diario && conDiario()) mostraDiario();
    aggiornaStato();
    if (collegato()) sync();
  }

  const SCORCIATOIE = { b: 'bold', i: 'italic', u: 'underline' };
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && SCORCIATOIE[e.key.toLowerCase()] && carta.contains(document.activeElement)) {
      e.preventDefault();
      comando(SCORCIATOIE[e.key.toLowerCase()]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (aperta) { conferma(); if (collegato()) sync(); avviso(collegato() ? 'Si salva da sé: sta già andando su GitHub.' : 'Si salva da sé: è già al sicuro su questo dispositivo.', 2200); }
      return;
    }
    if (e.key === 'Escape') {
      if (!menu.hidden) { chiudiMenu(); return; }
      if (document.querySelector('dialog[open]')) return;
      if (aperta || vista() === 'diario') history.back();
    }
  });

  const vv = window.visualViewport;
  function misura() { if (!vv) return; app.style.setProperty('--alt', vv.height + 'px'); app.style.top = vv.offsetTop + 'px'; tastiera(); }

  /* La tastiera del telefono. Aperta, lascia poche righe: allora la barra in alto si ritira (resta quella
   * della formattazione; torna appena la tastiera si chiude) e la riga del cursore resta sempre sopra la
   * capsula che iOS fa galleggiare sulla pagina (˄ ˅ ✓). Quella capsula appartiene al sistema: una pagina
   * web non la può togliere, ma può non lasciarci sotto il testo che si sta scrivendo.
   * «Aperta» = un campo di scrittura ha il fuoco e il riquadro visibile è più basso di quello pieno. */
  const MARGINE_TASTIERA = 76;                                  // la capsula copre circa 60 pt sopra la tastiera
  let altPiena = 0, larghezza = 0, giroCursore = 0;
  const scrive = () => { const a = document.activeElement; return !!a && (a === carta || a === testo || a === titolo || carta.contains(a)); };
  function tastiera() {
    if (!vv) return;
    if (innerWidth !== larghezza) { larghezza = innerWidth; altPiena = 0; }      // girando il telefono cambia l'altezza piena
    const attivo = scrive();
    if (!attivo) altPiena = vv.height; else if (vv.height > altPiena) altPiena = vv.height;
    const su = attivo && vista() === 'editor' && altPiena - vv.height > 140;
    if ((app.dataset.tastiera === '1') !== su) app.dataset.tastiera = su ? '1' : '';
    if (su) cursoreInVista();
  }
  /* Il rettangolo del cursore: nella pagina formattata dalla selezione, nella textarea da una copia invisibile. */
  function rettCursore() {
    const a = document.activeElement;
    if (a === testo || a === titolo) {
      if (a === titolo) return a.getBoundingClientRect();
      const cs = getComputedStyle(testo), m = document.createElement('div');
      for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'tabSize', 'hyphens']) m.style[k] = cs[k];
      Object.assign(m.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', top: '0', left: '-9999px', width: testo.clientWidth + 'px' });
      m.textContent = testo.value.slice(0, testo.selectionEnd);
      const sp = document.createElement('span'); sp.textContent = '\u200b'; m.appendChild(sp);
      document.body.appendChild(m);
      const y = sp.offsetTop, h = sp.offsetHeight; m.remove();
      const r = testo.getBoundingClientRect();
      return { top: r.top + y, bottom: r.top + y + h };
    }
    const sel = getSelection();
    if (!sel.rangeCount || !carta.contains(sel.focusNode)) return null;
    const r = document.createRange();
    try { r.setStart(sel.focusNode, sel.focusOffset); r.collapse(true); } catch (e) { return null; }
    let q = r.getClientRects()[0] || r.getBoundingClientRect();
    if (!q || !q.height) {                                       // riga vuota: vale il capoverso che la contiene
      let el = sel.focusNode.nodeType === 1 ? sel.focusNode : sel.focusNode.parentElement;
      if (el === carta) el = carta.childNodes[sel.focusOffset] || carta.lastChild;
      if (el && el.nodeType !== 1) el = el.parentElement;
      q = el && el !== carta ? el.getBoundingClientRect() : null;
    }
    return q;
  }
  function cursoreInVista() {
    if (giroCursore) return;
    giroCursore = requestAnimationFrame(() => {
      giroCursore = 0;
      if (app.dataset.tastiera !== '1') return;
      const r = rettCursore(), f = $('#foglio'), fr = f.getBoundingClientRect();
      if (!r || !fr.height) return;
      const basso = fr.bottom - MARGINE_TASTIERA, alto = fr.top + 6;
      if (r.bottom > basso) f.scrollTop += Math.ceil(r.bottom - basso);
      else if (r.bottom < alto) f.scrollTop -= Math.ceil(alto - r.top);
    });
  }
  document.addEventListener('selectionchange', () => { if (app.dataset.tastiera === '1') cursoreInVista(); });
  document.addEventListener('focusin', () => tastiera());
  document.addEventListener('focusout', () => setTimeout(tastiera, 0));
  if (vv) { vv.addEventListener('resize', misura); vv.addEventListener('scroll', misura); misura(); }
  window.addEventListener('resize', chiudiMenu);

  async function avvia() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    const st = history.state;                                                   // ricaricando dentro una cartella, vi si resta
    const nelDiario = !!(st && st.diario && Cru);
    if (st && st.cartella && perMesi()) cartellaAperta = st.cartella; else if (!nelDiario) history.replaceState({ bacheca: true }, '');
    // il diario si carica intanto che si leggono le note: l'avvio non aspetta un'operazione in più
    const prontoDiario = Cru ? Cru.avvia({ avviso, sha: Arch.shaBlob, alCambio: c => { if (c.daInviare) { aggiornaStato(); sync(); } else if (vista() === 'bacheca' && menu.hidden) disegna(); } }).catch(() => {}) : null;
    let tutte = [];
    try { tutte = (await DB.tutte()) || []; } catch (e) { console.warn('archivio', e); }
    tutte.forEach(n => {
      if (!n.content.trim() && n.autoName && !n.path && !n.deleted) { DB.togli(n.id); return; }       // note nuove rimaste vuote
      if (n.driveId !== undefined) {                       // nota delle versioni con Google Drive
        delete n.driveId; delete n.remoteModified;
        n.path = null; n.sha = null; n.dirty = !!n.content.trim();
        if (n.deleted) { DB.togli(n.id); return; }
        DB.metti(n);
      }
      if (n.path === undefined) { n.path = null; n.sha = null; }
      note.set(n.id, n);
    });
    try {
      const b = JSON.parse(localStorage.getItem(K_BOZZA) || 'null');
      if (b) {
        const n = note.get(b.id);
        if (n && b.t >= n.modified && (b.content !== n.content || b.name !== n.name)) {
          n.content = b.content; n.name = b.name; n.autoName = b.autoName; n.modified = b.t; n.dirty = true; n.metaDirty = true; n.rev++;
          DB.metti(n);
        }
        localStorage.removeItem(K_BOZZA);
      }
    } catch (e) { /* bozza illeggibile */ }
    try { allegatiInAttesa = ((await DB.tutte('allegati')) || []).filter(x => !x.inviato).length; } catch (e) { allegatiInAttesa = 0; }
    await prontoDiario;
    if (!S.lock) chiave = S.token || '';
    preparaArchivio();
    carta.dataset.spazio = S.spazio || 'stretto';
    if (!S.mode) { app.dataset.vista = 'avvio'; mostraBenvenuto(); }
    else if (S.lock) mostraBlocco();
    else entra();
  }
  avvia();

  /* Comandi per chi ospita la pagina (l'app per Mac li lega ai suoi menu). A dispositivo bloccato non fanno nulla.
   * (Nome distinto da comando(), che è la barra di formattazione: nella stessa funzione, una seconda
   * dichiarazione con lo stesso nome prenderebbe il posto della prima.) */
  const libero = () => $('#blocco').hidden && vista() !== 'avvio';
  function comandoMenu(nome) {
    if (!libero()) return false;
    if (nome === 'impostazioni') { if (!document.querySelector('dialog[open]')) pannello(); return true; }
    if (nome === 'sincronizza') { if (aperta) conferma(); if (collegato()) { sync(); avviso('Sincronizzo con GitHub…', 1600); } else avviso('Questo dispositivo non è collegato a GitHub.'); return true; }
    if (nome === 'nuova') { if (vista() === 'diario') history.back(); if (aperta) chiudi(); setTimeout(nuovaNota, aperta || vista() !== 'bacheca' ? 260 : 0); return true; }
    if (nome === 'cerca') { if (vista() !== 'bacheca') { if (aperta || vista() === 'diario') history.back(); setTimeout(() => elCerca.focus(), 300); } else elCerca.focus(); return true; }
    if (nome === 'diario') { if (!conDiario()) return false; if (aperta) { chiudi(); setTimeout(apriDiario, 300); } else if (vista() !== 'diario') apriDiario(); return true; }
    if (nome === 'bacheca') { if (aperta || vista() === 'diario') history.back(); return true; }
    return false;
  }
  /* Salva subito la nota aperta sul dispositivo (per chi chiude la pagina dall'esterno, come l'app per Mac). */
  async function salvaOra() { const f = conferma(); if (f) await f; return true; }
  /* per il collaudo automatico e per chi ospita la pagina */
  window.BiaWrite = { versione: VERSIONE, note, sync, stato: () => elStato.dataset.s, avviso, comando: comandoMenu, salvaOra };
})();
