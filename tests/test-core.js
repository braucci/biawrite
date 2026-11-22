/* Collaudo di core.js: per ogni caso si verifica che
 *   1. l'HTML dell'editor produca il Markdown atteso;
 *   2. rileggendo quel Markdown non si perdano né testo né formattazione (andata e ritorno);
 *   3. riscrivendolo si riottenga lo stesso Markdown (punto fisso).
 * Aprire tests/test.html nel browser.                                        */
(function () {
  'use strict';
  const C = window.BiaCore;
  const casi = [
    ['grassetto, corsivo, sottolineato', '<p>Testo <b>forte</b>, <i>corsivo</i> e <u>sottolineato</u>.</p>',
      'Testo **forte**, *corsivo* e <u>sottolineato</u>.\n'],
    ['spazi ai bordi del grassetto', '<p>uno <b>due </b>tre<i> quattro</i></p>', 'uno **due** tre *quattro*\n'],
    ['grassetto e corsivo annidati', '<p><b>forte <i>entrambi</i></b> e <i>corsivo <b>entrambi</b> ancora</i></p>', null],
    ['grassetto corsivo pieno', '<p><b><i>tutto</i></b> poi <i><b>tutto</b></i></p>', null],
    ['corsivi adiacenti', '<p><i>a</i><b>b</b><i>c</i> <b>d</b><b>e</b></p>', null],
    ['sottolineato con grassetto', '<p><u>sotto <b>forte</b></u> e <s>barrato</s></p>', 'sotto **forte** e ~~barrato~~\n'.replace('sotto **forte**', '<u>sotto **forte**</u>')],
    ['a destra', '<p style="text-align: right;">Napoli, 22 novembre <b>2026</b></p>',
      '<p style="text-align:right">Napoli, 22 novembre <strong>2026</strong></p>\n'],
    ['centrato e giustificato', '<p style="text-align:center">centro</p><p style="text-align:justify">lungo testo <u>giustificato</u> &amp; pieno</p>',
      '<p style="text-align:center">centro</p>\n\n<p style="text-align:justify">lungo testo <u>giustificato</u> &amp; pieno</p>\n'],
    ['attributo align del vecchio HTML', '<div align="right">firma</div>', '<p style="text-align:right">firma</p>\n'],
    ['titoli', '<h1>Uno</h1><h2>Due <i>corsivo</i></h2><h3 style="text-align:center">Tre</h3>',
      '# Uno\n\n## Due *corsivo*\n\n<h3 style="text-align:center">Tre</h3>\n'],
    ['elenco puntato', '<ul><li>uno</li><li><b>due</b></li><li>tre</li></ul>', '- uno\n- **due**\n- tre\n'],
    ['elenco numerato', '<ol><li>primo</li><li>secondo</li></ol><p>dopo</p>', '1. primo\n2. secondo\n\ndopo\n'],
    ['elenchi annidati', '<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b<ol><li>b1</li></ol></li></ul>',
      '- a\n  - a1\n  - a2\n- b\n  1. b1\n'],
    ['elenco annidato alla Chrome', '<ul><li>a</li><ul><li>a1</li></ul><li>b</li></ul>', '- a\n  - a1\n- b\n'],
    ['voce con due paragrafi', '<ul><li><p>uno</p><p>ancora uno</p></li><li>due</li></ul>', null],
    ['citazione', '<blockquote>Detto <i>bene</i>.</blockquote><blockquote><p>riga uno</p><p>riga due</p></blockquote>',
      '> Detto *bene*.\n\n> riga uno\n>\n> riga due\n'],
    ['collegamento', '<p>Vedi <a href="https://www.raucci.net/a_b/(x)?q=1&amp;r=2">il <b>blog</b></a>.</p>',
      'Vedi [il **blog**](https://www.raucci.net/a_b/%28x%29?q=1&r=2).\n'],
    ['a capo forzato', '<p>riga uno<br>riga due<br></p>', 'riga uno  \nriga due\n'],
    ['linea e codice', '<p>prima</p><hr><pre>x = 1\n  y = 2</pre><p>usa <code>a*b</code> e <code>`</code></p>', null],
    ['caratteri speciali', '<p>2 * 3 = 6, snake_case, [nota], a &lt; b, C:\\dir, `x`, &amp;amp;</p>', null],
    ['inizi di riga insidiosi', '<p># non titolo</p><p>- non elenco</p><p>1. non elenco</p><p>&gt; non citazione</p><p>---</p><p>1986. Un anno</p><p>+ più</p>', null],
    ['titolo che finisce con cancelletto', '<h2>Do #</h2>', null],
    ['paragrafi vuoti eliminati', '<p>uno</p><p><br></p><p></p><p>due</p>', 'uno\n\ndue\n'],
    ['spazio non separabile', '<p>uno&nbsp; due&nbsp;</p>', null],
    ['testo sciolto e div', 'sciolto <b>forte</b><div>riga in div</div><div><br></div><div>altra</div>', 'sciolto **forte**\n\nriga in div\n\naltra\n'],
    ['immagine', '<p>foto <img src="https://www.raucci.net/a.jpg" alt="Una [foto]"></p>', null],
    ['incolla da Google Docs', '<b style="font-weight:normal"><p dir="ltr" style="text-align:justify"><span style="font-weight:700">Forte</span><span style="font-style:italic;text-decoration:underline"> misto</span></p></b>',
      '<p style="text-align:justify"><strong>Forte</strong><em><u> misto</u></em></p>\n'],
  ];

  const sicurezza = [
    ['script', '<p>ok</p><script>alert(1)<\/script>', '<p>ok</p>'],
    ['gestori di eventi', '<p onclick="alert(1)">ok <img src="x.png" onerror="alert(1)"></p>', '<p>ok <img src="x.png"></p>'],
    ['javascript:', '<p><a href="javascript:alert(1)">clic</a> <a href=" JaVaScRiPt:alert(1)">clic</a></p>', '<p>clic clic</p>'],
    ['iframe e stile', '<iframe src="https://example.com"></iframe><style>p{color:red}</style><p style="color:red;position:fixed">t</p>', '<p>t</p>'],
    ['svg', '<svg><script>alert(1)<\/script></svg><p>t</p>', '<p>t</p>'],
  ];

  const lettura = [
    ['Markdown scritto a mano', '# Titolo\n\nUn *paragrafo* con __forte__ e `codice`,\nsu due righe.\n\n* uno\n* due\n\n1. a\n2. b\n\n> cit\n\nFine.\n',
      '<h1>Titolo</h1><p>Un <em>paragrafo</em> con <strong>forte</strong> e <code>codice</code>, su due righe.</p><ul><li>uno</li><li>due</li></ul><ol><li>a</li><li>b</li></ol><blockquote><p>cit</p></blockquote><p>Fine.</p>'],
    ['HTML ostile dentro il Markdown', 'ciao <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n<p onclick="x()">blocco</p>\n\n[x](javascript:alert(1))\n',
      '<p>ciao &lt;script&gt;alert(1)&lt;/script&gt; <img src="x"></p><p>blocco</p><p>[x](javascript:alert(1))</p>'],
    ['tabella conservata', 'prima\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\ndopo\n', null],
    ['titolo sottolineato', 'Titolo\n======\n\nSotto\n-----\n\ntesto\n', '<h1>Titolo</h1><h2>Sotto</h2><p>testo</p>'],
    ['sottolineatura dentro le parole', 'file_di_prova e _corsivo_', '<p>file_di_prova e <em>corsivo</em></p>'],
    ['elenco con righe vuote', '- uno\n\n- due\n\n  seguito\n- tre\n', null],
  ];

  let fall = 0;
  const elenco = document.getElementById('elenco');
  function riga(nome, errori) {
    const li = document.createElement('li');
    li.className = errori.length ? 'ko' : 'ok';
    li.textContent = (errori.length ? '✗ ' : '✓ ') + nome;
    errori.forEach(e => { const p = document.createElement('pre'); p.textContent = e; li.appendChild(p); });
    elenco.appendChild(li);
    if (errori.length) fall++;
  }

  for (const [nome, html, atteso] of casi) {
    const e = [];
    const md = C.htmlToMd(html);
    if (atteso !== null && md !== atteso) e.push('Markdown atteso:\n' + atteso + '\nottenuto:\n' + md);
    const h2 = C.mdToHtml(md);                       // forma canonica
    const t1 = C.htmlToText(html).replace(/\s+/g, ' '), t2 = C.htmlToText(h2).replace(/\s+/g, ' ');
    if (t1 !== t2) e.push('testo perso nel giro:\n' + t1 + '\n' + t2);
    const segni = h => (h.match(/<(strong|em|u|s|h\d|li|blockquote|a |pre|hr|br|img)/g) || []).sort().join();
    if (segni(C.pulisci(html)) !== segni(h2)) e.push('formattazione cambiata nel giro:\nHTML     ' + C.pulisci(html) + '\nriletto  ' + h2 + '\n(md: ' + JSON.stringify(md) + ')');
    const md2 = C.htmlToMd(h2);
    if (md2 !== md) e.push('punto fisso:\n' + JSON.stringify(md) + '\n' + JSON.stringify(md2));
    if (C.mdToHtml(md2) !== h2) e.push('forma canonica instabile');
    riga(nome, e);
  }
  for (const [nome, html, atteso] of sicurezza) {
    const h = C.pulisci(html);
    riga('sicurezza: ' + nome, h === atteso ? [] : ['atteso  ' + atteso + '\nottenuto ' + h]);
  }
  for (const [nome, md, atteso] of lettura) {
    const e = [];
    const h = C.mdToHtml(md);
    if (atteso !== null && h !== atteso) e.push('atteso   ' + atteso + '\nottenuto ' + h);
    const md1 = C.htmlToMd(h), md2 = C.htmlToMd(C.mdToHtml(md1));
    if (md1 !== md2) e.push('punto fisso:\n' + JSON.stringify(md1) + '\n' + JSON.stringify(md2));
    if (/<script|onerror|onclick|javascript:/i.test(h.replace(/&lt;script/g, '').replace(/\]\(javascript:/g, ''))) e.push('HTML pericoloso: ' + h);
    riga('lettura: ' + nome, e);
  }
  // WordPress
  {
    const wp = C.perWordPress('<h2>T</h2><p style="text-align:right">a <u>b</u></p><ul><li>x</li></ul>');
    const att = '<!-- wp:heading -->\n<h2 class="wp-block-heading">T</h2>\n<!-- /wp:heading -->\n\n' +
      '<!-- wp:paragraph {"align":"right"} -->\n<p class="has-text-align-right">a <span style="text-decoration: underline;">b</span></p>\n<!-- /wp:paragraph -->\n\n' +
      '<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li>x</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->';
    riga('blocchi per WordPress', wp === att ? [] : ['atteso:\n' + att + '\nottenuto:\n' + wp]);
  }

  const tot = casi.length + sicurezza.length + lettura.length + 1;
  const esito = document.getElementById('esito');
  esito.textContent = fall ? fall + ' prove fallite su ' + tot : 'Tutte le ' + tot + ' prove superate.';
  esito.className = fall ? 'ko' : 'ok';
  window.ESITO = { totale: tot, fallite: fall };
})();
