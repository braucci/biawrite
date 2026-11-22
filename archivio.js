/* BiaWrite — archivio.js
 * Lettura e scrittura delle note in un repository privato di GitHub, tramite le API REST.
 * Un giro di scrittura è un solo commit (API «Git Database»): note nuove, modifiche,
 * rinomine, eliminazioni e indice dei metadati cambiano insieme, oppure non cambia nulla.
 * Non tocca l'interfaccia: si collauda da solo.
 * © B. Raucci — licenza MIT
 */
(function (root) {
  'use strict';

  const API = 'https://api.github.com';
  const INDICE = '.biawrite.json';
  const utf8 = new TextEncoder();

  class ErroreArchivio extends Error {
    constructor(codice, messaggio, stato) { super(messaggio || codice); this.codice = codice; this.stato = stato; }
  }

  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function deb64(s) {
    const b = atob(String(s).replace(/\s/g, ''));
    const u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }

  /* Identificativo git di un contenuto: SHA-1 di «blob <lunghezza>\0<byte>».
   * Permette di sapere quale versione di un file si è scritta senza rileggere GitHub. */
  async function shaBlob(contenuto) {
    const dati = utf8.encode(contenuto);
    const testa = utf8.encode('blob ' + dati.length + '\0');
    const tutto = new Uint8Array(testa.length + dati.length);
    tutto.set(testa);
    tutto.set(dati, testa.length);
    const h = new Uint8Array(await crypto.subtle.digest('SHA-1', tutto));
    return Array.from(h, x => x.toString(16).padStart(2, '0')).join('');
  }

  /**
   * crea({ repo: 'utente/nome', chiave: stringa o funzione, cartella: 'note', ramo })
   * Restituisce l'oggetto che parla con quel repository.
   */
  function crea(opz) {
    const repo = String(opz.repo || '');
    const chiave = () => (typeof opz.chiave === 'function' ? opz.chiave() : opz.chiave) || '';
    const cartella = String(opz.cartella || 'note').replace(/^\/+|\/+$/g, '');
    const fetchFn = opz.fetch || root.fetch.bind(root);
    let ramo = opz.ramo || null;
    let cache = null;                                   // ultima istantanea letta o scritta

    const segmenti = p => p.split('/').map(encodeURIComponent).join('/');
    const R = '/repos/' + segmenti(repo);

    /* GitHub ammette di norma al più 80 richieste che creano contenuti al minuto e 500 all'ora:
     * qui si resta sotto le 60 al minuto, aspettando quando serve. */
    const scritture = [];
    async function freno() {
      for (;;) {
        const ora = Date.now();
        while (scritture.length && ora - scritture[0] > 60000) scritture.shift();
        if (scritture.length < 60) { scritture.push(ora); return; }
        await new Promise(r => setTimeout(r, 60000 - (ora - scritture[0]) + 50));
      }
    }

    async function chiama(metodo, percorso, corpo) {
      if (!chiave()) throw new ErroreArchivio('bloccato', 'chiave non disponibile');
      if (metodo !== 'GET') await freno();
      let r;
      try {
        r = await fetchFn(API + percorso, {
          method: metodo, cache: 'no-store',
          headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + chiave(), 'X-GitHub-Api-Version': '2022-11-28' },
            corpo ? { 'Content-Type': 'application/json' } : {}),
          body: corpo ? JSON.stringify(corpo) : undefined,
        });
      } catch (e) { throw new ErroreArchivio('rete', 'GitHub non è raggiungibile.'); }
      if (r.ok) return r.status === 204 ? null : r.json();
      let msg = '';
      try { msg = (await r.json()).message || ''; } catch (e) { /* corpo non JSON */ }
      const s = r.status;
      if (s === 401) throw new ErroreArchivio('chiave', msg, s);
      if ((s === 403 || s === 429) && (r.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(msg))) throw new ErroreArchivio('limite', msg, s);
      if (s === 403) throw new ErroreArchivio('permesso', msg, s);
      if (s === 404) throw new ErroreArchivio('non-trovato', msg, s);
      if (s === 409) throw new ErroreArchivio('vuoto', msg, s);
      if (s === 422 && /fast.?forward/i.test(msg)) throw new ErroreArchivio('avanti', msg, s);
      throw new ErroreArchivio('github', 'GitHub ha risposto ' + s + (msg ? ': ' + msg : ''), s);
    }

    /* Il repository esiste, la chiave lo vede, è privato? */
    async function verifica() {
      const r = await chiama('GET', R);
      ramo = r.default_branch || 'main';
      return { privato: !!r.private, ramo, nome: r.full_name || repo, url: r.html_url || 'https://github.com/' + repo };
    }
    const utente = async () => (await chiama('GET', '/user')).login;

    async function leggi(sha) {
      const b = await chiama('GET', R + '/git/blobs/' + sha);
      return new TextDecoder('utf-8').decode(deb64(b.content)).replace(/^\uFEFF/, '');
    }
    const leggiBinario = async sha => deb64((await chiama('GET', R + '/git/blobs/' + sha)).content);
    /* Carica un file (immagine, allegato) come oggetto git; restituisce il suo sha. */
    const caricaBlob = async bytes => (await chiama('POST', R + '/git/blobs', { content: b64(bytes), encoding: 'base64' })).sha;

    const vuota = () => ({ commit: null, albero: null, file: new Map(), allegati: new Map(), indice: { formato: 1, note: {} }, indiceSha: null });

    /* Istantanea del ramo: commit, albero, file della cartella delle note, indice dei metadati.
     * Se il ramo non è cambiato dall'ultima volta costa una sola richiesta. */
    async function istantanea() {
      if (!ramo) await verifica();
      let rif;
      try { rif = await chiama('GET', R + '/git/ref/heads/' + segmenti(ramo)); }
      catch (e) {
        if (e.codice === 'vuoto') return (cache = vuota());
        if (e.codice === 'non-trovato') { await verifica(); return (cache = vuota()); }     // repository c'è, ramo no
        throw e;
      }
      const commit = rif.object.sha;
      if (cache && cache.commit === commit) return cache;
      const c = await chiama('GET', R + '/git/commits/' + commit);
      const albero = await chiama('GET', R + '/git/trees/' + c.tree.sha + '?recursive=1');
      const file = new Map(), allegati = new Map();
      let indiceSha = null;
      for (const v of albero.tree || []) {
        if (v.type !== 'blob' || !v.path.startsWith(cartella + '/')) continue;
        const nome = v.path.slice(cartella.length + 1);
        if (nome.startsWith('allegati/')) { allegati.set(v.path, v.sha); continue; }
        if (nome.includes('/')) continue;                                    // solo la cartella, non le sottocartelle
        if (nome === INDICE) { indiceSha = v.sha; continue; }
        if (/\.(md|markdown|txt)$/i.test(nome) && !nome.startsWith('.')) file.set(v.path, v.sha);
      }
      let indice = { formato: 1, note: {} };
      if (indiceSha) {
        if (cache && cache.indiceSha === indiceSha) indice = cache.indice;
        else {
          try { const j = JSON.parse(await leggi(indiceSha)); if (j && j.note && typeof j.note === 'object') indice = j; }
          catch (e) { if (!(e instanceof SyntaxError)) throw e; }                 // indice illeggibile: si ricostruisce
        }
      }
      return (cache = { commit, albero: c.tree.sha, file, allegati, indice, indiceSha });
    }

    /* Prepara l'archivio al collegamento: se il repository è vuoto crea la cartella con l'indice,
     * altrimenti prova a creare un oggetto (senza toccare il ramo) per sapere se la chiave può scrivere. */
    async function prepara() {
      const s = await istantanea();
      const percorso = cartella + '/' + INDICE;
      if (!s.commit) {
        await chiama('PUT', R + '/contents/' + segmenti(percorso),
          { message: 'BiaWrite: prepara l\'archivio delle note', content: b64(utf8.encode(JSON.stringify({ formato: 1, note: {} }, null, 1) + '\n')) });
        cache = null;
        return istantanea();
      }
      await chiama('POST', R + '/git/trees', { base_tree: s.albero, tree: [{ path: percorso, mode: '100644', type: 'blob', content: JSON.stringify(s.indice) }] });
      return s;
    }

    /**
     * Scrive in un solo commit sopra l'istantanea `base`.
     * modifiche: [{ percorso, contenuto } | { percorso, sha } | { percorso, elimina: true }]
     * Se nel frattempo il ramo è andato avanti lancia ErroreArchivio('avanti'): si rilegge e si ripete.
     */
    async function scrivi(base, modifiche, indice, messaggio) {
      const testoIndice = JSON.stringify(indice, null, 1) + '\n';
      const percorsoIndice = cartella + '/' + INDICE;
      if (!base.commit) {                       // repository vuoto: il primo file si crea con l'API dei contenuti
        await chiama('PUT', R + '/contents/' + segmenti(percorsoIndice), { message: 'BiaWrite: prepara l\'archivio delle note', content: b64(utf8.encode(testoIndice)) });
        cache = null;
        throw new ErroreArchivio('avanti', 'archivio preparato');
      }
      const voci = modifiche.map(m => (m.elimina ? { path: m.percorso, mode: '100644', type: 'blob', sha: null }
        : m.sha ? { path: m.percorso, mode: '100644', type: 'blob', sha: m.sha }
        : { path: m.percorso, mode: '100644', type: 'blob', content: m.contenuto }));
      voci.push({ path: percorsoIndice, mode: '100644', type: 'blob', content: testoIndice });
      const t = await chiama('POST', R + '/git/trees', { base_tree: base.albero, tree: voci });
      const c = await chiama('POST', R + '/git/commits', { message: messaggio, tree: t.sha, parents: [base.commit] });
      await chiama('PATCH', R + '/git/refs/heads/' + segmenti(ramo), { sha: c.sha, force: false });
      const file = new Map(base.file), allegati = new Map(base.allegati || []);
      const allegato = p => p.startsWith(cartella + '/allegati/');
      for (const m of modifiche) {
        const dove = allegato(m.percorso) ? allegati : file;
        if (m.elimina) dove.delete(m.percorso);
        else dove.set(m.percorso, m.sha || await shaBlob(m.contenuto));
      }
      cache = { commit: c.sha, albero: t.sha, file, allegati, indice, indiceSha: await shaBlob(testoIndice) };
      return cache;
    }

    return {
      verifica, utente, istantanea, leggi, leggiBinario, caricaBlob, prepara, scrivi,
      dimentica() { cache = null; },
      get ramo() { return ramo; },
      cartella, repo,
    };
  }

  root.BiaArchivio = { crea, shaBlob, Errore: ErroreArchivio, INDICE };
})(typeof window !== 'undefined' ? window : globalThis);
