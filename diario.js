/* BiaWrite — diario.js
 * Lettore del diario alimentare: dal file Markdown (`diario-alimentare.md`) ricava un modello
 * ordinato — dati di riferimento, giorni, pasti, macronutrienti, misure — e gli indicatori
 * che servono al cockpit. Non scrive mai il file e non tocca l'interfaccia: si collauda da solo.
 *
 * Il file è scritto a mano (o da un assistente) e può cambiare un poco nel tempo: il lettore
 * cerca perciò la struttura, non la forma esatta. Un giorno è un titolo che comincia con una
 * data; un pasto è un sottotitolo seguito da una tabella con una colonna «kcal».
 * © B. Raucci — licenza MIT
 */
(function (root) {
  'use strict';

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const KCAL_PER_KG = 7700;                 // energia di 1 kg di tessuto adiposo (valore convenzionale)
  const due = n => String(n).padStart(2, '0');
  const iso = (a, m, g) => a + '-' + due(m) + '-' + due(g);
  const valida = (a, m, g) => { const d = new Date(Date.UTC(a, m - 1, g)); return d.getUTCFullYear() === +a && d.getUTCMonth() === m - 1 && d.getUTCDate() === +g; };

  /* numero scritto all'italiana: «1.571», «3,5», «≈ 318», «**≈ 296**» */
  const RE_NUM = /-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:[.,]\d+)?/;
  function num(s) {
    if (s == null) return null;
    const m = String(s).replace(/\*/g, '').match(RE_NUM);
    if (!m) return null;
    const t = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(m[0]) ? m[0].replace(/\./g, '') : m[0];
    const v = parseFloat(t.replace(',', '.'));
    return isFinite(v) ? v : null;
  }
  const N = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';

  /* una data all'inizio (o dentro) un testo: «22 novembre 2026», «20/11/2026», «2026-11-20» */
  const RE_DATE = [
    [new RegExp('(\\d{1,2})\\s+(' + MESI.join('|') + ')\\s+(\\d{4})', 'i'), m => [+m[3], MESI.indexOf(m[2].toLowerCase()) + 1, +m[1]]],
    [/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/, m => [+m[3], +m[2], +m[1]]],
    [/(\d{4})-(\d{2})-(\d{2})/, m => [+m[1], +m[2], +m[3]]],
  ];
  function data(s, soloInizio) {
    let migliore = null;
    for (const [re, f] of RE_DATE) {
      const m = String(s).match(re);
      if (!m) continue;
      const [a, me, g] = f(m);
      if (!valida(a, me, g)) continue;
      if (!migliore || m.index < migliore.pos) migliore = { iso: iso(a, me, g), pos: m.index, fine: m.index + m[0].length };
    }
    if (!migliore) return null;
    if (soloInizio && !/^\s*(?:(?:luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica),?\s+)?$/i.test(String(s).slice(0, migliore.pos))) return null;
    return migliore;
  }

  /* ---- struttura: titoli e righe (i blocchi di codice non contano come titoli) */
  function blocchi(testo) {
    const righe = String(testo || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    const o = [{ livello: 0, titolo: '', righe: [] }];
    let recinto = null;
    for (const l of righe) {
      const r = l.match(/^ {0,3}(`{3,}|~{3,})/);
      if (r) { if (!recinto) recinto = r[1][0]; else if (r[1][0] === recinto) recinto = null; }
      const m = !recinto && l.match(/^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/);
      if (m) o.push({ livello: m[1].length, titolo: m[2].trim(), righe: [] });
      else o[o.length - 1].righe.push(l);
    }
    return o;
  }
  const pulito = s => String(s || '').replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  const celle = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const RE_SEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

  /* tabelle di un gruppo di righe: [{ testa: [...], righe: [[...]], da, a }] */
  function tabelle(righe) {
    const o = [];
    for (let i = 0; i + 1 < righe.length; i++) {
      if (!righe[i].includes('|') || !RE_SEP.test(righe[i + 1]) || !righe[i + 1].includes('-')) continue;
      const t = { testa: celle(righe[i]), righe: [], da: i, a: i + 2 };
      let k = i + 2;
      while (k < righe.length && righe[k].includes('|') && righe[k].trim()) { t.righe.push(celle(righe[k])); k++; }
      t.a = k; o.push(t); i = k - 1;
    }
    return o;
  }

  /* ---- macronutrienti scritti in una frase: «carboidrati ≈ 54 g, proteine ≈ 13 g, …» */
  const VOCI = { c: 'carboidrati', p: 'proteine', g: 'grassi', f: 'fibr[ae]', z: 'zuccheri', s: 'sale' };
  const RE_MACRO = {};
  for (const k in VOCI) RE_MACRO[k] = new RegExp('\\b' + VOCI[k] + '\\b\\s*[:=]?\\s*(?:≈|~|≥|circa|pari a)?\\s*' + N + '\\s*g\\b', 'i');
  function macro(righe) {
    const o = {};
    const scelte = righe.filter(l => /macronutrienti|riepilogo|progressivo/i.test(l));
    for (const gruppo of [scelte, righe]) {
      for (const k in RE_MACRO) {
        if (o[k] != null) continue;
        for (const l of gruppo) { const m = l.match(RE_MACRO[k]); if (m) { o[k] = num(m[1]); break; } }
      }
    }
    return o;
  }

  /* ---- un pasto: sottotitolo + tabella con la colonna delle kcal */
  function pasto(b, avvisi, giorno) {
    const tt = tabelle(b.righe).filter(t => t.testa.some(c => /kcal|calorie/i.test(c)));
    if (!tt.length) return null;
    const p = { nome: pulito(b.titolo.replace(/\(.*$/, '')) || 'Pasto', ora: null, righe: [], kcal: null, dichiarate: null, macro: {}, note: '' };
    const ora = b.titolo.match(/(\d{1,2})[:.](\d{2})/);
    if (ora && +ora[1] < 24 && +ora[2] < 60) p.ora = due(+ora[1]) + ':' + ora[2];
    for (const t of tt) {
      const ik = t.testa.findIndex(c => /kcal|calorie/i.test(c));
      const iq = t.testa.findIndex(c => /quantit|porzion|peso|dose/i.test(c));
      const ia = t.testa.findIndex((c, i) => i !== ik && i !== iq);
      for (const r of t.righe) {
        const nome = pulito(r[ia < 0 ? 0 : ia]);
        const k = num(r[ik]);
        if (/^totale\b/i.test(nome)) { if (k != null) p.dichiarate = k; continue; }
        if (!nome) continue;
        p.righe.push({ nome: nome.replace(/\s*\(\*\)/g, '').trim(), quantita: iq < 0 ? '' : pulito(r[iq]).replace(/\s*\(\*\)/g, '').trim(), kcal: k == null ? 0 : k, stima: /\(\*\)/.test(r.join(' ')) || /≈/.test(r[iq < 0 ? ik : iq] || '') });
      }
    }
    const somma = p.righe.reduce((t, r) => t + r.kcal, 0);
    p.kcal = p.dichiarate != null ? p.dichiarate : somma;
    if (p.dichiarate != null && Math.abs(somma - p.dichiarate) > 1.5) avvisi.push(giorno + ', ' + p.nome.toLowerCase() + ': le righe sommano ' + Math.round(somma) + ' kcal, il totale scritto è ' + p.dichiarate + '.');
    const resto = b.righe.filter((l, i) => !tt.some(t => i >= t.da && i < t.a));
    p.macro = macro(resto);
    p.note = resto.join('\n').trim();
    return p;
  }

  function misureInRiga(l, o) {
    if (/obiettivo|persi\b|perdita|target|ogni\s+\d/i.test(l)) return;
    let m = l.match(/\b(?:peso|pesata|bilancia)\b[^\n.;]{0,50}?(\d{2,3}(?:[.,]\d{1,2})?)\s*kg\b/i);
    if (m) { const v = num(m[1]); if (v >= 35 && v <= 300) o.peso = v; }
    m = l.match(/\bvita\b[^\n.;<]{0,40}?(\d{2,3}(?:[.,]\d)?)\s*cm\b/i);
    if (m) { const v = num(m[1]); if (v >= 50 && v <= 200) o.vita = v; }
    m = l.match(/\bcollo\b[^\n.;<]{0,40}?(\d{2}(?:[.,]\d)?)\s*cm\b/i);
    if (m) { const v = num(m[1]); if (v >= 25 && v <= 70) o.collo = v; }
  }

  /* ---- un giorno: titolo con la data + tutto ciò che gli sta sotto */
  function giorno(testa, sotto, rif, oggi, avvisi) {
    const d = data(testa.titolo, true);
    const t = testa.titolo;
    const g = { data: d.iso, titolo: pulito(t.slice(d.fine).replace(/^\s*\([^)]*\)/, '').replace(/^[\s—–:-]+/, '')), stato: null,
      kcal: null, soglia: null, macro: {}, pasti: [], note: '', passi: null, acqua: null, peso: null, vita: null, collo: null };
    const etichetta = d.iso.slice(8) + '/' + d.iso.slice(5, 7);
    g.stato = /in\s+corso|aperta|parziale|progressivo/i.test(t) ? 'corso' : /chius|finale|conclus/i.test(t) ? 'chiusa' : (oggi && d.iso >= oggi ? 'corso' : 'chiusa');
    let m = t.match(new RegExp('(?:≈|~)?\\s*' + N + '\\s*kcal', 'i'));
    if (m) g.kcal = num(m[1]);
    m = t.match(new RegExp('(?:soglia|target|obiettivo)\\s*(?:≈|:)?\\s*' + N, 'i'));
    g.soglia = m ? num(m[1]) : rif.target;

    const intro = testa.righe.slice();
    const note = [];
    for (const b of sotto) {
      const p = pasto(b, avvisi, etichetta);
      if (p) g.pasti.push(p);
      else if (b.righe.some(l => l.trim())) note.push('**' + pulito(b.titolo) + '**\n\n' + b.righe.join('\n').trim());
    }
    const tutte = intro.concat(...sotto.map(b => b.righe));
    if (g.kcal == null) {
      const l = tutte.find(x => /totale\s+giornaliero/i.test(x));
      m = l && l.match(new RegExp('(?:≈|~)?\\s*' + N + '\\s*kcal', 'i'));
      if (m) g.kcal = num(m[1]);
    }
    const somma = g.pasti.reduce((s, p) => s + (p.kcal || 0), 0);
    if (g.kcal == null && g.pasti.length) g.kcal = somma;
    else if (g.kcal != null && g.pasti.length && Math.abs(somma - g.kcal) > 2) avvisi.push(etichetta + ': i pasti sommano ' + Math.round(somma) + ' kcal, il totale del giorno scritto è ' + g.kcal + '.');

    g.macro = macro(intro);
    for (const k of ['c', 'p', 'g', 'f']) {            // se il riepilogo manca, la somma dei pasti
      if (g.macro[k] != null) continue;
      const con = g.pasti.filter(p => p.macro[k] != null);
      if (con.length) { g.macro[k] = Math.round(con.reduce((s, p) => s + p.macro[k], 0) * 10) / 10; g.macro.parziale = con.length < g.pasti.length; }
    }
    const testo = intro.join('\n');
    m = testo.match(new RegExp('passi del giorno[^\\n]*?(?:≈|[^\\d\\n]:)\\s*(?:≈\\s*)?' + N + '(?![:\\d])', 'i')) || testo.match(new RegExp('(?:^|\\n)\\s*[-*]?\\s*passi\\s*(?:\\([^)]*\\))?\\s*:\\s*(?:≈\\s*)?' + N + '(?![:\\d])', 'i'));
    if (m) g.passi = num(m[1]);
    m = testo.match(new RegExp('(?:^|\\n)\\s*[-*]?\\s*(?:acqua|idratazione|bevande)\\b[^\\n:]*:\\s*(?:≈\\s*)?' + N + '\\s*(ml|cl|l|litri?)\\b', 'i'));
    if (m) g.acqua = Math.round(num(m[1]) * (/^ml$/i.test(m[2]) ? 1 : /^cl$/i.test(m[2]) ? 10 : 1000));
    for (const l of tutte) misureInRiga(l, g);
    g.note = [intro.join('\n').trim()].concat(note).filter(Boolean).join('\n\n');
    return g;
  }

  /* ---- dati di riferimento: statura, peso, obiettivi, fabbisogno */
  function riferimento(sezioni, tutto) {
    const s = sezioni.find(x => /dati di riferimento|riferimento|profilo/i.test(x.titolo));
    const t = s ? s.md : tutto;
    const r = { data: null, sesso: null, eta: null, statura: null, peso: null, pesoObiettivo: null, ritmo: null, bmr: null, tdee: null, target: null, proteine: null, fibra: null, idratazione: null };
    const cerca = re => { const m = t.match(re); return m ? num(m[1]) : null; };
    const d = s && data(s.titolo);
    r.data = d ? d.iso : null;
    r.sesso = /\bmaschio\b|\buomo\b/i.test(t) ? 'M' : /\bfemmina\b|\bdonna\b/i.test(t) ? 'F' : null;
    r.eta = cerca(/(\d{1,3})\s*anni\b/i);
    r.statura = cerca(/(?:statura|altezza)\s*:?\s*(\d(?:[.,]\d{1,2})?)\s*m\b/i);
    if (r.statura == null) { const cm = cerca(/(?:statura|altezza)\s*:?\s*(\d{3})\s*cm\b/i); if (cm) r.statura = cm / 100; }
    r.pesoObiettivo = cerca(new RegExp('peso\\s+obiettivo\\s*:?\\s*(?:≈\\s*)?' + N + '\\s*kg', 'i'));
    const senza = t.replace(/peso\s+obiettivo[^\n,;(]*/ig, '');
    const mp = senza.match(new RegExp('\\bpeso\\s*(?:attuale|iniziale|di partenza)?\\s*:?\\s*(?:≈\\s*)?' + N + '\\s*kg', 'i'));
    r.peso = mp ? num(mp[1]) : null;
    r.ritmo = cerca(new RegExp(N + '\\s*kg\\s*(?:\\/|a\\s+|alla\\s+)settimana', 'i'));
    r.bmr = cerca(new RegExp('\\bBMR\\b[^\\n≈:=]*(?:≈|:|=)\\s*' + N, 'i'));
    r.tdee = cerca(new RegExp('\\bTDEE\\b[^\\n≈:=]*(?:≈|:|=)\\s*' + N, 'i'));
    r.target = cerca(new RegExp('target\\s+giornaliero\\s*:?\\s*\\**\\s*(?:≈\\s*)?' + N + '\\s*kcal', 'i'));
    let m = t.match(/proteine\s*:?\s*(\d{2,3})\s*[-–]\s*(\d{2,3})\s*g/i);
    if (m) r.proteine = [+m[1], +m[2]];
    m = t.match(/fibr[ae]\s*:?\s*(\d{2})\s*[-–]\s*(\d{2})\s*g/i);
    if (m) r.fibra = [+m[1], +m[2]];
    m = t.match(new RegExp('(?:idratazione|acqua|bevande)[^\\n]*?(?:≈\\s*)?' + N + '\\s*l(?:itri)?\\s*\\/\\s*die', 'i'));
    if (m) r.idratazione = num(m[1]);
    return r;
  }

  /* ---- misure sparse nel testo e nelle tabelle «Misure» / «Pesate» */
  function misure(bl, giorni, rif) {
    const per = new Map();
    const metti = (d, o, fonte) => {
      if (!d || (o.peso == null && o.vita == null && o.collo == null)) return;
      const x = per.get(d) || { data: d };
      for (const k of ['peso', 'vita', 'collo']) if (o[k] != null) x[k] = o[k];
      x.fonte = fonte; per.set(d, x);
    };
    if (rif.data && rif.peso != null) metti(rif.data, { peso: rif.peso }, 'dichiarato');
    for (const b of bl) {
      if (b.giorno) continue;
      const t = b.righe.join('\n');
      const re = new RegExp(N + '\\s*kg\\s+(?:il|del|al)\\s+(\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{4})', 'g');
      let m;
      while ((m = re.exec(t))) { const d = data(m[2]); const v = num(m[1]); if (d && v >= 35 && v <= 300) metti(d.iso, { peso: v }, 'storico'); }
      for (const tb of tabelle(b.righe)) {
        const id = tb.testa.findIndex(c => /^data\b|giorno/i.test(c));
        const ip = tb.testa.findIndex(c => /peso/i.test(c)), iv = tb.testa.findIndex(c => /vita/i.test(c)), ic = tb.testa.findIndex(c => /collo/i.test(c));
        if (id < 0 || (ip < 0 && iv < 0 && ic < 0)) continue;
        for (const r of tb.righe) {
          const d = data(r[id] || '');
          if (!d) continue;
          const o = {};
          if (ip >= 0) { const v = num(r[ip]); if (v >= 35 && v <= 300) o.peso = v; }
          if (iv >= 0) { const v = num(r[iv]); if (v >= 50 && v <= 200) o.vita = v; }
          if (ic >= 0) { const v = num(r[ic]); if (v >= 25 && v <= 70) o.collo = v; }
          metti(d.iso, o, 'misura');
        }
      }
    }
    for (const g of giorni) metti(g.data, g, 'diario');
    return [...per.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
  }

  /**
   * leggi(testo, oggi?) → modello del diario.
   * `oggi` (AAAA-MM-GG) serve solo a capire se un giorno senza indicazione è ancora in corso.
   */
  function leggi(testo, oggi) {
    const bl = blocchi(testo);
    const avvisi = [];
    const titolo = (bl.find(b => b.livello === 1) || {}).titolo || 'Diario alimentare';
    // sezioni generali: i titoli di secondo livello (o il livello più alto presente dopo il titolo)
    const sezioni = [];
    const teste = [];                               // indici dei titoli-giorno
    bl.forEach((b, i) => { if (b.livello && data(b.titolo, true)) teste.push(i); });
    const inGiorno = new Set();
    const gruppi = teste.map(i => {
      const sotto = [];
      let k = i + 1;
      while (k < bl.length && bl[k].livello > bl[i].livello) { sotto.push(bl[k]); k++; }
      for (let j = i; j < k; j++) { inGiorno.add(j); bl[j].giorno = true; }
      return { testa: bl[i], sotto };
    });
    bl.forEach((b, i) => {
      if (inGiorno.has(i) || b.livello < 2) return;
      const md = b.righe.join('\n').trim();
      if (b.livello === 2) { if (md) sezioni.push({ titolo: pulito(b.titolo), md }); }
      else if (sezioni.length && md) sezioni[sezioni.length - 1].md += '\n\n**' + pulito(b.titolo) + '**\n\n' + md;
    });
    const rif = riferimento(sezioni, String(testo || ''));
    const per = new Map();
    for (const gr of gruppi) {
      try {
        const g = giorno(gr.testa, gr.sotto, rif, oggi, avvisi);
        if (per.has(g.data)) avvisi.push(g.data + ': giorno scritto due volte, vale l\'ultimo.');
        per.set(g.data, g);
      } catch (e) { avvisi.push('Un giorno non è leggibile: ' + pulito(gr.testa.titolo).slice(0, 60)); }
    }
    const giorni = [...per.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
    for (const g of giorni) g.deficit = g.stato === 'chiusa' && rif.tdee && g.kcal != null ? rif.tdee - g.kcal : null;
    return { titolo: pulito(titolo), rif, sezioni, giorni, misure: misure(bl, giorni, rif), avvisi };
  }

  const media = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const giorniTra = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  const piu = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

  /** indicatori(modello) → le grandezze riassuntive del cockpit (solo sui giorni chiusi). */
  function indicatori(m) {
    const r = m.rif, ch = m.giorni.filter(g => g.stato === 'chiusa' && g.kcal != null);
    const con = k => ch.filter(g => g.macro[k] != null).map(g => g.macro[k]);
    const o = { giorni: m.giorni.length, chiusi: ch.length, primo: m.giorni.length ? m.giorni[0].data : null, ultimo: m.giorni.length ? m.giorni[m.giorni.length - 1].data : null };
    o.mediaKcal = media(ch.map(g => g.kcal));
    o.media7 = media(ch.slice(-7).map(g => g.kcal));
    o.sottoSoglia = ch.filter(g => g.soglia && g.kcal <= g.soglia).length;
    o.serie = 0;
    for (let i = ch.length - 1; i >= 0 && ch[i].soglia && ch[i].kcal <= ch[i].soglia; i--) o.serie++;
    o.mediaP = media(con('p')); o.mediaC = media(con('c')); o.mediaG = media(con('g')); o.mediaF = media(con('f'));
    const def = ch.filter(g => g.deficit != null).map(g => g.deficit);
    o.mediaDeficit = media(def);
    o.deficitCumulato = def.reduce((s, x) => s + x, 0);
    o.kgTeorici = def.length ? o.deficitCumulato / KCAL_PER_KG : null;
    o.copertura = o.primo ? m.giorni.length / (giorniTra(o.primo, o.ultimo) + 1) : null;
    // quota di energia dai macronutrienti (4, 4 e 9 kcal/g), media dei giorni chiusi
    const quote = ch.filter(g => g.macro.p != null && g.macro.c != null && g.macro.g != null).map(g => {
      const p = g.macro.p * 4, c = g.macro.c * 4, gr = g.macro.g * 9, t = p + c + gr;
      return t ? [p / t, c / t, gr / t] : null;
    }).filter(Boolean);
    o.quote = quote.length ? [0, 1, 2].map(i => media(quote.map(q => q[i]))) : null;
    // peso
    const pesi = m.misure.filter(x => x.peso != null);
    const ultimo = pesi[pesi.length - 1] || null;
    const inizio = r.peso != null ? { data: r.data, peso: r.peso } : pesi[0] || null;
    o.peso = ultimo ? { valore: ultimo.peso, data: ultimo.data, fonte: ultimo.fonte } : null;
    o.pesoIniziale = inizio;
    if (ultimo && inizio) o.variazione = Math.round((ultimo.peso - inizio.peso) * 10) / 10;
    if (ultimo && r.statura) o.bmi = ultimo.peso / (r.statura * r.statura);
    if (r.pesoObiettivo && r.statura) o.bmiObiettivo = r.pesoObiettivo / (r.statura * r.statura);
    if (ultimo && r.pesoObiettivo != null) {
      o.daPerdere = Math.max(0, Math.round((ultimo.peso - r.pesoObiettivo) * 10) / 10);
      if (inizio && inizio.peso > r.pesoObiettivo) o.progresso = Math.min(1, Math.max(0, (inizio.peso - ultimo.peso) / (inizio.peso - r.pesoObiettivo)));
      if (r.ritmo) { o.settimanePiano = o.daPerdere / r.ritmo; o.arrivoPiano = piu(ultimo.data, Math.round(o.settimanePiano * 7)); }
      if (o.mediaDeficit > 0) { o.settimaneDeficit = o.daPerdere * KCAL_PER_KG / (o.mediaDeficit * 7); o.ritmoDeficit = o.mediaDeficit * 7 / KCAL_PER_KG; }
    }
    const vite = m.misure.filter(x => x.vita != null);
    if (vite.length) { const v = vite[vite.length - 1]; o.vita = { valore: v.vita, data: v.data }; if (r.statura) o.vitaAltezza = v.vita / (r.statura * 100); }
    const colli = m.misure.filter(x => x.collo != null);
    if (colli.length) o.collo = { valore: colli[colli.length - 1].collo, data: colli[colli.length - 1].data };
    const passi = m.giorni.filter(g => g.passi != null).map(g => g.passi);
    o.mediaPassi = media(passi);
    return o;
  }

  root.BiaDiario = { leggi, indicatori, num, data, KCAL_PER_KG, MESI };
})(typeof window !== 'undefined' ? window : globalThis);
