/* BiaWrite — core.js
 * Motore di conversione: HTML dell'editor ⇄ Markdown, sanificazione, esportazioni.
 * Non tocca l'interfaccia né la rete: si collauda da solo con tests/test.html.
 * © B. Raucci — licenza MIT
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ utilità */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escA = s => esc(s).replace(/"/g, '&quot;');
  const spazi = s => s.replace(/\u00A0/g, ' ');

  function urlSicuro(u, immagine) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (immagine && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';          // javascript:, data:, vbscript:…
    return u;                                                // relativo o ancora
  }

  /* -------------------------------------------------------- sanificazione
   * Qualunque HTML (incollato, letto da file, prodotto dal browser) viene
   * ricostruito da zero usando solo i tag ammessi qui sotto.               */
  const IN_RIGA = { B: 'strong', STRONG: 'strong', I: 'em', EM: 'em', U: 'u', INS: 'u', S: 's', STRIKE: 's',
    DEL: 's', CODE: 'code', KBD: 'code', SUB: 'sub', SUP: 'sup', MARK: 'mark' };
  const BLOCCHI = { P: 'p', H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h5', H6: 'h6',
    BLOCKQUOTE: 'blockquote', UL: 'ul', OL: 'ol', LI: 'li' };
  const CONTENITORI = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE',
    'FIGCAPTION', 'CENTER', 'ADDRESS', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'TR']);
  const SCARTA = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META',
    'LINK', 'TITLE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS',
    'BASE', 'FRAME', 'FRAMESET', 'APPLET']);
  const SEL_BLOCCO = 'p,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,li,pre,hr';
  const SEL_RIGA = 'strong,em,u,s,a,code,sub,sup,mark';
  const eBlocco = n => n.nodeType === 1 && n.matches(SEL_BLOCCO);

  function allineamento(el) {
    let a = (el.style && el.style.textAlign) || el.getAttribute('align') || '';
    a = a.toLowerCase();
    return a === 'center' || a === 'right' || a === 'justify' ? a : '';
  }

  function haBlocchi(el) {
    for (const c of el.children) {
      if (BLOCCHI[c.tagName] || CONTENITORI.has(c.tagName) || c.tagName === 'PRE' || c.tagName === 'HR' ||
          c.tagName === 'TABLE') return true;
    }
    return false;
  }

  /* grassetto, corsivo e sottolineato espressi con lo stile (Word, Google Docs…) */
  function daStile(src, dst, doc) {
    const st = src.style;
    if (!st || !src.getAttribute('style')) return dst;
    const peso = st.fontWeight;
    const deco = (st.textDecorationLine || st.textDecoration || '');
    const agg = t => { const e = doc.createElement(t); dst.appendChild(e); dst = e; };
    if (peso === 'bold' || peso === 'bolder' || parseInt(peso, 10) >= 600) agg('strong');
    if (st.fontStyle === 'italic' || st.fontStyle === 'oblique') agg('em');
    if (/underline/.test(deco)) agg('u');
    if (/line-through/.test(deco)) agg('s');
    return dst;
  }

  function percorri(da, a, doc, pre) {
    for (const n of da.childNodes) {
      if (n.nodeType === 3) {
        let t = n.nodeValue;
        if (!pre) t = t.replace(/[ \t\r\n\f]+/g, ' ');
        if (t) a.appendChild(doc.createTextNode(t));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toUpperCase();
      if (SCARTA.has(tag)) continue;
      if (tag === 'BR') { a.appendChild(doc.createElement('br')); continue; }
      if (tag === 'HR') { a.appendChild(doc.createElement('hr')); continue; }
      if (tag === 'IMG') {
        const s = urlSicuro(n.getAttribute('src'), true);
        if (s) {
          const im = doc.createElement('img');
          im.setAttribute('src', s);
          if (n.getAttribute('alt')) im.setAttribute('alt', n.getAttribute('alt'));
          a.appendChild(im);
        }
        continue;
      }
      if (tag === 'PRE') {
        const p = doc.createElement('pre');
        if (n.hasAttribute('data-raw')) p.setAttribute('data-raw', 'md');
        p.textContent = n.textContent;
        a.appendChild(p);
        continue;
      }
      if (tag === 'A') {
        const h = urlSicuro(n.getAttribute('href'));
        let d = a;
        if (h) { d = doc.createElement('a'); d.setAttribute('href', h); a.appendChild(d); }
        percorri(n, daStile(n, d, doc), doc, pre);
        continue;
      }
      if (IN_RIGA[tag]) {
        let nome = IN_RIGA[tag];
        const peso = n.style.fontWeight;
        if (nome === 'strong' && (peso === 'normal' || parseInt(peso, 10) <= 400)) nome = null;   // «<b style=font-weight:normal>» di Google Docs
        let d = a;
        if (nome) { d = doc.createElement(nome); a.appendChild(d); }
        percorri(n, nome === 'code' ? d : daStile(n, d, doc), doc, pre);
        continue;
      }
      if (BLOCCHI[tag]) {
        const el = doc.createElement(BLOCCHI[tag]);
        const al = allineamento(n);
        if (al) el.style.textAlign = al;
        a.appendChild(el);
        percorri(n, el, doc, pre);
        continue;
      }
      if (CONTENITORI.has(tag)) {
        if (haBlocchi(n)) { percorri(n, a, doc, pre); continue; }
        const el = doc.createElement('p');
        const al = tag === 'CENTER' ? 'center' : allineamento(n);
        if (al) el.style.textAlign = al;
        a.appendChild(el);
        percorri(n, el, doc, pre);
        continue;
      }
      if (tag === 'TD' || tag === 'TH') {
        percorri(n, a, doc, pre);
        a.appendChild(doc.createTextNode(' '));
        continue;
      }
      percorri(n, daStile(n, a, doc), doc, pre);            // span, font, table…: restano solo i figli
    }
  }

  function sciogli(el) {
    while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
    el.remove();
  }

  function avvolgiRighe(cont, doc) {
    let p = null;
    for (const n of [...cont.childNodes]) {
      if (eBlocco(n)) { p = null; continue; }
      if (!p) { p = doc.createElement('p'); cont.insertBefore(p, n); }
      p.appendChild(n);
    }
  }

  function normalizza(r, doc) {
    r.querySelectorAll(SEL_RIGA).forEach(el => { if (el.querySelector(SEL_BLOCCO)) sciogli(el); });
    r.querySelectorAll('p p, h1 p, h2 p, h3 p, h4 p, h5 p, h6 p, p h1, p h2, p h3, p h4, p h5, p h6').forEach(sciogli);
    // elenchi: i figli devono essere <li>; un elenco figlio diretto di un altro entra nella voce precedente
    r.querySelectorAll('ul,ol').forEach(l => {
      for (const c of [...l.childNodes]) {
        if (c.nodeType === 1 && c.tagName === 'LI') continue;
        if (c.nodeType === 3 && !c.nodeValue.trim()) { c.remove(); continue; }
        let li = c.previousElementSibling;
        if (!(li && li.tagName === 'LI' && c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName))) {
          li = doc.createElement('li');
          l.insertBefore(li, c);
        }
        li.appendChild(c);
      }
    });
    r.querySelectorAll('li').forEach(li => {
      if (!/^(UL|OL)$/.test(li.parentNode.tagName)) {
        const p = doc.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        li.replaceWith(p);
      }
    });
    avvolgiRighe(r, doc);
    r.querySelectorAll('blockquote').forEach(b => avvolgiRighe(b, doc));
    r.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li').forEach(el => {
      while (el.lastChild && (el.lastChild.nodeName === 'BR' ||
        (el.lastChild.nodeType === 3 && !spazi(el.lastChild.nodeValue).trim()))) el.lastChild.remove();
      while (el.firstChild && el.firstChild.nodeType === 3 && !spazi(el.firstChild.nodeValue).trim()) el.firstChild.remove();
    });
    r.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,' + SEL_RIGA).forEach(el => {
      if (!spazi(el.textContent).trim() && !el.querySelector('img,hr')) el.remove();
    });
    r.querySelectorAll('ul,ol').forEach(l => { if (!l.children.length) l.remove(); });
  }

  /** Restituisce un <div> (in un documento inerte) con il contenuto ripulito. */
  function sanifica(html) {
    const src = new DOMParser().parseFromString('<!doctype html><body>' + (html || ''), 'text/html').body;
    const doc = src.ownerDocument;
    const out = doc.createElement('div');
    percorri(src, out, doc, false);
    normalizza(out, doc);
    return out;
  }
  const pulisci = html => sanifica(html).innerHTML;

  /* ------------------------------------------------- HTML → Markdown */
  function escMd(t) {
    return spazi(t).replace(/ {2,}/g, ' ').replace(/([\\`*_\[\]<])/g, '\\$1').replace(/&(?=#?\w+;)/g, '\\&');
  }
  function proteggiRiga(l) {
    return l.replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2')
            .replace(/^(#{1,6}(?:\s|$)|>|[-+](?:\s|$)|-{3,}\s*$|={1,}\s*$|\||~~~)/, '\\$1');
  }
  const proteggi = s => s.split('\n').map(proteggiRiga).join('\n');

  function codiceInRiga(t) {
    let n = 1;
    (t.match(/`+/g) || []).forEach(r => { if (r.length >= n) n = r.length + 1; });
    const f = '`'.repeat(n);
    const pad = /^`|`$/.test(t) ? ' ' : '';
    return f + pad + t + pad + f;
  }

  const MARCHE = { STRONG: ['**', '**'], EM: ['*', '*'], S: ['~~', '~~'], U: ['<u>', '</u>'],
    SUB: ['<sub>', '</sub>'], SUP: ['<sup>', '</sup>'], MARK: ['<mark>', '</mark>'] };

  /* «*a***b***c*» si presta a più letture: quando due enfasi si toccano senza testo in mezzo
   * (o una comincia o finisce esattamente dove comincia o finisce l'altra) si usano i tag. */
  const eEnfasi = n => !!n && n.nodeType === 1 && (n.tagName === 'STRONG' || n.tagName === 'EM');
  function ambigua(n) {
    if (!eEnfasi(n)) return false;
    if (eEnfasi(n.previousSibling) || eEnfasi(n.nextSibling)) return true;
    if (n.childNodes.length > 1 && (eEnfasi(n.firstChild) || eEnfasi(n.lastChild))) return true;
    const g = n.parentNode;
    return eEnfasi(g) && g.childNodes.length > 1 && (g.firstChild === n || g.lastChild === n);
  }

  function rigaMd(el, ctx) {
    ctx = ctx || {};
    let o = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { o += escMd(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName;
      if (t === 'BR') { o += '  \n'; continue; }
      if (t === 'IMG') { o += '![' + escMd(n.getAttribute('alt') || '') + '](' + urlMd(n.getAttribute('src')) + ')'; continue; }
      if (t === 'CODE') { if (n.textContent) o += codiceInRiga(spazi(n.textContent)); continue; }
      if (t === 'A') {
        const dentro = rigaMd(n, ctx);
        o += dentro.trim() ? '[' + dentro + '](' + urlMd(n.getAttribute('href')) + ')' : dentro;
        continue;
      }
      let m = MARCHE[t];
      if (!m || ctx[t]) { o += rigaMd(n, ctx); continue; }
      if (ambigua(n)) m = t === 'STRONG' ? ['<strong>', '</strong>'] : ['<em>', '</em>'];
      const dentro = rigaMd(n, Object.assign({}, ctx, { [t]: 1 }));
      const p = dentro.match(/^(\s*)([\s\S]*?)(\s*)$/);
      o += p[2] ? p[1] + m[0] + p[2] + m[1] + p[3] : dentro;
    }
    return o;
  }
  const urlMd = u => String(u || '').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  const inMd = el => rigaMd(el).replace(/[ \t]*\n[ \t]*$/, '').replace(/^\s+|\s+$/g, '');

  function rigaHtml(el, sottolinea) {
    let o = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { o += esc(spazi(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      const t = n.tagName.toLowerCase();
      if (t === 'br') { o += '<br>'; continue; }
      if (t === 'img') { o += '<img src="' + escA(n.getAttribute('src')) + '" alt="' + escA(n.getAttribute('alt') || '') + '">'; continue; }
      const dentro = rigaHtml(n, sottolinea);
      if (t === 'a') { o += '<a href="' + escA(n.getAttribute('href')) + '">' + dentro + '</a>'; continue; }
      if (t === 'u' && sottolinea) { o += sottolinea(dentro); continue; }
      o += '<' + t + '>' + dentro + '</' + t + '>';
    }
    return o;
  }

  function elencoMd(lista) {
    const ord = lista.tagName === 'OL';
    const doc = lista.ownerDocument;
    const righe = [];
    let i = 0;
    for (const li of lista.children) {
      i++;
      const marca = ord ? i + '. ' : '- ';
      const rientro = ' '.repeat(marca.length);
      const parti = [];
      let corsa = doc.createElement('span');
      const chiudi = () => {
        if (corsa.childNodes.length) {
          const s = inMd(corsa);
          if (s) parti.push({ s: proteggi(s) });
          corsa = doc.createElement('span');
        }
      };
      for (const c of li.childNodes) {
        if (eBlocco(c)) { chiudi(); const s = bloccoMd(c); if (s) parti.push({ s, lista: /^(UL|OL)$/.test(c.tagName) }); }
        else corsa.appendChild(c.cloneNode(true));
      }
      chiudi();
      let corpo = '';
      parti.forEach((p, k) => { corpo += (k ? (p.lista ? '\n' : '\n\n') : '') + p.s; });
      righe.push(marca + corpo.split('\n').map((l, k) => (k && l ? rientro + l : l)).join('\n'));
    }
    return righe.join('\n');
  }

  function bloccoMd(el) {
    const t = el.tagName, al = el.style.textAlign;
    if (t === 'P') return al ? '<p style="text-align:' + al + '">' + rigaHtml(el) + '</p>' : proteggi(inMd(el));
    if (/^H[1-6]$/.test(t)) {
      const n = +t[1];
      if (al) return '<h' + n + ' style="text-align:' + al + '">' + rigaHtml(el) + '</h' + n + '>';
      return '#'.repeat(n) + ' ' + inMd(el).replace(/\s*\n\s*/g, ' ').replace(/(#+)$/, '\\$1');
    }
    if (t === 'UL' || t === 'OL') return elencoMd(el);
    if (t === 'BLOCKQUOTE') return blocchiMd(el).split('\n').map(l => (l ? '> ' + l : '>')).join('\n');
    if (t === 'PRE') {
      const x = el.textContent.replace(/\n+$/, '');
      if (el.hasAttribute('data-raw')) return x;
      let f = '```';
      while (x.includes(f)) f += '`';
      return f + '\n' + x + '\n' + f;
    }
    if (t === 'HR') return '---';
    return proteggi(inMd(el));
  }
  function blocchiMd(cont) {
    const o = [];
    for (const el of cont.children) { const s = bloccoMd(el); if (s) o.push(s); }
    return o.join('\n\n');
  }

  /** HTML dell'editor → testo Markdown del file. */
  function htmlToMd(html) {
    const s = blocchiMd(sanifica(html));
    return s ? s + '\n' : '';
  }

  /* ------------------------------------------------- Markdown → HTML */
  const PUNT = /[!-\/:-@\[-`{-~]/;
  const A_CAPO = '\uE002';

  function chiusura(src, da, lung) {
    let i = da;
    while (i < src.length) {
      if (src[i] !== '`') { i++; continue; }
      let j = i;
      while (j < src.length && src[j] === '`') j++;
      if (j - i === lung) return i;
      i = j;
    }
    return -1;
  }

  function inRiga(src) {
    const dep = [];
    const metti = h => '\uE000' + (dep.push(h) - 1) + '\uE001';
    const togli = s => s.replace(/\uE000(\d+)\uE001/g, (m, k) => dep[+k]);
    let s = '', i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '\\' && i + 1 < n && PUNT.test(src[i + 1])) { s += metti(esc(src[i + 1])); i += 2; continue; }
      if (c === '`') {
        let j = i;
        while (j < n && src[j] === '`') j++;
        const k = chiusura(src, j, j - i);
        if (k >= 0) {
          let cod = src.slice(j, k).replace(new RegExp(A_CAPO, 'g'), ' ').replace(/\n/g, ' ');
          if (/^ [\s\S]* $/.test(cod) && cod.trim()) cod = cod.slice(1, -1);
          s += metti('<code>' + esc(cod) + '</code>');
          i = k + (j - i);
          continue;
        }
        s += src.slice(i, j); i = j; continue;
      }
      if (c === '<') {
        const resto = src.slice(i);
        let m = resto.match(/^<\/?(?:u|ins|s|del|strike|b|strong|i|em|sub|sup|mark|br|span|a|code|kbd|small|img)(?:\s[^<>]*)?\/?>/i);
        if (m) { s += metti(m[0]); i += m[0].length; continue; }
        m = resto.match(/^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i);
        if (m) { s += metti('<a href="' + escA(m[1]) + '">' + esc(m[1]) + '</a>'); i += m[0].length; continue; }
      }
      s += c; i++;
    }
    s = s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});)/g, '&amp;')
         .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const url = u => togli(u).replace(/&amp;/g, '&');
    const DEST = '\\(\\s*([^\\s()]+(?:\\([^\\s()]*\\)[^\\s()]*)*)(?:\\s+(?:"[^"]*"|\'[^\']*\'))?\\s*\\)';
    s = s.replace(new RegExp('!\\[([^\\]]*)\\]' + DEST, 'g'), (m, alt, u) => {
      const v = urlSicuro(url(u), true);
      return v ? metti('<img src="' + escA(v) + '" alt="' + escA(togli(alt).replace(/<[^>]*>/g, '')) + '">') : m;
    });
    s = s.replace(new RegExp('\\[((?:[^\\[\\]]|\\[[^\\[\\]]*\\])+)\\]' + DEST, 'g'), (m, txt, u) => {
      const v = urlSicuro(url(u));
      return v ? metti('<a href="' + escA(v) + '">') + txt + metti('</a>') : m;
    });
    s = s.replace(/\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/g, '<strong><em>$1</em></strong>')
         .replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
         .replace(/\*(?=\S)([\s\S]+?)(?<=\S)\*/g, '<em>$1</em>')
         .replace(/(?<![A-Za-z0-9_])__(?=\S)([\s\S]+?)(?<=\S)__(?![A-Za-z0-9_])/g, '<strong>$1</strong>')
         .replace(/(?<![A-Za-z0-9_])_(?=\S)([\s\S]+?)(?<=\S)_(?![A-Za-z0-9_])/g, '<em>$1</em>')
         .replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '<s>$1</s>');
    return togli(s).replace(new RegExp(A_CAPO, 'g'), '<br>');
  }

  const RE_VOCE = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
  const RE_TITOLO = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  const RE_LINEA = /^ {0,3}([-*_])(?: *\1){2,} *$/;
  const RE_RECINTO = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  const RE_HTML = /^ {0,3}<\/?(?:p|div|h[1-6]|ul|ol|li|blockquote|pre|center|table|hr|figure|section|article)\b[^>]*>/i;
  const RE_SEP_TAB = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

  function inizioBlocco(l) {
    if (RE_TITOLO.test(l) || RE_LINEA.test(l) || RE_RECINTO.test(l) || RE_HTML.test(l) || /^ {0,3}>/.test(l)) return true;
    const m = l.match(RE_VOCE);
    if (m && m[1].length <= 3 && m[4]) return /^\d/.test(m[2]) ? /^1[.)]$/.test(m[2]) : true;
    return false;
  }

  function blocchi(righe) {
    let o = '', i = 0;
    const n = righe.length;
    while (i < n) {
      const l = righe[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(RE_RECINTO))) {
        const fine = new RegExp('^ {0,3}' + m[1][0] + '{' + m[1].length + ',}\\s*$');
        const b = [];
        i++;
        while (i < n && !fine.test(righe[i])) b.push(righe[i++]);
        i++;
        o += '<pre>' + esc(b.join('\n')) + '</pre>';
        continue;
      }
      if (RE_HTML.test(l)) {
        const b = [];
        while (i < n && righe[i].trim()) b.push(righe[i++]);
        o += b.join('\n');
        continue;
      }
      if ((m = l.match(RE_TITOLO))) {
        o += '<h' + m[1].length + '>' + inRiga(m[2] || '') + '</h' + m[1].length + '>';
        i++;
        continue;
      }
      if (RE_LINEA.test(l)) { o += '<hr>'; i++; continue; }
      if (/^ {0,3}>/.test(l)) {
        const b = [];
        while (i < n && righe[i].trim()) { b.push(righe[i].replace(/^ {0,3}> ?/, '')); i++; }
        o += '<blockquote>' + blocchi(b) + '</blockquote>';
        continue;
      }
      if (l.includes('|') && i + 1 < n && righe[i + 1].includes('|') && RE_SEP_TAB.test(righe[i + 1])) {
        const b = [];
        while (i < n && righe[i].trim()) b.push(righe[i++]);
        o += '<pre data-raw="md">' + esc(b.join('\n')) + '</pre>';          // tabelle: conservate tali e quali
        continue;
      }
      if ((m = l.match(RE_VOCE)) && m[1].length <= 3) {
        const ord = /^\d/.test(m[2]);
        const voci = [];
        while (i < n) {
          const v = righe[i].match(RE_VOCE);
          if (!v || v[1].length > 3 || /^\d/.test(v[2]) !== ord || RE_LINEA.test(righe[i])) break;
          const base = v[1].length;
          const cont = base + v[2].length + (v[3].length >= 1 && v[3].length <= 4 ? v[3].length : 1);
          const b = [v[3].length > 4 ? v[3].slice(1) + v[4] : v[4]];
          i++;
          while (i < n) {
            const r = righe[i];
            if (!r.trim()) {
              let j = i;
              while (j < n && !righe[j].trim()) j++;
              if (j < n && (righe[j].match(/^ */)[0].length >= cont)) { while (i < j) { b.push(''); i++; } continue; }
              break;
            }
            const ind = r.match(/^ */)[0].length;
            if (ind >= cont) { b.push(r.slice(cont)); i++; continue; }
            const sotto = r.match(RE_VOCE);
            if (sotto) { if (ind > base) { b.push(r.slice(Math.min(ind, cont))); i++; continue; } break; }
            if (inizioBlocco(r)) break;
            b.push(r.trim()); i++;                                             // continuazione pigra
          }
          let h = blocchi(b);
          if ((h.match(/<p>/g) || []).length === 1 && h.startsWith('<p>')) h = h.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
          voci.push('<li>' + h + '</li>');
          let j = i;
          while (j < n && !righe[j].trim()) j++;
          const pross = j < n && righe[j].match(RE_VOCE);
          if (pross && pross[1].length <= 3 && /^\d/.test(pross[2]) === ord) i = j; else break;
        }
        o += (ord ? '<ol>' : '<ul>') + voci.join('') + (ord ? '</ol>' : '</ul>');
        continue;
      }
      // paragrafo (con eventuale titolo «sottolineato»)
      const b = [l];
      let titolo = 0;
      i++;
      while (i < n && righe[i].trim()) {
        const s = righe[i].match(/^ {0,3}(=+|-+) *$/);
        if (s) { titolo = s[1][0] === '=' ? 1 : 2; i++; break; }
        if (inizioBlocco(righe[i])) break;
        b.push(righe[i++]);
      }
      const testo = b.map((r, k) => {
        r = r.replace(/^\s+/, '');
        if (k === b.length - 1) return r.replace(/\s+$/, '');
        return / {2,}$|\\$/.test(r) ? r.replace(/( {2,}|\\)$/, '') + A_CAPO : r.replace(/\s+$/, '') + '\n';
      }).join('');
      o += titolo ? '<h' + titolo + '>' + inRiga(testo) + '</h' + titolo + '>' : '<p>' + inRiga(testo) + '</p>';
    }
    return o;
  }

  /** Testo Markdown del file → HTML sicuro per l'editor. */
  function mdToHtml(md) {
    const righe = String(md || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    return pulisci(blocchi(righe));
  }

  /* ----------------------------------------------------- testo semplice */
  function textToHtml(t) {
    return String(t || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).filter(b => b.trim())
      .map(b => '<p>' + esc(b).replace(/\n/g, '<br>') + '</p>').join('');
  }

  function testoDi(r) {
    const o = [];
    const blocco = (el, pref) => {
      const t = el.tagName;
      if (t === 'UL' || t === 'OL') {
        let i = 0;
        for (const li of el.children) {
          i++;
          const m = pref + (t === 'OL' ? i + '. ' : '- ');
          const c = li.cloneNode(true);
          c.querySelectorAll('ul,ol').forEach(x => x.remove());
          c.querySelectorAll('br').forEach(x => x.replaceWith('\n'));
          o.push(m + spazi(c.textContent).trim());
          for (const sub of li.children) if (/^(UL|OL)$/.test(sub.tagName)) blocco(sub, pref + '  ');
        }
        o.push('');
        return;
      }
      if (t === 'BLOCKQUOTE') { for (const c of el.children) blocco(c, pref); return; }
      if (t === 'HR') { o.push('———', ''); return; }
      const c = el.cloneNode(true);
      c.querySelectorAll('br').forEach(x => x.replaceWith('\n'));
      o.push(pref + spazi(c.textContent), '');
    };
    for (const el of r.children) blocco(el, '');
    return o.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const htmlToText = html => testoDi(sanifica(html));
  const mdToText = md => htmlToText(mdToHtml(md));

  /* ------------------------------------------------ esportazioni */
  const SOTTO_WP = s => '<span style="text-decoration: underline;">' + s + '</span>';

  /** HTML pulito per gli appunti: da incollare in un editor visuale. */
  function perAppunti(html) {
    const r = sanifica(html);
    r.querySelectorAll('u').forEach(u => {
      const s = r.ownerDocument.createElement('span');
      s.style.textDecoration = 'underline';
      while (u.firstChild) s.appendChild(u.firstChild);
      u.replaceWith(s);
    });
    return r.innerHTML;
  }

  /** Blocchi serializzati dell'editor di WordPress (Gutenberg). */
  function perWordPress(html) {
    const blocco = el => {
      const t = el.tagName, al = el.style.textAlign;
      const dentro = () => rigaHtml(el, SOTTO_WP);
      if (t === 'P') {
        if (!al) return '<!-- wp:paragraph -->\n<p>' + dentro() + '</p>\n<!-- /wp:paragraph -->';
        if (al === 'justify') {
          return '<!-- wp:paragraph {"className":"has-text-align-justify"} -->\n<p class="has-text-align-justify">' +
            dentro() + '</p>\n<!-- /wp:paragraph -->';
        }
        return '<!-- wp:paragraph {"align":"' + al + '"} -->\n<p class="has-text-align-' + al + '">' + dentro() +
          '</p>\n<!-- /wp:paragraph -->';
      }
      if (/^H[1-6]$/.test(t)) {
        const n = +t[1], at = {};
        let cl = 'wp-block-heading';
        if (al === 'justify') { at.className = 'has-text-align-justify'; }
        else if (al) { at.textAlign = al; cl += ' has-text-align-' + al; }
        if (n !== 2) at.level = n;
        if (al === 'justify') cl += ' has-text-align-justify';
        const j = Object.keys(at).length ? ' ' + JSON.stringify(at) : '';
        return '<!-- wp:heading' + j + ' -->\n<h' + n + ' class="' + cl + '">' + dentro() + '</h' + n + '>\n<!-- /wp:heading -->';
      }
      if (t === 'UL' || t === 'OL') return elenco(el);
      if (t === 'BLOCKQUOTE') {
        return '<!-- wp:quote -->\n<blockquote class="wp-block-quote">' + [...el.children].map(blocco).join('\n\n') +
          '</blockquote>\n<!-- /wp:quote -->';
      }
      if (t === 'PRE') {
        return '<!-- wp:code -->\n<pre class="wp-block-code"><code>' + esc(el.textContent.replace(/\n+$/, '')) +
          '</code></pre>\n<!-- /wp:code -->';
      }
      if (t === 'HR') return '<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->';
      return '';
    };
    const elenco = l => {
      const ord = l.tagName === 'OL';
      const voci = [...l.children].map(li => {
        const c = li.cloneNode(true);
        const sotto = [...c.children].filter(x => /^(UL|OL)$/.test(x.tagName));
        sotto.forEach(x => x.remove());
        c.querySelectorAll('p').forEach(p => { p.after(c.ownerDocument.createElement('br')); sciogli(p); });
        while (c.lastChild && c.lastChild.nodeName === 'BR') c.lastChild.remove();
        return '<!-- wp:list-item -->\n<li>' + rigaHtml(c, SOTTO_WP) + sotto.map(elenco).join('') + '</li>\n<!-- /wp:list-item -->';
      });
      return '<!-- wp:list' + (ord ? ' {"ordered":true}' : '') + ' -->\n<' + (ord ? 'ol' : 'ul') + ' class="wp-block-list">' +
        voci.join('\n\n') + '</' + (ord ? 'ol' : 'ul') + '>\n<!-- /wp:list -->';
    };
    return [...sanifica(html).children].map(blocco).filter(Boolean).join('\n\n');
  }

  root.BiaCore = { sanifica, pulisci, htmlToMd, mdToHtml, textToHtml, htmlToText, mdToText, perAppunti, perWordPress, esc, escA };
})(typeof window !== 'undefined' ? window : globalThis);
