/* BiaWrite — cruscotto.js
 * Il cockpit del diario alimentare: andamento delle calorie, peso, indicatori, calendario e
 * dettaglio del giorno. Legge il modello prodotto da diario.js; conserva sul dispositivo una
 * copia del file (in un archivio suo, separato da quello delle note) e, dove il browser lo
 * consente, ricorda il file per rileggerlo da solo. La sincronizzazione con GitHub la fa app.js.
 * SOLA LETTURA: il file del diario non viene mai scritto. Lo si apre con un campo di scelta (che dà
 * al browser una copia in sola lettura) oppure con il permesso «read» del File System Access; il
 * permesso di scrittura non viene mai chiesto, quindi è il browser stesso a impedire ogni modifica.
 * Nessuna libreria esterna: i grafici sono SVG disegnati qui.
 * © B. Raucci — licenza MIT
 */
(function (root) {
  'use strict';
  const D = root.BiaDiario, Core = root.BiaCore;
  const esc = Core.esc, escA = Core.escA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

  /* ------------------------------------------------------------ numeri e date */
  const n0 = v => (v == null ? '—' : Math.round(v).toLocaleString('it-IT'));
  const n1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('it-IT', { maximumFractionDigits: 1 }));
  const giorno = iso => new Date(iso + 'T00:00:00Z');
  const fData = (iso, o) => new Intl.DateTimeFormat('it-IT', Object.assign({ timeZone: 'UTC' }, o)).format(giorno(iso));
  const lunga = iso => fData(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const media = iso => fData(iso, { day: 'numeric', month: 'long' });
  const corta = iso => fData(iso, { day: 'numeric', month: 'short' }).replace('.', '');
  const meseAnno = iso => fData(iso, { month: 'long', year: 'numeric' });
  const piu = (iso, n) => new Date(giorno(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
  const tra = (a, b) => Math.round((giorno(b) - giorno(a)) / 86400000);
  const oggi = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const maiuscola = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ------------------------------------------------------------ archivio locale (separato dalle note) */
  const Dep = {
    _p: null, _mem: new Map(),
    apri() {
      if (!this._p) this._p = new Promise(res => {
        try {
          const r = indexedDB.open('biawrite-diario', 1);
          r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return this._p;
    },
    async _tx(modo, fn) {
      const db = await this.apri();
      if (!db) return fn(null);
      return new Promise(res => {
        try {
          const tx = db.transaction('kv', modo);
          const r = fn(tx.objectStore('kv'));
          tx.oncomplete = () => res(r && r.result);
          tx.onerror = tx.onabort = () => res(undefined);
        } catch (e) { res(undefined); }
      });
    },
    prendi(k) { return this._tx('readonly', s => (s ? s.get(k) : this._mem.get(k))); },
    metti(k, v) { return this._tx('readwrite', s => (s ? s.put(v, k) : this._mem.set(k, v))); },
    togli(k) { return this._tx('readwrite', s => (s ? s.delete(k) : this._mem.delete(k))); },
    svuota() { return this._tx('readwrite', s => (s ? s.clear() : this._mem.clear())); },
  };

  /* ------------------------------------------------------------ stato */
  let st = { testo: '', sha: null, sporco: false, modificato: 0, dimensione: 0, origine: null, quando: 0 };
  let handle = null;                // il file ricordato (File System Access), dove c'è
  let modello = null, ind = null;
  let el = null, aperto = false;
  let sel = null, mese = null, intervallo = 30;
  let opz = { avviso() {}, alCambio() {}, sha: async () => null };
  let osserva = null, pronto = null;

  function calcola() {
    modello = st.testo ? D.leggi(st.testo, oggi()) : null;
    if (modello && !modello.giorni.length) modello = null;
    ind = modello ? D.indicatori(modello) : null;
    if (modello) {
      if (!sel || !modello.giorni.some(g => g.data === sel)) sel = modello.giorni[modello.giorni.length - 1].data;
      if (!mese) mese = sel.slice(0, 7);
    } else { sel = null; mese = null; }
  }

  function avvia(o) {
    opz = Object.assign(opz, o || {});
    if (!pronto) pronto = (async () => {
      const s = await Dep.prendi('stato');
      if (s && typeof s.testo === 'string') st = Object.assign(st, s);
      try { handle = (await Dep.prendi('file')) || null; } catch (e) { handle = null; }
      calcola();
    })();
    return pronto;
  }

  /** Nuovo testo del diario: da un file scelto qui (da inviare) o ricevuto dal repository. */
  async function imposta(testo, da) {
    testo = String(testo || '').replace(/^﻿/, '');
    const prova = D.leggi(testo, oggi());
    if (!prova.giorni.length) throw new Error('In questo file non trovo i giorni del diario: servono titoli che cominciano con una data, per esempio «### 22 novembre 2026», e le tabelle dei pasti con la colonna «kcal».');
    const sha = da.sha || await opz.sha(testo);
    const uguale = sha && sha === st.sha;
    st = { testo, sha, sporco: da.origine === 'file' ? !uguale || st.sporco : false, modificato: da.modificato || (uguale ? st.modificato : 0), dimensione: da.dimensione || testo.length, origine: uguale && st.origine ? st.origine : da.origine, quando: Date.now() };
    await Dep.metti('stato', st);
    calcola();
    if (aperto) disegna();
    opz.alCambio({ daInviare: st.sporco });
    return !uguale;
  }
  async function segnaInviato() { st.sporco = false; await Dep.metti('stato', st); }
  async function svuota() { st = { testo: '', sha: null, sporco: false, modificato: 0, dimensione: 0, origine: null, quando: 0 }; handle = null; await Dep.svuota(); calcola(); }

  /* ------------------------------------------------------------ il file */
  async function daFile(f) {
    if (f.size > 5 * 1024 * 1024) throw new Error('Il file è troppo grande per essere un diario (più di 5 MB).');
    const testo = await f.text();
    return imposta(testo, { origine: 'file', modificato: f.lastModified, dimensione: f.size });
  }
  /* rilegge il file ricordato; `chiedi` = si può mostrare la richiesta di permesso del browser */
  async function rileggi(chiedi) {
    if (!handle) return null;
    try {
      let p = await handle.queryPermission({ mode: 'read' });
      if (p !== 'granted' && chiedi) p = await handle.requestPermission({ mode: 'read' });
      if (p !== 'granted') return null;
      const f = await handle.getFile();
      if (f.lastModified === st.modificato && f.size === st.dimensione) return false;
      return await daFile(f);
    } catch (e) {
      if (e && e.name === 'NotFoundError') { handle = null; Dep.togli('file'); }
      return null;
    }
  }
  function scegliConCampo() {
    return new Promise(res => {
      const c = document.createElement('input');
      c.type = 'file'; c.hidden = true; c.id = 'scegli-diario';        // senza «accept»: su iPhone i file .md risulterebbero non selezionabili
      c.addEventListener('change', () => { const f = c.files[0]; c.remove(); res(f || null); });
      c.addEventListener('cancel', () => { c.remove(); res(null); });
      document.body.appendChild(c);
      c.click();
    });
  }
  async function aggiorna() {
    try {
      const r = await rileggi(true);
      if (r === true) { opz.avviso('Diario riletto dal file.'); return; }
      if (r === false) { opz.avviso('Il file non è cambiato dall\'ultima lettura.'); return; }
      let f = null;
      if (root.showOpenFilePicker) {
        try {
          const [h] = await root.showOpenFilePicker({ id: 'biawrite-diario', mode: 'read', types: [{ description: 'Diario alimentare', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }] });
          f = await h.getFile();
          handle = h;
          try { await Dep.metti('file', h); } catch (e) { /* il file non si può ricordare: si sceglierà di nuovo */ }
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          f = await scegliConCampo();
        }
      } else f = await scegliConCampo();
      if (!f) return;
      const cambiato = await daFile(f);
      opz.avviso(cambiato ? 'Diario caricato: ' + D.leggi(st.testo).giorni.length + ' giorni.' : 'Il file è uguale a quello già caricato.');
    } catch (e) { opz.avviso(e.message || 'Il file non si può leggere.', 8000); }
  }

  /* ------------------------------------------------------------ testo libero del diario → HTML sicuro */
  const RE_SEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
  const celle = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const riga = t => Core.sanifica(Core.mdToHtml(t)).innerHTML.replace(/^<p>|<\/p>$/g, '');
  function mdHtml(md) {
    const righe = String(md || '').split('\n');
    let o = '', buf = [];
    const scarica = () => { if (buf.some(l => l.trim())) o += Core.sanifica(Core.mdToHtml(buf.join('\n'))).innerHTML; buf = []; };
    for (let i = 0; i < righe.length; i++) {
      if (righe[i].includes('|') && i + 1 < righe.length && RE_SEP.test(righe[i + 1]) && righe[i + 1].includes('-')) {
        scarica();
        const testa = celle(righe[i]);
        let k = i + 2, corpo = '';
        while (k < righe.length && righe[k].includes('|') && righe[k].trim()) { corpo += '<tr>' + celle(righe[k]).map(c => '<td>' + riga(c) + '</td>').join('') + '</tr>'; k++; }
        o += '<div class="dz-scorri"><table class="dz-tab"><thead><tr>' + testa.map(c => '<th>' + riga(c) + '</th>').join('') + '</tr></thead><tbody>' + corpo + '</tbody></table></div>';
        i = k - 1;
      } else buf.push(righe[i]);
    }
    scarica();
    return o;
  }

  /* ------------------------------------------------------------ giudizio di un giorno rispetto alle soglie */
  function giudizio(g) {
    const tdee = modello.rif.tdee;
    if (g.kcal == null) return { k: 'vuoto', t: 'senza calorie' };
    if (g.stato === 'corso') return g.soglia && g.kcal > g.soglia ? { k: 'oltre', t: 'in corso, già oltre la soglia' } : { k: 'corso', t: 'in corso' };
    if (tdee && g.kcal > tdee) return { k: 'surplus', t: 'oltre il dispendio' };
    if (g.soglia && g.kcal > g.soglia) return { k: 'oltre', t: 'oltre la soglia' };
    return { k: 'ok', t: 'entro la soglia' };
  }
  const SEGNO = { ok: '●', corso: '○', oltre: '▲', surplus: '▲', vuoto: '·' };

  /* ------------------------------------------------------------ grafico delle calorie */
  function graficoKcal(W) {
    const gg = modello.giorni, r = modello.rif;
    const ultimo = gg[gg.length - 1].data, primo = gg[0].data;
    const da = intervallo ? (tra(primo, ultimo) + 1 > intervallo ? piu(ultimo, -(intervallo - 1)) : primo) : primo;
    const n = Math.max(tra(da, ultimo) + 1, 14);              // con pochi giorni restano le caselle di quelli a venire
    const stretto = W < 520;
    const L = 40, R = stretto ? 62 : 98, T = 16, B = 38, H = stretto ? 230 : 270;
    const slot = Math.max(3, Math.min(44, (W - L - R) / n));
    const bw = Math.max(2, Math.min(24, slot - 2));
    const per = new Map(gg.map(g => [g.data, g]));
    const vis = gg.filter(g => g.data >= da && g.kcal != null);
    const tetto = Math.max(r.tdee || 0, ...vis.map(g => g.soglia || 0), ...vis.map(g => g.kcal), 500) * 1.08;
    const passo = tetto > 1600 ? 500 : 250;
    const yMax = Math.ceil(tetto / passo) * passo;
    const y = v => T + (H - T - B) * (1 - v / yMax);
    const x = i => L + slot * i + slot / 2;
    const destra = L + slot * n;
    let s = '<svg class="dz-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Calorie assunte giorno per giorno, con la soglia e il dispendio stimato">';
    for (let v = 0; v <= yMax; v += passo) s += '<line class="gr" x1="' + L + '" x2="' + destra + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="as" x="' + (L - 7) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + n0(v) + '</text>';
    // colonna del giorno scelto
    if (sel >= da && sel <= ultimo) { const i = tra(da, sel); s += '<rect class="scelta" x="' + (x(i) - slot / 2) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '" rx="3"/>'; }
    // soglia (può cambiare nel tempo: linea a gradini) e dispendio
    let soglia = r.target || null, pts = '';
    for (let i = 0; i < n; i++) {
      const g = per.get(piu(da, i));
      if (g && g.soglia) soglia = g.soglia;
      if (soglia) pts += (pts ? ' L' : 'M') + (x(i) - slot / 2) + ' ' + y(soglia) + ' L' + (x(i) + slot / 2) + ' ' + y(soglia);
    }
    const etich = [];
    if (pts) { s += '<path class="rif soglia" d="' + pts + '"/>'; etich.push({ y: y(soglia), t: stretto ? 'soglia' : 'soglia ' + n0(soglia) }); }
    if (r.tdee) { s += '<line class="rif tdee" x1="' + L + '" x2="' + destra + '" y1="' + y(r.tdee) + '" y2="' + y(r.tdee) + '"/>'; etich.push({ y: y(r.tdee), t: stretto ? 'dispendio' : 'dispendio ' + n0(r.tdee) }); }
    etich.sort((a, b) => a.y - b.y);
    if (etich.length === 2 && etich[1].y - etich[0].y < 14) etich[1].y = etich[0].y + 14;
    for (const e of etich) s += '<text class="et" x="' + (destra + 7) + '" y="' + (e.y + 4) + '">' + esc(e.t) + '</text>';
    // barre
    for (let i = 0; i < n; i++) {
      const d = piu(da, i), g = per.get(d);
      if (g && g.kcal != null) {
        const q = giudizio(g), h = Math.max(1, y(0) - y(g.kcal)), rr = Math.min(4, bw / 2, h);
        const x0 = x(i) - bw / 2, y0 = y(g.kcal);
        s += '<path class="ba ' + q.k + '" d="M' + x0 + ' ' + y(0) + ' V' + (y0 + rr) + ' Q' + x0 + ' ' + y0 + ' ' + (x0 + rr) + ' ' + y0 + ' H' + (x0 + bw - rr) + ' Q' + (x0 + bw) + ' ' + y0 + ' ' + (x0 + bw) + ' ' + (y0 + rr) + ' V' + y(0) + ' Z"/>';
        if ((q.k === 'oltre' || q.k === 'surplus') && bw >= 6) s += '<path class="segno ' + q.k + '" d="M' + x(i) + ' ' + (y0 - 11) + ' l4.5 7 h-9 Z"/>';
        if (d === sel && slot >= 26) s += '<text class="va" x="' + x(i) + '" y="' + (y0 - (q.k === 'oltre' || q.k === 'surplus' ? 16 : 6)) + '" text-anchor="middle">' + n0(g.kcal) + '</text>';
      }
    }
    // media mobile su 7 giorni (solo giorni chiusi), da quando c'è abbastanza storia
    const chiusi = gg.filter(g => g.stato === 'chiusa' && g.kcal != null);
    let conMedia = false;
    if (chiusi.length >= 5) {
      let p = '';
      for (let i = 0; i < n; i++) {
        const d = piu(da, i), g = per.get(d);
        if (!g || g.stato !== 'chiusa' || g.kcal == null) continue;
        const fin = chiusi.filter(c => c.data <= d && c.data > piu(d, -7));
        if (fin.length < 3) continue;
        p += (p ? ' L' : 'M') + x(i) + ' ' + y(fin.reduce((t, c) => t + c.kcal, 0) / fin.length);
      }
      if (p.includes('L')) { s += '<path class="mm-anello" d="' + p + '"/><path class="mm" d="' + p + '"/>'; conMedia = true; }
    }
    // asse dei giorni
    const ogni = slot >= 20 ? 1 : slot >= 10 ? 2 : slot >= 5 ? 7 : 14;
    s += '<line class="base" x1="' + L + '" x2="' + destra + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
    let fineMese = -1;
    for (let i = 0; i < n; i++) {
      const d = piu(da, i), g = +d.slice(8);
      const mostra = ogni === 1 || (ogni === 2 ? i % 2 === (n - 1) % 2 : giorno(d).getUTCDay() === 1 && (ogni === 7 || g <= 14));
      if (mostra) s += '<text class="as' + (d === sel ? ' forte' : '') + '" x="' + x(i) + '" y="' + (H - B + 15) + '" text-anchor="middle">' + g + '</text>';
      if (i === 0 || g === 1) {
        const xm = Math.max(L, x(i) - slot / 2 + 1), t = fData(d, { month: stretto ? 'short' : 'long' }).replace('.', '') + (i === 0 || d.slice(5, 7) === '01' ? ' ' + d.slice(0, 4) : '');
        if (xm > fineMese) { s += '<text class="as mese" x="' + xm + '" y="' + (H - 6) + '">' + esc(t) + '</text>'; fineMese = xm + t.length * 6.4 + 10; }
      }
    }
    // bersagli: tutta la colonna, anche per la tastiera
    for (let i = 0; i < n; i++) {
      const d = piu(da, i), g = per.get(d);
      if (!g) continue;
      s += '<rect class="tocco" data-giorno="' + d + '" x="' + (x(i) - slot / 2) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B + 18) + '" tabindex="0" role="button" aria-label="' +
        escA(media(d) + ': ' + (g.kcal == null ? 'nessun dato' : n0(g.kcal) + ' kcal, ' + giudizio(g).t)) + '"/>';
    }
    return { svg: s + '</svg>', conMedia, da, n };
  }

  /* ------------------------------------------------------------ grafico del peso */
  function graficoPeso(W) {
    const r = modello.rif, tutte = modello.misure.filter(m => m.peso != null);
    if (!tutte.length) return '';
    const inizio = r.data && tutte.some(m => m.data >= r.data) ? r.data : tutte[0].data;
    const pts = tutte.filter(m => m.data >= inizio);
    const fineDati = pts[pts.length - 1].data;
    const fine = [piu(inizio, 56), piu(fineDati, 10), oggi()].sort().pop();
    const giorni = Math.max(1, tra(inizio, fine));
    const piano = d => (r.ritmo && r.peso != null ? Math.max(r.pesoObiettivo || 0, r.peso - r.ritmo * tra(inizio, d) / 7) : null);
    const valori = pts.map(m => m.peso).concat(piano(fine) != null ? [piano(fine), r.peso] : []);
    let lo = Math.floor(Math.min(...valori) - 1), hi = Math.ceil(Math.max(...valori) + 1);
    if (hi - lo < 4) { lo -= 1; hi += 1; }
    const L = 40, R = 62, T = 14, B = 26, H = 180;
    const x = d => L + (W - L - R) * tra(inizio, d) / giorni;
    const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const passo = hi - lo > 12 ? 5 : hi - lo > 6 ? 2 : 1;
    let s = '<svg class="dz-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Peso nel tempo, con la linea del piano">';
    for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) s += '<line class="gr" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="as" x="' + (L - 7) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    if (piano(fine) != null) {
      s += '<line class="piano" x1="' + x(inizio) + '" y1="' + y(r.peso) + '" x2="' + x(fine) + '" y2="' + y(piano(fine)) + '"/>';
      s += '<text class="et" x="' + (W - R + 7) + '" y="' + (y(piano(fine)) + 4) + '">piano</text>';
    }
    if (pts.length > 1) s += '<path class="pe" d="' + pts.map((m, i) => (i ? 'L' : 'M') + x(m.data) + ' ' + y(m.peso)).join(' ') + '"/>';
    for (const m of pts) s += '<circle class="pu" cx="' + x(m.data) + '" cy="' + y(m.peso) + '" r="5"/>';
    const u = pts[pts.length - 1];
    s += '<text class="va" x="' + Math.min(W - R - 4, x(u.data) + 9) + '" y="' + (y(u.peso) - 9) + '">' + n1(u.peso) + ' kg</text>';
    s += '<text class="as" x="' + L + '" y="' + (H - 6) + '">' + esc(corta(inizio)) + '</text><text class="as" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(corta(fine)) + '</text>';
    for (const m of pts) s += '<circle class="tocco" data-peso="' + m.data + '" cx="' + x(m.data) + '" cy="' + y(m.peso) + '" r="14" tabindex="0" role="img" aria-label="' + escA(media(m.data) + ': ' + n1(m.peso) + ' kg') + '"/>';
    return s + '</svg>';
  }

  /* ------------------------------------------------------------ lo strumento: calorie del giorno */
  function strumento(g) {
    const r = modello.rif, soglia = g.soglia || r.target || 0, tdee = r.tdee && r.tdee > soglia ? r.tdee : null;
    const kcal = g.kcal || 0;
    const max = Math.ceil(Math.max(soglia * 1.45, (tdee || 0) * 1.12, kcal * 1.06, 500) / 100) * 100;
    const cx = 165, cy = 132, R = 104, sp = 13;
    const ang = v => Math.PI * (1 - Math.min(1, Math.max(0, v / max)));          // 180° → 0°
    const P = (v, rr) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))];
    const arco = (a, b, cls) => { const [x1, y1] = P(a, R), [x2, y2] = P(b, R); return '<path class="arco ' + cls + '" d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + R + ' ' + R + ' 0 0 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"/>'; };
    const stacco = max * 0.006;
    let s = '<svg class="dz-strumento" viewBox="0 0 330 150" role="img" aria-label="' + escA(n0(kcal) + ' kcal su una soglia di ' + n0(soglia)) + '">';
    if (soglia) s += arco(0, soglia - stacco, 'buono');
    if (soglia) s += arco(soglia + stacco, (tdee || max) - (tdee ? stacco : 0), 'avviso');
    if (tdee) s += arco(tdee + stacco, max, 'critico');
    if (!soglia) s += arco(0, max, 'neutro');
    const passo = max > 2400 ? 1000 : 500;
    for (let v = 0; v <= max; v += passo) {
      const [a, b] = P(v, R - sp / 2 - 3), [c, d] = P(v, R - sp / 2 - 9), [e, f] = P(v, R - sp / 2 - 20);
      s += '<line class="tacca" x1="' + a.toFixed(1) + '" y1="' + b.toFixed(1) + '" x2="' + c.toFixed(1) + '" y2="' + d.toFixed(1) + '"/>';
      s += '<text class="as" x="' + e.toFixed(1) + '" y="' + (f + 4).toFixed(1) + '" text-anchor="middle">' + (v >= 1000 ? (v / 1000).toLocaleString('it-IT') + 'k' : v) + '</text>';
    }
    for (const [v, t] of [[soglia, 'soglia'], [tdee, 'dispendio']]) {
      if (!v) continue;
      const [a, b] = P(v, R + sp / 2 + 2), [c, d] = P(v, R + sp / 2 + 8);
      const destra = Math.cos(ang(v)) > 0.15, sinistra = Math.cos(ang(v)) < -0.15;
      s += '<line class="tacca" x1="' + a.toFixed(1) + '" y1="' + b.toFixed(1) + '" x2="' + c.toFixed(1) + '" y2="' + d.toFixed(1) + '"/>';
      s += '<text class="et" x="' + (c + (destra ? 3 : sinistra ? -3 : 0)).toFixed(1) + '" y="' + (d - (destra || sinistra ? -3 : 4)).toFixed(1) + '" text-anchor="' + (destra ? 'start' : sinistra ? 'end' : 'middle') + '">' + t + '</text>';
    }
    const [nx, ny] = P(kcal, R - sp / 2 - 4), [bx, by] = P(kcal, -14);
    s += '<line class="ago-ombra" x1="' + bx.toFixed(1) + '" y1="' + (by + 1.5).toFixed(1) + '" x2="' + nx.toFixed(1) + '" y2="' + (ny + 1.5).toFixed(1) + '"/>';
    s += '<line class="ago" x1="' + bx.toFixed(1) + '" y1="' + by.toFixed(1) + '" x2="' + nx.toFixed(1) + '" y2="' + ny.toFixed(1) + '"/><circle class="perno" cx="' + cx + '" cy="' + cy + '" r="6.5"/>';
    return s + '</svg>';
  }

  /* ------------------------------------------------------------ pezzi */
  const tessera = (etichetta, valore, unita, nota, stato) => '<div class="dz-tessera"' + (stato ? ' data-stato="' + stato + '"' : '') + '><span class="e">' + esc(etichetta) + '</span><span class="v">' + valore + (unita ? ' <small>' + esc(unita) + '</small>' : '') + '</span>' + (nota ? '<span class="n">' + nota + '</span>' : '') + '</div>';

  /* misuratore: valore rispetto a un intervallo desiderato [min, max] */
  function misuratore(nome, v, int, unita, inCorso) {
    if (v == null) return '';
    const [lo, hi] = int || [null, null];
    const max = Math.max((hi || lo || v) * 1.25, v * 1.05);
    const esito = lo == null ? '' : v < lo ? 'sotto' : hi != null && v > hi ? 'sopra' : 'ok';
    const stato = inCorso && esito === 'sotto' ? 'corso' : esito;          // a giornata aperta, «mancano» non è un difetto
    const dice = lo == null ? '' : esito === 'ok' ? '✓ nell\'intervallo ' + lo + '–' + hi + ' ' + unita : esito === 'sotto' ? (inCorso ? '' : '▼ ') + 'mancano ' + n1(lo - v) + ' ' + unita + ' al minimo di ' + lo : '▲ ' + n1(v - hi) + ' ' + unita + ' oltre ' + hi;
    return '<div class="dz-mis" data-stato="' + stato + '"><div class="r"><span class="e">' + esc(nome) + '</span><span class="v">' + n1(v) + ' ' + unita + '</span></div>' +
      '<div class="pista" aria-hidden="true">' + (lo != null ? '<i class="zona" style="left:' + (lo / max * 100).toFixed(1) + '%;width:' + (((hi || max) - lo) / max * 100).toFixed(1) + '%"></i>' : '') +
      '<i class="pieno" style="width:' + Math.min(100, v / max * 100).toFixed(1) + '%"></i></div>' + (dice ? '<div class="n">' + esc(dice) + '</div>' : '') + '</div>';
  }

  /* barra a segmenti: da dove viene l'energia (proteine e carboidrati 4 kcal/g, grassi 9 kcal/g) */
  function quote(mac) {
    if (mac.p == null || mac.c == null || mac.g == null) return '';
    const v = [['p', 'Proteine', mac.p * 4], ['c', 'Carboidrati', mac.c * 4], ['g', 'Grassi', mac.g * 9]];
    const t = v.reduce((s, x) => s + x[2], 0);
    if (!t) return '';
    return '<div class="dz-quote"><div class="seg" role="img" aria-label="' + escA(v.map(x => x[1] + ' ' + Math.round(x[2] / t * 100) + '%').join(', ')) + '">' +
      v.map(x => { const q = x[2] / t * 100; return '<i class="q-' + x[0] + '" style="flex:' + q.toFixed(2) + '" title="' + escA(x[1] + ': ' + Math.round(q) + '% dell\'energia') + '">' + (q >= 11 ? Math.round(q) + '%' : '') + '</i>'; }).join('') +
      '</div><div class="leg">' + v.map(x => '<span><i class="q-' + x[0] + '"></i>' + x[1] + ' <b>' + n1(mac[x[0]]) + ' g</b></span>').join('') + '</div></div>';
  }

  function calendario() {
    const per = new Map(modello.giorni.map(g => [g.data, g]));
    const [a, m] = mese.split('-').map(Number);
    const primo = new Date(Date.UTC(a, m - 1, 1)), ng = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const vuoti = (primo.getUTCDay() + 6) % 7;
    const minM = modello.giorni[0].data.slice(0, 7), maxM = modello.giorni[modello.giorni.length - 1].data.slice(0, 7), og = oggi();
    let s = '<div class="dz-cal-testa"><button class="icona" data-a="mese" data-v="-1" aria-label="Mese precedente"' + (mese <= minM ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<h2 id="dz-mese" aria-live="polite">' + esc(maiuscola(meseAnno(mese + '-01'))) + '</h2>' +
      '<button class="icona" data-a="mese" data-v="1" aria-label="Mese successivo"' + (mese >= maxM ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></div>';
    s += '<div class="dz-cal-griglia" role="grid" aria-labelledby="dz-mese">' + ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(x => '<span class="gs" role="columnheader">' + x + '</span>').join('');
    for (let i = 0; i < vuoti; i++) s += '<span></span>';
    for (let d = 1; d <= ng; d++) {
      const iso = mese + '-' + String(d).padStart(2, '0'), g = per.get(iso);
      if (g) {
        const q = giudizio(g);
        s += '<button class="gc ' + q.k + (iso === sel ? ' scelto' : '') + (iso === og ? ' oggi' : '') + '" data-giorno="' + iso + '" aria-pressed="' + (iso === sel) + '" aria-label="' + escA(media(iso) + ': ' + (g.kcal == null ? 'nessun dato' : n0(g.kcal) + ' kcal, ' + q.t)) + '"><b>' + d + '</b><i aria-hidden="true">' + SEGNO[q.k] + '</i><small>' + (g.kcal == null ? '' : n0(g.kcal)) + '</small></button>';
      } else s += '<span class="gc nessuno' + (iso === og ? ' oggi' : '') + '"><b>' + d + '</b></span>';
    }
    s += '</div><p class="dz-cal-leg"><span><i class="ok">●</i> entro la soglia</span><span><i class="oltre">▲</i> oltre</span><span><i class="corso">○</i> in corso</span></p>';
    return s;
  }

  function dettaglio() {
    const g = modello.giorni.find(x => x.data === sel), r = modello.rif;
    if (!g) return '';
    const q = giudizio(g), i = modello.giorni.indexOf(g);
    const prima = modello.giorni[i - 1], dopo = modello.giorni[i + 1];
    const soglia = g.soglia || r.target;
    const diff = soglia != null && g.kcal != null ? soglia - g.kcal : null;
    let s = '<div class="dz-g-testa"><button class="icona" data-giorno="' + (prima ? prima.data : '') + '" aria-label="Giorno registrato precedente"' + (prima ? '' : ' disabled') + '><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<h2 tabindex="-1">' + esc(maiuscola(lunga(g.data))) + '</h2>' +
      '<button class="icona" data-giorno="' + (dopo ? dopo.data : '') + '" aria-label="Giorno registrato successivo"' + (dopo ? '' : ' disabled') + '><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '<span class="dz-timbro ' + (g.stato === 'corso' ? 'corso' : 'chiusa') + '">' + (g.stato === 'corso' ? 'in corso' : 'giornata chiusa') + '</span></div>';
    s += '<div class="dz-g-alto"><div class="dz-quadrante">' + strumento(g) +
      '<p class="dz-lettura"><b>' + n0(g.kcal) + '</b> kcal</p>' +
      '<p class="dz-esito ' + q.k + '"><i aria-hidden="true">' + SEGNO[q.k] + '</i> ' + (diff == null ? esc(q.t) : diff >= 0 ? (g.stato === 'corso' ? 'restano ' : 'margine di ') + '<b>' + n0(diff) + '</b> kcal sulla soglia di ' + n0(soglia) : '<b>' + n0(-diff) + '</b> kcal oltre la soglia di ' + n0(soglia)) + '</p></div>';
    s += '<div class="dz-g-macro">' + misuratore('Proteine', g.macro.p, r.proteine, 'g', g.stato === 'corso') + misuratore('Fibra', g.macro.f, r.fibra || [25, 30], 'g', g.stato === 'corso') + quote(g.macro) +
      (g.macro.parziale ? '<p class="dz-piccolo">Macronutrienti sommati dai pasti che li riportano.</p>' : '') + '</div></div>';
    const fatti = [];
    if (g.deficit != null) fatti.push(['Bilancio stimato', (g.deficit >= 0 ? '−' : '+') + n0(Math.abs(g.deficit)) + ' kcal', g.deficit >= 0 ? 'deficit sul dispendio di ' + n0(r.tdee) : 'surplus sul dispendio di ' + n0(r.tdee)]);
    if (g.passi != null) fatti.push(['Passi', n0(g.passi), '']);
    if (g.acqua != null) fatti.push(['Acqua dichiarata', '≥ ' + n1(g.acqua / 1000) + ' l', r.idratazione ? 'obiettivo ' + n1(r.idratazione) + ' l' : '']);
    if (g.peso != null) fatti.push(['Peso', n1(g.peso) + ' kg', '']);
    if (g.vita != null) fatti.push(['Vita', n1(g.vita) + ' cm', '']);
    if (g.collo != null) fatti.push(['Collo', n1(g.collo) + ' cm', '']);
    if (fatti.length) s += '<dl class="dz-fatti">' + fatti.map(f => '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + (f[2] ? ' <small>' + esc(f[2]) + '</small>' : '') + '</dd></div>').join('') + '</dl>';
    // pasti
    if (g.pasti.length) {
      const tot = g.pasti.reduce((t, p) => t + (p.kcal || 0), 0) || 1;
      let stime = false;
      s += '<h3>Pasti</h3><div class="dz-pasti">' + g.pasti.map(p => {
        const m = p.macro, mm = [['P', m.p], ['C', m.c], ['G', m.g], ['fibra', m.f]].filter(x => x[1] != null);
        return '<article class="dz-pasto"><header><h4>' + esc(p.nome) + '</h4>' + (p.ora ? '<time>' + esc(p.ora) + '</time>' : '') +
          '<span class="quota" aria-hidden="true"><i style="width:' + Math.max(2, p.kcal / tot * 100).toFixed(1) + '%"></i></span><b class="k">' + n0(p.kcal) + ' <small>kcal</small></b></header>' +
          '<table><tbody>' + p.righe.map(x => { if (x.stima) stime = true; return '<tr><td>' + esc(x.nome) + (x.stima ? '<sup title="quantità o valore stimato">*</sup>' : '') + '</td><td class="q">' + esc(x.quantita) + '</td><td class="k">' + n0(x.kcal) + '</td></tr>'; }).join('') + '</tbody></table>' +
          (mm.length ? '<p class="mac">' + mm.map(x => '<span>' + x[0] + ' <b>' + n1(x[1]) + ' g</b></span>').join('') + '</p>' : '') +
          (p.note ? '<details class="dz-nota"><summary>Annotazioni</summary><div class="dz-prosa">' + mdHtml(p.note) + '</div></details>' : '') + '</article>';
      }).join('') + '</div>' + (stime ? '<p class="dz-piccolo">* quantità o valore stimato, non pesato né letto in etichetta.</p>' : '');
    }
    if (g.note) s += '<details class="dz-nota grande" open><summary>Note del giorno</summary><div class="dz-prosa">' + mdHtml(g.note) + '</div></details>';
    return s;
  }

  function sintesi() {
    const r = modello.rif, o = ind;
    const t = [];
    if (!o.chiusi) return '<p class="dz-piccolo">Gli indicatori compaiono quando almeno una giornata è chiusa: per ora il diario contiene solo la giornata in corso.</p>';
    const sotto = r.target != null ? r.target - o.mediaKcal : null;
    t.push(tessera('Media giornaliera', n0(o.mediaKcal), 'kcal', sotto == null ? '' : (sotto >= 0 ? n0(sotto) + ' sotto' : n0(-sotto) + ' sopra') + ' la soglia di ' + n0(r.target), sotto == null ? '' : sotto >= 0 ? 'ok' : 'sopra'));
    if (o.mediaDeficit != null) t.push(tessera(o.mediaDeficit >= 0 ? 'Deficit medio' : 'Surplus medio', n0(Math.abs(o.mediaDeficit)), 'kcal al giorno', o.ritmoDeficit ? 'pari a circa ' + n1(o.ritmoDeficit) + ' kg a settimana' + (r.ritmo ? ' (piano: ' + n1(r.ritmo) + ')' : '') : 'sul dispendio di ' + n0(r.tdee), o.mediaDeficit >= 0 ? 'ok' : 'sopra'));
    if (o.kgTeorici != null) t.push(tessera('Deficit accumulato', n0(o.deficitCumulato), 'kcal', 'in teoria ' + (Math.abs(o.kgTeorici) < 0.95 ? n0(Math.abs(o.kgTeorici) * 1000) + ' g' : n1(Math.abs(o.kgTeorici)) + ' kg') + ' di grasso ' + (o.kgTeorici >= 0 ? 'in meno' : 'in più')));
    t.push(tessera('Giorni entro la soglia', o.sottoSoglia + ' su ' + o.chiusi, '', o.serie > 1 ? 'gli ultimi ' + o.serie + ' di fila' : o.serie === 1 ? 'l\'ultimo sì' : 'l\'ultimo no', o.sottoSoglia === o.chiusi ? 'ok' : ''));
    if (o.mediaP != null) { const p = r.proteine; t.push(tessera('Proteine medie', n1(o.mediaP), 'g al giorno', p ? (o.mediaP < p[0] ? '▼ sotto il minimo di ' + p[0] + ' g' : o.mediaP > p[1] ? '▲ oltre ' + p[1] + ' g' : '✓ nell\'intervallo ' + p[0] + '–' + p[1] + ' g') : '', p ? (o.mediaP < p[0] ? 'sotto' : 'ok') : '')); }
    if (o.mediaF != null) { const f = r.fibra || [25, 30]; t.push(tessera('Fibra media', n1(o.mediaF), 'g al giorno', o.mediaF < f[0] ? '▼ sotto i ' + f[0] + '–' + f[1] + ' g di riferimento' : '✓ nel riferimento ' + f[0] + '–' + f[1] + ' g', o.mediaF < f[0] ? 'sotto' : 'ok')); }
    if (o.mediaPassi != null) t.push(tessera('Passi', n0(o.mediaPassi), 'al giorno', 'media dei giorni con il dato'));
    let s = '<div class="dz-tessere">' + t.join('') + '</div>';
    if (o.quote) s += '<div class="dz-riga-quote"><span class="e">Da dove viene l\'energia, in media</span>' + quote({ p: o.mediaP, c: o.mediaC, g: o.mediaG }) + '</div>';
    return s;
  }

  function peso() {
    const r = modello.rif, o = ind;
    if (!o.peso) return '<p class="dz-piccolo">Nel diario non c\'è ancora un peso. Una riga come «Peso: 107,4 kg» nel giorno della pesata basta perché compaia qui.</p>';
    let s = '<div class="dz-peso-testa"><p class="dz-lettura"><b>' + n1(o.peso.valore) + '</b> kg</p><p class="dz-piccolo">' + esc(media(o.peso.data)) + (o.peso.fonte === 'dichiarato' ? ', dichiarato' : '') +
      (o.variazione ? ' · <b>' + (o.variazione > 0 ? '+' : '−') + n1(Math.abs(o.variazione)) + ' kg</b> dall\'inizio' : '') + '</p></div>';
    if (r.pesoObiettivo != null) {
      s += '<div class="dz-mis" data-stato="percorso"><div class="pista" role="img" aria-label="' + escA('Percorso verso l\'obiettivo: ' + Math.round((o.progresso || 0) * 100) + '%') + '"><i class="pieno" style="width:' + ((o.progresso || 0) * 100).toFixed(1) + '%"></i></div>' +
        '<div class="estremi"><span>' + (o.pesoIniziale ? n1(o.pesoIniziale.peso) : '') + '</span><span>obiettivo ' + n1(r.pesoObiettivo) + ' kg</span></div></div>';
    }
    s += '<div class="dz-grafico" data-grafico="peso"></div>';
    const righe = [];
    if (o.bmi) righe.push(['BMI', n1(o.bmi) + (o.bmiObiettivo ? ' <small>→ ' + n1(o.bmiObiettivo) + ' all\'obiettivo</small>' : '')]);
    if (o.daPerdere != null) righe.push(['Da perdere', n1(o.daPerdere) + ' kg']);
    if (o.arrivoPiano && o.daPerdere > 0) righe.push(['Arrivo, al ritmo del piano', esc(maiuscola(meseAnno(o.arrivoPiano))) + ' <small>(' + n1(r.ritmo) + ' kg a settimana)</small>']);
    if (o.settimaneDeficit && o.daPerdere > 0) righe.push(['Al ritmo del deficit medio', 'circa ' + n0(o.settimaneDeficit) + ' settimane']);
    righe.push(['Vita', o.vita ? n1(o.vita.valore) + ' cm' + (o.vitaAltezza ? ' <small>vita/statura ' + o.vitaAltezza.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + '</small>' : '') : '<small>da rilevare</small>']);
    righe.push(['Collo', o.collo ? n1(o.collo.valore) + ' cm' : '<small>da rilevare</small>']);
    s += '<dl class="dz-elenco">' + righe.map(x => '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>').join('') + '</dl>';
    const mis = modello.misure.slice().reverse();
    s += '<h3>Misure registrate</h3><div class="dz-scorri"><table class="dz-tab dz-misure"><thead><tr><th>Data</th><th>Peso</th><th>Vita</th><th>Collo</th></tr></thead><tbody>' +
      mis.slice(0, 8).map(x => '<tr><td>' + esc(corta(x.data) + ' ' + x.data.slice(0, 4)) + '</td><td class="k">' + (x.peso == null ? '—' : n1(x.peso) + ' kg') + '</td><td class="k">' + (x.vita == null ? '—' : n1(x.vita) + ' cm') + '</td><td class="k">' + (x.collo == null ? '—' : n1(x.collo) + ' cm') + '</td></tr>').join('') +
      '</tbody></table></div>' + (mis.length > 8 ? '<p class="dz-piccolo">Le ultime 8 di ' + mis.length + '.</p>' : '');
    return s;
  }

  function tabella() {
    return '<div class="dz-scorri"><table class="dz-tab"><thead><tr><th>Giorno</th><th>Stato</th><th>kcal</th><th>Soglia</th><th>Proteine</th><th>Carboidrati</th><th>Grassi</th><th>Fibra</th><th>Bilancio</th></tr></thead><tbody>' +
      modello.giorni.slice().reverse().map(g => '<tr><td><button class="filo" data-giorno="' + g.data + '">' + esc(corta(g.data) + ' ' + g.data.slice(0, 4)) + '</button></td><td>' + esc(giudizio(g).t) + '</td><td class="k">' + n0(g.kcal) + '</td><td class="k">' + n0(g.soglia) + '</td>' +
        ['p', 'c', 'g', 'f'].map(k => '<td class="k">' + (g.macro[k] == null ? '—' : n1(g.macro[k]) + ' g') + '</td>').join('') + '<td class="k">' + (g.deficit == null ? '—' : (g.deficit >= 0 ? '−' : '+') + n0(Math.abs(g.deficit))) + '</td></tr>').join('') + '</tbody></table></div>';
  }

  function fonte() {
    const g = modello.giorni, u = g[g.length - 1];
    const q = st.modificato ? 'file del ' + new Date(st.modificato).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '') : st.origine === 'remoto' ? 'ricevuto da GitHub' : '';
    return g.length + (g.length === 1 ? ' giorno registrato' : ' giorni registrati') + ', l\'ultimo ' + media(u.data) + (q ? ' · ' + q : '');
  }

  /* ------------------------------------------------------------ disegno */
  function vuoto() {
    el.innerHTML = '<div class="dz"><section class="dz-foglio dz-benvenuto"><h2>Diario alimentare</h2>' +
      '<p>Qui BiaWrite legge il file <code>diario-alimentare.md</code> e ne ricava il quadro della dieta: calorie nel tempo, peso, indicatori, calendario e dettaglio di ogni giorno.</p><p><b>Sola lettura.</b> BiaWrite non può modificare il diario: lo apre senza permesso di scrittura e qui dentro non c\'è nulla con cui cambiarlo.</p>' +
      '<p><button class="tasto pieno" data-a="aggiorna">Scegli il file del diario</button></p>' +
      '<p class="dz-piccolo">Una copia di ciò che è stato letto resta su questo dispositivo e, se GitHub è collegato, nel tuo repository privato (cartella <code>diario/</code>), per vederlo dagli altri dispositivi: si può escludere dalle impostazioni. Non finisce mai nel sito pubblico dell\'app.</p></section></div>';
  }
  function disegna() {
    if (!el) return;
    if (!modello) { vuoto(); return; }
    const alto = el.scrollTop;
    const avv = modello.avvisi.length ? '<details class="dz-avvisi"><summary>' + modello.avvisi.length + (modello.avvisi.length === 1 ? ' incongruenza' : ' incongruenze') + ' nel file</summary><ul>' + modello.avvisi.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '';
    el.innerHTML = '<div class="dz">' +
      '<header class="dz-testa"><p class="dz-fonte">' + esc(maiuscola(fonte())) + '</p>' + avv + '<span class="dz-sola" title="BiaWrite legge il diario e non può modificarlo">sola lettura</span><button class="tasto bordo" data-a="aggiorna">' + (handle ? 'Rileggi il file' : 'Leggi il file') + '</button></header>' +
      '<div class="dz-griglia">' +
      '<section class="dz-foglio dz-andamento" aria-labelledby="dz-t1"><div class="dz-foglio-testa"><h2 id="dz-t1">Calorie</h2>' +
        '<div class="dz-filtri" role="group" aria-label="Periodo">' + [[30, '30 giorni'], [90, '90 giorni'], [0, 'Tutto']].map(x => '<button data-a="periodo" data-v="' + x[0] + '" aria-pressed="' + (intervallo === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
        '<div class="dz-grafico" data-grafico="kcal"></div><p class="dz-leg" id="dz-leg-kcal"></p>' +
        '<details class="dz-nota"><summary>Tutti i giorni in tabella</summary>' + tabella() + '</details></section>' +
      '<section class="dz-foglio dz-peso" aria-labelledby="dz-t2"><h2 id="dz-t2">Peso</h2>' + peso() + '</section>' +
      '<section class="dz-foglio dz-indici" aria-labelledby="dz-t3"><h2 id="dz-t3">In sintesi <small>' + (ind.chiusi ? 'sulle ' + ind.chiusi + ' giornate chiuse' : '') + '</small></h2>' + sintesi() + '</section>' +
      '<section class="dz-foglio dz-cal" aria-label="Calendario">' + calendario() + '</section>' +
      '<section class="dz-foglio dz-giorno" aria-label="Il giorno scelto">' + dettaglio() + '</section>' +
      (modello.sezioni.length ? '<section class="dz-foglio dz-scheda" aria-labelledby="dz-t4"><h2 id="dz-t4">Scheda</h2>' + modello.sezioni.map((x, i) => '<details class="dz-nota grande"' + (i === 0 ? ' open' : '') + '><summary>' + esc(x.titolo) + '</summary><div class="dz-prosa">' + mdHtml(x.md) + '</div></details>').join('') + '</section>' : '') +
      '</div></div><div class="dz-fumetto" role="status" hidden></div>';
    grafici();
    el.scrollTop = alto;
  }
  function grafici() {
    if (!el || !modello) return;
    const k = $('[data-grafico="kcal"]', el);
    if (k && k.clientWidth) {
      const g = graficoKcal(Math.max(280, k.clientWidth));
      k.innerHTML = g.svg;
      $('#dz-leg-kcal', el).innerHTML = '<span><i class="ch ba ok"></i>kcal del giorno</span><span><i class="ch ba corso"></i>giornata in corso</span><span><i class="ch tr oltre">▲</i>oltre la soglia</span>' + (g.conMedia ? '<span><i class="ch li"></i>media su 7 giorni</span>' : '');
    }
    const p = $('[data-grafico="peso"]', el);
    if (p && p.clientWidth) p.innerHTML = graficoPeso(Math.max(240, p.clientWidth));
  }

  /* ------------------------------------------------------------ gesti */
  function scegli(d, porta) {
    if (!d || !modello.giorni.some(g => g.data === d)) return;
    sel = d; mese = d.slice(0, 7);
    $('.dz-cal', el).innerHTML = calendario();
    $('.dz-giorno', el).innerHTML = dettaglio();
    grafici();
    if (porta) { const g = $('.dz-giorno', el); if (g.getBoundingClientRect().top > innerHeight * 0.6 || g.getBoundingClientRect().top < 0) g.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  }
  function fumetto(bersaglio) {
    const f = $('.dz-fumetto', el);
    if (!f) return;
    if (!bersaglio) { f.hidden = true; return; }
    f.textContent = '';
    const agg = (t, cls) => { const x = document.createElement(cls === 'v' ? 'b' : 'span'); x.textContent = t; if (cls) x.className = cls; f.appendChild(x); };
    if (bersaglio.dataset.giorno) {
      const g = modello.giorni.find(x => x.data === bersaglio.dataset.giorno);
      if (!g) return;
      agg(n0(g.kcal) + ' kcal', 'v'); agg(maiuscola(fData(g.data, { weekday: 'short', day: 'numeric', month: 'long' })), 'd'); agg(SEGNO[giudizio(g).k] + ' ' + giudizio(g).t, 's');
      if (g.macro.p != null) agg('proteine ' + n1(g.macro.p) + ' g', 's');
    } else if (bersaglio.dataset.peso) {
      const m = modello.misure.find(x => x.data === bersaglio.dataset.peso);
      if (!m) return;
      agg(n1(m.peso) + ' kg', 'v'); agg(maiuscola(media(m.data)) + ' ' + m.data.slice(0, 4), 'd');
      if (m.fonte === 'dichiarato') agg('dichiarato', 's');
    } else return;
    f.hidden = false;
    const r = bersaglio.getBoundingClientRect(), b = el.getBoundingClientRect();
    const larg = f.offsetWidth, alt = f.offsetHeight;
    let x = r.left + r.width / 2 - larg / 2, y = r.top - alt - 8;
    if (bersaglio.classList.contains('tocco') && bersaglio.tagName === 'rect') y = Math.max(b.top + 4, r.top - alt + 26);
    f.style.left = Math.max(b.left + 6, Math.min(b.right - larg - 6, x)) + 'px';
    f.style.top = Math.max(b.top + 4, y) + 'px';
  }

  function collega() {
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (a) {
        if (a.dataset.a === 'aggiorna') aggiorna();
        else if (a.dataset.a === 'periodo') { intervallo = +a.dataset.v; $$('[data-a="periodo"]', el).forEach(b => b.setAttribute('aria-pressed', String(b === a))); grafici(); }
        else if (a.dataset.a === 'mese') {
          const [y, m] = mese.split('-').map(Number), d = new Date(Date.UTC(y, m - 1 + +a.dataset.v, 1));
          mese = d.toISOString().slice(0, 7);
          $('.dz-cal', el).innerHTML = calendario();
          const b = $('[data-a="mese"][data-v="' + a.dataset.v + '"]:not(:disabled)', el) || $('#dz-mese', el);
          if (b && b.focus) b.focus();
        }
        return;
      }
      const g = e.target.closest('[data-giorno]');
      if (g && g.dataset.giorno) {
        const daCal = !!g.closest('.dz-cal'), daTesta = !!g.closest('.dz-g-testa');
        scegli(g.dataset.giorno, !daTesta);
        if (daCal) { const b = $('.gc.scelto', el); if (b) b.focus({ preventScroll: true }); }
        if (daTesta) { const h = $('.dz-g-testa h2', el); if (h) h.focus({ preventScroll: true }); }
      }
    });
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tocco') && e.target.dataset.giorno) { e.preventDefault(); scegli(e.target.dataset.giorno, true); }
    });
    const su = e => { const t = e.target.closest && e.target.closest('.tocco'); if (t) fumetto(t); };
    const giu = e => { const t = e.target.closest && e.target.closest('.tocco'); if (t) fumetto(null); };
    el.addEventListener('pointerover', su); el.addEventListener('focusin', su);
    el.addEventListener('pointerout', giu); el.addEventListener('focusout', giu);
    el.addEventListener('scroll', () => fumetto(null), { passive: true });
    if (root.ResizeObserver) {
      let largo = 0, t = 0;
      osserva = new ResizeObserver(() => { const w = el.clientWidth; if (w && w !== largo) { largo = w; clearTimeout(t); t = setTimeout(grafici, 60); } });
      osserva.observe(el);
    }
    document.addEventListener('visibilitychange', () => { if (aperto && !document.hidden) rileggi(false); });
  }

  /** Apre il cockpit dentro `contenitore`; se c'è un file ricordato e il permesso è già dato, lo rilegge. */
  async function apri(contenitore) {
    await avvia();
    if (el !== contenitore) { el = contenitore; collega(); }
    aperto = true;
    if (modello) { sel = modello.giorni[modello.giorni.length - 1].data; mese = sel.slice(0, 7); }
    disegna();
    el.scrollTop = 0;
    rileggi(false);
  }
  function chiudi() { aperto = false; if (el) fumetto(null); }

  /* ------------------------------------------------------------ il pulsante sulla plancia */
  function pulsanteHtml() {
    let riga = 'scegli il file del diario', etichetta = 'tocca per caricare il diario', graf = '';
    if (modello) {
      const gg = modello.giorni, u = gg[gg.length - 1], ult = gg.slice(-12), soglia = u.soglia || modello.rif.target;
      etichetta = gg.length + (gg.length === 1 ? ' giorno' : ' giorni') + ' · ' + corta(u.data);
      riga = corta(u.data) + ' · ' + n0(u.kcal) + (soglia ? ' di ' + n0(soglia) : '') + ' kcal';
      const max = Math.max(...ult.map(g => g.kcal || 0), soglia || 0, 1) * 1.08;
      graf = '<svg class="pl-graf" viewBox="0 0 ' + (ult.length * 7 + 1) + ' 30" aria-hidden="true">' + (soglia ? '<line x1="0" x2="' + (ult.length * 7 + 1) + '" y1="' + (30 - soglia / max * 28).toFixed(1) + '" y2="' + (30 - soglia / max * 28).toFixed(1) + '"/>' : '') +
        ult.map((g, k) => '<rect x="' + (1 + k * 7) + '" width="5" rx="1" y="' + (30 - (g.kcal || 0) / max * 28).toFixed(1) + '" height="' + ((g.kcal || 0) / max * 28).toFixed(1) + '"' + (g.stato === 'corso' ? ' class="c"' : '') + '/>').join('') + '</svg>';
    }
    return '<button class="pl-diario" data-t="diario" aria-label="' + escA('Diario alimentare, ' + etichetta) + '"><svg class="pl-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M9.3 19V5M14.6 19v-7M20 19V8"/></svg>' +
      '<span class="pl-testo"><b>Diario alimentare</b><small>' + esc(riga) + '</small></span>' + graf + '</button>';
  }

  root.BiaCruscotto = {
    avvia, apri, chiudi, imposta, segnaInviato, svuota, aggiorna, rileggi, pulsanteHtml,
    stato: () => ({ testo: st.testo, sha: st.sha, sporco: st.sporco, origine: st.origine, giorni: modello ? modello.giorni.length : 0 }),
    get modello() { return modello; }, get indicatori() { return ind; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
