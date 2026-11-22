/* BiaWrite — importa.js
 * Lettura delle vecchie note: file .md, .txt, .html, cartelle e archivi .zip.
 * Restituisce testi pronti da trasformare in note; non tocca l'interfaccia.
 * © B. Raucci — licenza MIT
 */
(function (root) {
  'use strict';

  const TIPI = { md: 'md', markdown: 'md', mdown: 'md', mkd: 'md', txt: 'txt', text: 'txt', html: 'html', htm: 'html' };
  const MASSIMO = 2 * 1024 * 1024;              // una nota da 2 MB è già un libro

  /* --------------------------------------------------------- testo */
  /* UTF-8 se valido (con o senza BOM), UTF-16 se marcato, altrimenti Windows-1252:
   * è la codifica dei vecchi file di testo italiani scritti su Windows.               */
  function decodifica(b) {
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
    catch (e) { return new TextDecoder('windows-1252').decode(b); }
  }

  /* --------------------------------------------------------- zip */
  const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
  function nomeZip(b, utf) {
    if (utf) return new TextDecoder('utf-8').decode(b);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); }               // molti programmi scrivono UTF-8 senza dichiararlo
    catch (e) { let s = ''; for (const x of b) s += x < 128 ? String.fromCharCode(x) : CP437[x - 128]; return s; }
  }
  function dataDos(d, o) {
    if (!d) return 0;
    const t = new Date(1980 + (d >> 9), ((d >> 5) & 15) - 1, d & 31, o >> 11, (o >> 5) & 63, (o & 31) * 2).getTime();
    return isNaN(t) ? 0 : t;
  }

  /** Legge l'indice di un archivio .zip. Ogni voce sa leggersi da sé, quando serve. */
  function apriZip(buf) {
    const v = new DataView(buf), u = new Uint8Array(buf);
    let fine = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 22 - 65535); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fine = i; break; }
    }
    if (fine < 0) throw new Error('non è un archivio zip');
    const quante = v.getUint16(fine + 10, true);
    let p = v.getUint32(fine + 16, true);
    const voci = [];
    for (let k = 0; k < quante; k++) {
      if (p + 46 > u.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('archivio zip danneggiato');
      const flag = v.getUint16(p + 8, true), metodo = v.getUint16(p + 10, true);
      const ora = v.getUint16(p + 12, true), giorno = v.getUint16(p + 14, true);
      const compresso = v.getUint32(p + 20, true), lunghezza = v.getUint32(p + 24, true);
      const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true);
      const locale = v.getUint32(p + 42, true);
      const nome = nomeZip(u.subarray(p + 46, p + 46 + ln), flag & 0x800);
      p += 46 + ln + le + lc;
      if (nome.endsWith('/')) continue;
      voci.push({
        percorso: nome, data: dataDos(giorno, ora), dimensione: lunghezza, cifrato: !!(flag & 1),
        async leggi() {
          if (flag & 1) throw new Error('voce protetta da password');
          const n = v.getUint16(locale + 26, true), x = v.getUint16(locale + 28, true);
          const inizio = locale + 30 + n + x;
          const pezzo = u.subarray(inizio, inizio + compresso);
          if (metodo === 0) return pezzo;
          if (metodo !== 8) throw new Error('compressione non supportata');
          const flusso = new Blob([pezzo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          return new Uint8Array(await new Response(flusso).arrayBuffer());
        },
      });
    }
    return voci;
  }

  /* --------------------------------------------------------- sorgenti */
  const daFile = (f, percorso) => ({
    percorso: percorso || f.webkitRelativePath || f.name, data: f.lastModified || 0, dimensione: f.size,
    leggi: async () => new Uint8Array(await f.arrayBuffer()),
  });

  /** Cartella trascinata sulla bacheca: la si percorre tutta. */
  async function daVoceTrascinata(voce, prefisso) {
    if (!voce) return [];
    if (voce.isFile) {
      const f = await new Promise((res, rej) => voce.file(res, rej));
      return [{ file: f, percorso: prefisso + f.name }];
    }
    if (!voce.isDirectory) return [];
    const lettore = voce.createReader(), figli = [];
    for (;;) {
      const parte = await new Promise((res, rej) => lettore.readEntries(res, rej));
      if (!parte.length) break;
      figli.push(...parte);
    }
    const out = [];
    for (const c of figli) out.push(...await daVoceTrascinata(c, prefisso + voce.name + '/'));
    return out;
  }

  /** Da un elenco di File (scelti o trascinati) alle voci da esaminare; gli zip vengono aperti. */
  async function raccogli(elementi) {
    const voci = [], scartati = [];
    for (const el of elementi) {
      const f = el.file || el, percorso = el.percorso || f.webkitRelativePath || f.name;
      if (/\.(zip|bear2bk|textpack)$/i.test(f.name)) {                // .bear2bk e .textpack sono archivi zip
        try { voci.push(...apriZip(await f.arrayBuffer()).map(x => Object.assign(x, { percorso: f.name + '/' + x.percorso }))); }
        catch (e) { scartati.push({ percorso, motivo: 'archivio illeggibile' }); }
      } else voci.push(daFile(f, percorso));
    }
    return { voci, scartati };
  }

  /* --------------------------------------------------------- Bear e TextBundle
   * Un backup di Bear (.bear2bk) è uno zip di cartelle «.textbundle», una per nota:
   *   info.json   date, puntina, cestino, identificativo (sotto la chiave net.shinyfrog.bear)
   *   text.md     il testo, la cui prima riga è il titolo
   *   assets/     le immagini e gli allegati richiamati dal testo come assets/nome
   */

  /* Note di programmazione o di LaTeX: si conservano come testo esatto, perché lì
   * contano rientri, barre rovesce, asterischi e trattini bassi. */
  const SEGNI_CODICE = [
    /^\s*\\[a-zA-Z]+/, /^\s*#(include|define|ifdef|ifndef|endif|pragma)\b/, /^#!\//,
    /^\s*(import [\w.]+|from [\w.]+ import|def \w+\(|class \w+[(:{]|function\b|var |let |const |public |private |static |return\b|elif |else\s*[:{]|print\(|printf\(|struct |typedef |void |int \w|float \w|double \w|char \w)/,
    /^\s*(if|for|while|switch)\s*\(/, /^\s*<\/?[a-zA-Z!][^>]*>/, /^\s*[{}\[\]()]+[;,]?\s*$/,
    /^\s*[.#]?[\w-]+(\s*[,>]\s*[.#]?[\w-]+)*\s*\{\s*$/, /^\s*[\w-]+\s*:\s*[^;]+;\s*$/, /^\s*(set|unset|plot|splot)\s/, /^\s*%/,
    /^\s*[\w.]+(\[[^\]]*\])?\s*[-+*/]?=\s*\S/, /^\s*[\w.]+\([^)]*\)\s*$/,
  ];
  const LATEX = /\\\[|\$\$|\\begin\{|\\(frac|sqrt|section\*?|subsection\*?|usepackage|documentclass|mathrm|mathbf)\b/;
  function tecnica(t) {
    if (LATEX.test(t)) return true;
    const righe = t.split('\n').slice(1).filter(l => l.trim());                  // la prima riga è il titolo
    if (righe.length < 3 || righe.filter(l => /^\s*(```|~~~)/.test(l)).length >= 2) return false;
    let n = 0;
    for (const l of righe) if (SEGNI_CODICE.some(r => r.test(l)) || (/[;{]\s*$/.test(l) && /[(){}=<>\[\]]/.test(l))) n++;
    return n / righe.length >= 0.4;
  }

  /* ==evidenziato== di Bear → <mark>, fuori dal codice */
  function evidenzia(riga) {
    return riga.split(/(`+[^`]*`+)/).map((x, k) => (k % 2 ? x : x.replace(/==(?=\S)([^=\n]+?)(?<=\S)==/g, '<mark>$1</mark>'))).join('');
  }

  /* In Bear ogni a capo va a capo; nel Markdown due righe consecutive si fondono.
   * Fra due righe di testo si mette un a capo esplicito (due spazi), fra blocchi
   * di natura diversa una riga vuota. Le righe non cambiano: si aggiungono solo
   * spazi in fondo e righe vuote, quindi la trasformazione è reversibile. */
  function specie(l) {
    if (!l.trim()) return 'vuota';
    if (/^ {0,3}(`{3,}|~{3,})/.test(l)) return 'recinto';
    if (/^ {0,3}#{1,6}(\s|$)/.test(l)) return 'titolo';
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(l) || /^ {0,3}=+ *$/.test(l)) return 'linea';
    if (/^\s*>/.test(l)) return 'citazione';
    if (/^\s*([-*+]|\d{1,9}[.)])(\s|$)/.test(l)) return 'voce';
    if (/^\s*\|/.test(l)) return 'tabella';
    if (/^ {0,3}<\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|center|table|hr|figure|section|article)\b[^>]*>/i.test(l)) return 'html';
    return 'testo';
  }
  function righeBear(t) {
    const r = t.split('\n'), out = [];
    let recinto = null;
    for (let i = 0; i < r.length; i++) {
      let a = r[i];
      if (recinto) { out.push(a); if (new RegExp('^ {0,3}' + recinto[0] + '{' + recinto.length + ',}\\s*$').test(a)) recinto = null; continue; }
      const m = a.match(/^ {0,3}(`{3,}|~{3,})/);
      if (m) { recinto = m[1]; out.push(a); continue; }
      const sa = specie(a);
      if (sa !== 'vuota') a = evidenzia(a);
      const b = i + 1 < r.length ? r[i + 1] : '';
      const sb = specie(b);
      if (sa === 'vuota' || sb === 'vuota') { out.push(a); continue; }
      const contenuto = x => x.replace(/^\s*>\s?/, '').trim();
      if (sa === 'testo' && sb === 'testo') a = /( {2,}|\\)$/.test(a) && !/\\$/.test(a) ? a : a + '  ';
      else if (sa === 'citazione' && sb === 'citazione') { if (contenuto(a) && contenuto(b)) a += '  '; }
      else if (sa === sb && (sa === 'voce' || sa === 'tabella' || sa === 'html')) { /* lo stesso blocco continua */ }
      else if (sa === 'titolo' || sb === 'titolo' || sb === 'recinto') { /* si delimitano da sé */ }
      else { out.push(a, ''); continue; }
      out.push(a);
    }
    return out.join('\n');
  }

  function daBear(t) {
    t = t.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (tecnica(t)) return { tipo: 'txt', testo: t.replace(/^# /, '') };          // «# » è il titolo aggiunto da Bear
    return { tipo: 'md', testo: righeBear(t) };
  }

  /* Testo finale di una nota di Bear: conversione, vecchie immagini di Bear 1 «[image:ID/nome]»
   * rese come immagini Markdown, allegati mai citati aggiunti in fondo perché restino visibili. */
  const codificaNome = n => n.split('/').map(x => encodeURIComponent(x).replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/');
  const IMMAGINE = /\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?)$/i;
  const rimando = n => (IMMAGINE.test(n) ? '![](assets/' + codificaNome(n) + ')' : '[' + n + '](assets/' + codificaNome(n) + ')');
  function testoBear(grezzo, nomi) {
    const r = daBear(grezzo);
    if (r.tipo === 'txt') return r;
    let x = r.testo.replace(/\[(image|file):[^\]\/\n]*\/([^\]\n]+)\]/g, (m, k, n) => (k === 'image' ? '![](assets/' + codificaNome(n) + ')' : '[' + n + '](assets/' + codificaNome(n) + ')'));
    const orfani = (nomi || []).filter(n => !x.includes('assets/' + codificaNome(n)) && !x.includes('assets/' + n));
    if (orfani.length) x = x.replace(/\n*$/, '') + '\n\n' + orfani.map(rimando).join('\n\n') + '\n';
    return { tipo: 'md', testo: x };
  }

  async function esaminaBundle(nome, parti) {
    const testo = parti.get('text.md') || parti.get('text.markdown') || parti.get('text.txt') ||
      [...parti].find(([k]) => /^text\.[^/]+$/.test(k))?.[1];
    if (!testo) return { scarto: 'senza testo' };
    let meta = {};
    const info = parti.get('info.json');
    if (info) { try { meta = (JSON.parse(decodifica(await info.leggi())) || {})['net.shinyfrog.bear'] || {}; } catch (e) { meta = {}; } }
    if (meta.locked || meta.encrypted) return { scarto: 'nota cifrata in Bear' };
    const grezzo = decodifica(await testo.leggi());
    const allegati = [...parti].filter(([k]) => k.startsWith('assets/') && k.length > 7).map(([k, v]) => ({ nome: k.slice(7), voce: v }));
    const { tipo, testo: convertito } = testoBear(grezzo, allegati.map(a => a.nome));
    const data = Date.parse(meta.modificationDate) || testo.data || 0;
    return { nota: {
      titolo: nome.replace(/^.*\//, '').trim() || 'Nota di Bear', tipo, testo: convertito, grezzo, data,
      creata: Date.parse(meta.creationDate) || data, fissata: !!meta.pinned, cestino: !!meta.trashed,
      id: String(meta.uniqueIdentifier || '').replace(/[^0-9a-z]/gi, '').slice(0, 8).toLowerCase(), bear: String(meta.uniqueIdentifier || ''),
      allegati, origine: 'bear', percorso: nome + '.textbundle' } };
  }

  /* --------------------------------------------------------- esame */
  /**
   * Legge le voci e le trasforma in note candidate:
   * { titolo, tipo: 'md'|'txt', testo, data, origine: 'md'|'txt'|'html'|'bear', percorso, [creata, fissata, cestino, allegati, id, grezzo] }
   */
  async function esamina(voci, Core) {
    const pronte = [], scartati = [];
    // prima le cartelle .textbundle (Bear, Ulysses, iA Writer…): ogni cartella è una nota
    const pacchi = new Map(), sciolte = [];
    for (const v of voci) {
      const m = v.percorso.match(/^(.*?)\.textbundle\/(.+)$/i);
      if (m) { if (!pacchi.has(m[1])) pacchi.set(m[1], new Map()); pacchi.get(m[1]).set(m[2], v); }
      else sciolte.push(v);
    }
    for (const [nome, parti] of pacchi) {
      try {
        const r = await esaminaBundle(nome, parti);
        if (r.scarto) scartati.push({ percorso: nome.replace(/^.*\//, '') + '.textbundle', motivo: r.scarto });
        else if (!r.nota.testo.trim() && !r.nota.allegati.length) scartati.push({ percorso: r.nota.percorso.replace(/^.*\//, ''), motivo: 'vuoto' });
        else pronte.push(r.nota);
      } catch (e) { scartati.push({ percorso: nome + '.textbundle', motivo: 'illeggibile' }); }
    }
    for (const v of sciolte) {
      const parti = v.percorso.split('/');
      const nome = parti[parti.length - 1];
      if (!nome || nome.startsWith('.') || parti.includes('__MACOSX') || nome === 'Thumbs.db' || nome === 'desktop.ini') continue;
      if (pacchi.size && /^(backup|info)\.json$/i.test(nome)) continue;           // indice del backup di Bear
      const m = nome.match(/^(.*)\.([^.]+)$/);
      const ext = m ? m[2].toLowerCase() : '';
      const origine = TIPI[ext];
      if (!origine) { scartati.push({ percorso: v.percorso, motivo: ext === 'zip' ? 'archivio dentro un archivio' : 'formato non di testo' }); continue; }
      if (v.cifrato) { scartati.push({ percorso: v.percorso, motivo: 'protetto da password' }); continue; }
      if (v.dimensione > MASSIMO) { scartati.push({ percorso: v.percorso, motivo: 'troppo grande' }); continue; }
      let testo;
      try { testo = decodifica(await v.leggi()); }
      catch (e) { scartati.push({ percorso: v.percorso, motivo: 'illeggibile' }); continue; }
      testo = testo.replace(/\r\n?/g, '\n');
      let tipo = origine;
      if (origine === 'html') {
        testo = Core.htmlToMd(testo);
        tipo = 'md';
      }
      if (!testo.trim()) { scartati.push({ percorso: v.percorso, motivo: 'vuoto' }); continue; }
      pronte.push({ titolo: m[1].trim() || 'Nota importata', tipo, testo, data: v.data || 0, origine, percorso: v.percorso });
    }
    return { pronte, scartati };
  }

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    heic: 'image/heic', pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime' };
  const mime = nome => MIME[(nome.match(/\.([^.]+)$/) || [])[1]?.toLowerCase()] || 'application/octet-stream';

  root.BiaImporta = { decodifica, apriZip, daFile, daVoceTrascinata, raccogli, esamina, daBear, testoBear, righeBear, tecnica, mime, TIPI };
})(typeof window !== 'undefined' ? window : globalThis);
