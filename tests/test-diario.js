/* Collaudo di diario.js: piccoli diari scritti ad arte (dati inventati) e ciò che il lettore deve ricavarne.
 * Aprire tests/test-diario.html nel browser, oppure: node tests/test-diario.js                              */
(function (root) {
  'use strict';
  if (!root.BiaDiario && typeof require === 'function') require('../diario.js');
  const D = root.BiaDiario;
  const casi = [];
  const caso = (nome, fn) => casi.push([nome, fn]);
  const uguale = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const PASTO = (nome, ora, righe, tot) => '##### ' + nome + (ora ? ' (≈ ' + ora + ')' : '') + '\n| Alimento | Quantità | kcal |\n|---|---|---|\n' + righe.map(r => '| ' + r.join(' | ') + ' |').join('\n') + (tot != null ? '\n| **Totale** | | **≈ ' + tot + '** |' : '') + '\n';
  const TESTA = '# Diario\n\n## Dati di riferimento (01/03/2026)\n- Femmina, 41 anni, statura 1,65 m, peso 74 kg (BMI ≈ 27,2)\n- Peso obiettivo: 62 kg, da raggiungere con perdita di ≈ 0,4 kg/settimana\n- BMR (Mifflin-St Jeor) ≈ 1400 kcal; TDEE da formula (PAL 1,4) ≈ 1960 kcal\n- **Target giornaliero: ≈ 1500 kcal**; proteine 80-100 g/die\n- Idratazione: obiettivo ≈ 1,8 l/die di bevande\n\n## Storico giornaliero\n\n';
  const GIORNO = '### 2 marzo 2026 (lunedì) — GIORNATA CHIUSA: 1310 kcal (soglia 1500, margine 190)\nRiepilogo: carboidrati ≈ 150 g, proteine ≈ 82,5 g (obiettivo 80-100), grassi ≈ 40 g, fibra ≈ 21 g.\n\n#### Dettaglio pasti\n\n' +
    PASTO('Colazione', '07:30', [['Latte (*)', '200 ml', '92'], ['Fette biscottate', '4 fette (36 g)', '144']], 236) + '\nMacronutrienti stimati: carboidrati ≈ 40 g (zuccheri ≈ 12 g), proteine ≈ 11 g, grassi ≈ 4 g, fibra ≈ 3 g.\n\n' +
    PASTO('Cena', '20:15', [['Pollo', '180 g', '198'], ['Riso (*)', '≈ 80 g', '286'], ['Olio EVO', '2 cucchiaini', '90'], ['Pane', '—', '500']], 1074) + '\nMacronutrienti stimati: carboidrati ≈ 110 g, proteine ≈ 71,5 g, grassi ≈ 36 g, fibra ≈ 18 g.\n';

  caso('numeri all\'italiana', () => uguale([D.num('≈ 1.571'), D.num('3,5 g'), D.num('**≈ 296**'), D.num('2330'), D.num('—'), D.num('12.345,6')], [1571, 3.5, 296, 2330, null, 12345.6]));
  caso('date in tre forme', () => uguale([D.data('22 novembre 2026').iso, D.data('il 02/05/2026').iso, D.data('2026-11-20').iso, D.data('31/02/2026'), D.data('niente')], ['2026-11-22', '2026-05-02', '2026-11-20', null, null]));
  caso('dati di riferimento', () => { const r = D.leggi(TESTA + GIORNO).rif; return [uguale([r.data, r.sesso, r.eta, r.statura, r.peso, r.pesoObiettivo, r.ritmo, r.bmr, r.tdee, r.target, r.proteine, r.idratazione], ['2026-03-01', 'F', 41, 1.65, 74, 62, 0.4, 1400, 1960, 1500, [80, 100], 1.8]), r]; });
  caso('il peso obiettivo non è scambiato per il peso', () => D.leggi('# D\n## Dati di riferimento\n- Peso obiettivo: 62 kg; statura 1,65 m, peso 74 kg\n### 2 marzo 2026\n' + PASTO('Pranzo', '', [['a', '1', '10']])).rif.peso === 74);
  caso('giorno chiuso: totale, soglia, stato', () => { const g = D.leggi(TESTA + GIORNO).giorni[0]; return [g.data === '2026-03-02' && g.stato === 'chiusa' && g.kcal === 1310 && g.soglia === 1500 && g.deficit === 650, g]; });
  caso('macronutrienti dal riepilogo', () => uguale(D.leggi(TESTA + GIORNO).giorni[0].macro, { c: 150, p: 82.5, g: 40, f: 21 }));
  caso('pasti: nome, ora, righe, totale', () => { const p = D.leggi(TESTA + GIORNO).giorni[0].pasti; return [p.length === 2 && p[0].nome === 'Colazione' && p[0].ora === '07:30' && p[0].kcal === 236 && p[0].righe.length === 2 && p[1].kcal === 1074 && p[1].righe.length === 4, p]; });
  caso('stime marcate con (*) o con ≈', () => { const r = D.leggi(TESTA + GIORNO).giorni[0].pasti; return uguale(r[0].righe.map(x => x.stima).concat(r[1].righe.map(x => x.stima)), [true, false, false, true, false, false]) && r[0].righe[0].nome === 'Latte'; });
  caso('macronutrienti del pasto, zuccheri compresi', () => uguale(D.leggi(TESTA + GIORNO).giorni[0].pasti[0].macro, { c: 40, p: 11, g: 4, f: 3, z: 12 }));
  caso('giornata in corso', () => { const g = D.leggi(TESTA + '### 3 marzo 2026 — IN CORSO: progressivo ≈ 318 kcal (soglia 1500, residuo ≈ 1182)\nProgressivo macronutrienti: carboidrati ≈ 54 g, proteine ≈ 13 g, grassi ≈ 5 g, fibra ≈ 7 g.\n\n' + PASTO('Colazione', '08:50', [['Latte', '200 g', '92'], ['Mela', '200 g', '226']], 318)).giorni[0]; return [g.stato === 'corso' && g.kcal === 318 && g.deficit === null && g.macro.p === 13, g]; });
  caso('senza indicazione: chiuso se è passato, in corso se è oggi', () => { const t = TESTA + '### 3 marzo 2026\n' + PASTO('Pranzo', '', [['a', '1', '400']]); return D.leggi(t, '2026-03-05').giorni[0].stato === 'chiusa' && D.leggi(t, '2026-03-03').giorni[0].stato === 'corso'; });
  caso('titolo con data numerica e giorno della settimana davanti', () => uguale(D.leggi(TESTA + '### 04/03/2026 — GIORNATA CHIUSA: 900 kcal\n' + PASTO('Cena', '', [['a', '1', '900']]) + '\n### Giovedì 5 marzo 2026\n' + PASTO('Cena', '', [['a', '1', '700']])).giorni.map(g => [g.data, g.kcal]), [['2026-03-04', 900], ['2026-03-05', 700]]));
  caso('senza totale nel titolo vale la somma dei pasti', () => D.leggi(TESTA + '### 6 marzo 2026\n' + PASTO('Pranzo', '', [['a', '1', '400'], ['b', '1', '150']]) + PASTO('Cena', '', [['c', '1', '600']], 600)).giorni[0].kcal === 1150);
  caso('senza riepilogo i macronutrienti sono la somma dei pasti', () => { const g = D.leggi(TESTA + '### 6 marzo 2026 — GIORNATA CHIUSA: 500 kcal\n' + PASTO('Pranzo', '', [['a', '1', '300']]) + '\nMacronutrienti: carboidrati ≈ 30 g, proteine ≈ 20,5 g, grassi ≈ 9 g, fibra ≈ 4 g.\n\n' + PASTO('Cena', '', [['c', '1', '200']]) + '\nMacronutrienti (etichetta): carboidrati 8,5 g, proteine 17 g, grassi 2,7 g, fibra 1,7 g.\n').giorni[0]; return [uguale([g.macro.c, g.macro.p, g.macro.g, g.macro.f], [38.5, 37.5, 11.7, 5.7]), g.macro]; });
  caso('totale del giorno scritto in fondo', () => D.leggi(TESTA + '### 7 marzo 2026 — GIORNATA CHIUSA\n' + PASTO('Cena', '', [['c', '1', '640']]) + '\n**Totale giornaliero finale: ≈ 1.640 kcal — residuo: ≈ 0 kcal**\n').giorni[0].kcal === 1640);
  caso('incongruenze segnalate, senza fermarsi', () => { const m = D.leggi(TESTA + '### 8 marzo 2026 — GIORNATA CHIUSA: 999 kcal\n' + PASTO('Cena', '', [['c', '1', '600'], ['d', '1', '100']], 650)); return [m.avvisi.length === 2 && m.giorni[0].kcal === 999 && m.giorni[0].pasti[0].kcal === 650, m.avvisi]; });
  caso('passi: non si confondono con l\'ora', () => D.leggi(TESTA + '### 9 marzo 2026 — GIORNATA CHIUSA: 600 kcal\nPassi del giorno (orologio, parziali alle 21:30 circa): ≈ 3.900.\n' + PASTO('Cena', '', [['c', '1', '600']])).giorni[0].passi === 3900);
  caso('acqua dichiarata, in millilitri o in litri', () => uguale(['Acqua: 500 ml di acqua frizzante entro le 18:10', 'Acqua: ≈ 1,5 l'].map(a => D.leggi(TESTA + '### 9 marzo 2026 — GIORNATA CHIUSA: 600 kcal\n\n' + a + '\n\n' + PASTO('Cena', '', [['c', '1', '600']])).giorni[0].acqua), [500, 1500]));
  caso('peso, vita e collo scritti nel giorno', () => { const g = D.leggi(TESTA + '### 9 marzo 2026 — GIORNATA CHIUSA: 600 kcal\nPeso: 73,4 kg a digiuno. Circonferenza vita: 91,5 cm; collo 38 cm.\n' + PASTO('Cena', '', [['c', '1', '600']])).giorni[0]; return [uguale([g.peso, g.vita, g.collo], [73.4, 91.5, 38]), g]; });
  caso('«peso obiettivo» e «5 kg persi» non sono pesate', () => { const g = D.leggi(TESTA + '### 9 marzo 2026 — GIORNATA CHIUSA: 600 kcal\nPeso obiettivo: 62 kg. Ricalcolo del peso ogni 5 kg persi. Peso della pizza ≈ 280 g.\n' + PASTO('Cena', '', [['c', '1', '600']])).giorni[0]; return g.peso === null; });
  caso('misure: riferimento, storico nel testo, tabella, giorni', () => { const m = D.leggi(TESTA.replace('## Storico', '## Monitoraggio\n- ultima misura 75,2 kg il 03/02/2026 (76,0 kg il 20/01/2026)\n\n### Misure\n| Data | Peso (kg) | Vita (cm) | Collo |\n|---|---|---|---|\n| 05/03/2026 | 73,8 | 92 | — |\n| 12 marzo 2026 | 73,1 | 91 | 37,5 |\n\n## Storico') + '### 9 marzo 2026 — GIORNATA CHIUSA: 600 kcal\nPeso: 73,4 kg.\n' + PASTO('Cena', '', [['c', '1', '600']])).misure; return [uguale(m.map(x => [x.data, x.peso, x.vita || null, x.collo || null]), [['2026-01-20', 76, null, null], ['2026-02-03', 75.2, null, null], ['2026-03-01', 74, null, null], ['2026-03-05', 73.8, 92, null], ['2026-03-09', 73.4, null, null], ['2026-03-12', 73.1, 91, 37.5]]), m]; });
  caso('sezioni generali conservate, lo storico no', () => { const s = D.leggi(TESTA + GIORNO).sezioni; return [s.length === 1 && s[0].titolo === 'Dati di riferimento (01/03/2026)' && s[0].md.includes('Target giornaliero'), s]; });
  caso('i giorni escono in ordine di data, qualunque sia l\'ordine nel file', () => uguale(D.leggi(TESTA + ['10', '8', '9'].map(g => '### ' + g + ' marzo 2026 — GIORNATA CHIUSA: 500 kcal\n' + PASTO('Cena', '', [['c', '1', '500']])).join('\n')).giorni.map(g => g.data), ['2026-03-08', '2026-03-09', '2026-03-10']));
  caso('giorno scritto due volte: vale l\'ultimo, con avviso', () => { const m = D.leggi(TESTA + '### 8 marzo 2026 — GIORNATA CHIUSA: 500 kcal\n' + PASTO('Cena', '', [['c', '1', '500']]) + '\n### 8 marzo 2026 — GIORNATA CHIUSA: 700 kcal\n' + PASTO('Cena', '', [['c', '1', '700']])); return m.giorni.length === 1 && m.giorni[0].kcal === 700 && m.avvisi.length === 1; });
  caso('un titolo con una data in mezzo non è un giorno', () => D.leggi(TESTA + '### Nota sul 3 marzo 2026\ntesto\n' + GIORNO).giorni.length === 1);
  caso('una tabella senza kcal non è un pasto: resta fra le note', () => { const g = D.leggi(TESTA + '### 8 marzo 2026 — GIORNATA CHIUSA: 500 kcal\n#### Farmaci\n| Nome | Dose |\n|---|---|\n| Vitamina D | 1 |\n\n' + PASTO('Cena', '', [['c', '1', '500']])).giorni[0]; return g.pasti.length === 1 && g.note.includes('Vitamina D'); });
  caso('un titolo dentro un blocco di codice non conta', () => D.leggi(TESTA + '```\n### 1 gennaio 2020\n```\n' + GIORNO).giorni.length === 1);
  caso('fine riga di Windows e BOM', () => D.leggi('﻿' + (TESTA + GIORNO).replace(/\n/g, '\r\n')).giorni[0].kcal === 1310);
  caso('testo qualunque: nessun giorno, nessun errore', () => { const m = D.leggi('# Lista della spesa\n\n- pane\n- latte\n'); return m.giorni.length === 0 && m.misure.length === 0; });
  caso('file vuoto', () => D.leggi('').giorni.length === 0 && D.leggi(null).giorni.length === 0);
  caso('indicatori: medie e deficit sui soli giorni chiusi', () => {
    const t = TESTA + [['2', 1300, 150, 80, 40, 20], ['3', 1500, 160, 90, 50, 22], ['4', 1700, 170, 100, 60, 24]].map(x => '### ' + x[0] + ' marzo 2026 — GIORNATA CHIUSA: ' + x[1] + ' kcal (soglia 1500)\nRiepilogo: carboidrati ≈ ' + x[2] + ' g, proteine ≈ ' + x[3] + ' g, grassi ≈ ' + x[4] + ' g, fibra ≈ ' + x[5] + ' g.\n' + PASTO('Cena', '', [['c', '1', String(x[1])]])).join('\n') +
      '\n### 5 marzo 2026 — IN CORSO: progressivo ≈ 200 kcal (soglia 1500)\n' + PASTO('Colazione', '', [['c', '1', '200']]);
    const o = D.indicatori(D.leggi(t, '2026-03-05'));
    return [uguale([o.giorni, o.chiusi, o.mediaKcal, o.sottoSoglia, o.serie, o.mediaP, o.mediaF, o.mediaDeficit, o.deficitCumulato, Math.round(o.kgTeorici * 1e4)], [4, 3, 1500, 2, 0, 90, 22, 460, 1380, Math.round(1380 / 7700 * 1e4)]), o];
  });
  caso('indicatori: peso, BMI, arrivo secondo il piano', () => {
    const o = D.indicatori(D.leggi(TESTA + '### 15 marzo 2026 — GIORNATA CHIUSA: 1500 kcal\nPeso: 73 kg.\n' + PASTO('Cena', '', [['c', '1', '1500']])));
    return [o.peso.valore === 73 && o.peso.data === '2026-03-15' && o.variazione === -1 && Math.abs(o.bmi - 73 / 1.65 / 1.65) < 1e-9 && o.daPerdere === 11 && Math.abs(o.progresso - 1 / 12) < 1e-9 && Math.abs(o.settimanePiano - 27.5) < 1e-9 && o.arrivoPiano === '2026-09-24' && Math.abs(o.ritmoDeficit - 460 * 7 / 7700) < 1e-9, o];
  });
  caso('indicatori: quota di energia da proteine, carboidrati, grassi', () => { const q = D.indicatori(D.leggi(TESTA + '### 2 marzo 2026 — GIORNATA CHIUSA: 1300 kcal\nRiepilogo: carboidrati ≈ 100 g, proteine ≈ 100 g, grassi ≈ 100 g.\n' + PASTO('Cena', '', [['c', '1', '1300']]))).quote; return [Math.abs(q[0] - 400 / 1700) < 1e-9 && Math.abs(q[2] - 900 / 1700) < 1e-9, q]; });
  caso('indicatori di un diario con il solo giorno in corso', () => { const o = D.indicatori(D.leggi(TESTA + '### 5 marzo 2026 — IN CORSO: progressivo ≈ 200 kcal\n' + PASTO('Colazione', '', [['c', '1', '200']]))); return o.chiusi === 0 && o.mediaKcal === null && o.kgTeorici === null && o.serie === 0; });

  let ok = 0;
  const righe = [];
  for (const [nome, fn] of casi) {
    let esito, extra;
    try { const r = fn(); esito = Array.isArray(r) ? !!r[0] : !!r; extra = Array.isArray(r) ? r[1] : undefined; } catch (e) { esito = false; extra = String(e && e.stack || e); }
    if (esito) ok++;
    righe.push({ nome, esito, extra });
  }
  const riassunto = ok === casi.length ? 'Tutte le ' + casi.length + ' prove superate.' : (casi.length - ok) + ' prove fallite su ' + casi.length + '.';
  if (typeof document !== 'undefined') {
    document.getElementById('esito').textContent = riassunto;
    document.getElementById('esito').className = ok === casi.length ? 'ok' : 'ko';
    for (const r of righe) { const li = document.createElement('li'); li.className = r.esito ? 'ok' : 'ko'; li.textContent = (r.esito ? '✓ ' : '✗ ') + r.nome; if (!r.esito && r.extra !== undefined) { const p = document.createElement('pre'); p.textContent = typeof r.extra === 'string' ? r.extra : JSON.stringify(r.extra, null, 1); li.appendChild(p); } document.getElementById('elenco').appendChild(li); }
  } else {
    for (const r of righe) if (!r.esito) console.log('✗ ' + r.nome, r.extra === undefined ? '' : JSON.stringify(r.extra));
    console.log(riassunto);
    if (ok !== casi.length) process.exitCode = 1;
  }
})(typeof window !== 'undefined' ? window : globalThis);
