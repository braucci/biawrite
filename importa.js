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
      if (/\.zip$/i.test(f.name)) {
        try { voci.push(...apriZip(await f.arrayBuffer()).map(x => Object.assign(x, { percorso: f.name + '/' + x.percorso }))); }
        catch (e) { scartati.push({ percorso, motivo: 'archivio illeggibile' }); }
      } else voci.push(daFile(f, percorso));
    }
    return { voci, scartati };
  }

  /* --------------------------------------------------------- esame */
  /**
   * Legge le voci e le trasforma in note candidate:
   * { titolo, tipo: 'md'|'txt', testo, data, origine: 'md'|'txt'|'html', percorso }
   */
  async function esamina(voci, Core) {
    const pronte = [], scartati = [];
    for (const v of voci) {
      const parti = v.percorso.split('/');
      const nome = parti[parti.length - 1];
      if (!nome || nome.startsWith('.') || parti.includes('__MACOSX') || nome === 'Thumbs.db' || nome === 'desktop.ini') continue;
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

  root.BiaImporta = { decodifica, apriZip, daFile, daVoceTrascinata, raccogli, esamina, TIPI };
})(typeof window !== 'undefined' ? window : globalThis);
