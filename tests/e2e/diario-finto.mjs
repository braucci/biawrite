/* Un diario alimentare inventato, nello stesso formato di quello vero: serve ai collaudi.
 * Persona e numeri sono di fantasia. Lo stesso seme produce sempre lo stesso diario. */
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const due = n => String(n).padStart(2, '0');
export const piu = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function caso(seme) { let s = seme >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const it = n => String(n).replace('.', ',');

/**
 * diarioFinto({ fine: 'AAAA-MM-GG', giorni, inCorso, buchi: [indici], oltre: [indici], surplus: [indici], misure, seme })
 * Restituisce { testo, attesi: [{ data, kcal, stato, p, c, g, f, pasti }] } in ordine di data.
 */
export function diarioFinto(o = {}) {
  const fine = o.fine || '2026-11-22', n = o.giorni || 3, r = caso(o.seme || 7);
  const buchi = new Set(o.buchi || []), oltre = new Set(o.oltre || []), surplus = new Set(o.surplus || []);
  const inizio = piu(fine, -(n - 1));
  const attesi = [], blocchi = [];
  for (let i = 0; i < n; i++) {
    if (buchi.has(i)) continue;
    const d = piu(inizio, i), [a, m, g] = d.split('-').map(Number), giorno = new Date(d + 'T00:00:00Z').getUTCDay();
    const corso = !!o.inCorso && i === n - 1;
    const extra = surplus.has(i) ? 1100 : oltre.has(i) ? 450 : 0;
    const pasti = [
      ['Colazione', '07:' + due(10 + Math.floor(r() * 40)), [['Latte parz. scremato (*)', '200 ml', 92], ['Fette biscottate integrali', '4 fette (36 g)', 144], ['Confettura', '1 × 25 g', 60]], [49, 12, 5, 3.5]],
      ['Pranzo', '13:' + due(Math.floor(r() * 50)), [['Pasta secca (*)', '70 g', 247], ['Sugo di pomodoro (*)', '≈ 100 g', 40 + Math.round(r() * 30)], ['Olio EVO', '1 cucchiaino (5 g)', 45], ['Insalata mista (*)', '≈ 150 g', 24]], [62 + Math.round(r() * 8), 14, 9, 6]],
      ['Merenda', '16:' + due(Math.floor(r() * 50)), [['Yogurt proteico (etichetta)', '1 vasetto (160 g)', 86]], [5.9, 15, 0.2, 0]],
      ['Cena', '20:' + due(Math.floor(r() * 40)), [['Petto di pollo ai ferri', '180 g', 198], ['Verdure grigliate (*)', '≈ 200 g', 60 + Math.round(r() * 40)], ['Pane integrale', '50 g', 120 + extra], ['Olio EVO', '2 cucchiaini (10 g)', 90]], [28 + Math.round(extra / 8), 48, 16 + Math.round(extra / 30), 8]],
    ];
    const usati = corso ? pasti.slice(0, 2) : pasti;
    const tot = usati.reduce((t, p) => t + p[2].reduce((s, x) => s + x[2], 0), 0);
    const mac = [0, 1, 2, 3].map(k => Math.round(usati.reduce((t, p) => t + p[3][k], 0) * 10) / 10);
    const soglia = o.soglia || 1500;
    const senzaRiepilogo = !corso && i % 5 === 3;                 // ogni tanto il riepilogo manca: valgono i pasti
    const titolo = i % 4 === 2 && !corso ? '### ' + due(g) + '/' + due(m) + '/' + a + ' — GIORNATA CHIUSA: ' + tot + ' kcal (soglia ' + soglia + ', margine ' + (soglia - tot) + ')'
      : '### ' + g + ' ' + MESI[m - 1] + ' ' + a + (i % 3 === 0 ? ' (' + SETT[giorno] + ')' : '') + (corso ? ' — IN CORSO: progressivo ≈ ' + tot + ' kcal (soglia ' + soglia + ', residuo ≈ ' + (soglia - tot) + ')' : ' — GIORNATA CHIUSA: ' + tot + ' kcal (soglia ' + soglia + ', margine ' + (soglia - tot) + ')');
    let t = titolo + '\n';
    if (!senzaRiepilogo) t += (corso ? 'Progressivo macronutrienti' : 'Riepilogo') + ': carboidrati ≈ ' + it(mac[0]) + ' g, proteine ≈ ' + it(mac[1]) + ' g (obiettivo 80-100), grassi ≈ ' + it(mac[2]) + ' g, fibra ≈ ' + it(mac[3]) + ' g. Ripartizione: ' + usati.map(p => p[0].toLowerCase() + ' ' + p[2].reduce((s, x) => s + x[2], 0)).join(', ') + '.\n';
    const passi = i % 2 === 0 ? 3000 + Math.round(r() * 5000) : null;
    if (passi) t += 'Passi del giorno (orologio, parziali alle 21:30 circa): ≈ ' + passi + '.\n';
    if (i % 3 === 1) t += '\nAcqua: 750 ml di acqua naturale entro le 18:00 (dichiarata).\n';
    const peso = o.misure && o.misure[d];
    if (peso) t += '\nPeso: ' + it(peso) + ' kg, a digiuno.\n';
    t += '\nPunti da migliorare emersi:\n- Fibra bassa: più **verdure** e legumi.\n- Bere con regolarità.\n\n#### Dettaglio pasti\n';
    for (const p of usati) {
      const tp = p[2].reduce((s, x) => s + x[2], 0);
      t += '\n##### ' + p[0] + ' (≈ ' + p[1] + ')\n| Alimento | Quantità | kcal |\n|---|---|---|\n' + p[2].map(x => '| ' + x[0] + ' | ' + x[1] + ' | ' + x[2] + ' |').join('\n') + '\n| **Totale ' + p[0].toLowerCase() + '** | | **≈ ' + tp + '** |\n\n' +
        'Macronutrienti stimati: carboidrati ≈ ' + it(p[3][0]) + ' g, proteine ≈ ' + it(p[3][1]) + ' g, grassi ≈ ' + it(p[3][2]) + ' g, fibra ≈ ' + it(p[3][3]) + ' g.\n';
    }
    if (!corso) t += '\n**Totale giornaliero finale: ≈ ' + tot + ' kcal — residuo rispetto al target (' + soglia + '): ≈ ' + (soglia - tot) + ' kcal**\n';
    blocchi.push(t);
    attesi.push({ data: d, kcal: tot, stato: corso ? 'corso' : 'chiusa', c: mac[0], p: mac[1], g: mac[2], f: mac[3], pasti: usati.length, passi, peso: peso || null });
  }
  const testa = '# Diario alimentare — registro giornaliero\n\nRegistro di prova, con dati inventati. Le grammature non pesate sono stime e sono marcate con (*).\n\n' +
    '## Dati di riferimento (' + inizio.split('-').reverse().join('/') + ')\n- Femmina, 41 anni, statura 1,65 m, peso 74 kg (BMI ≈ 27,2)\n- Peso obiettivo: 62 kg (BMI ≈ 22,8), da raggiungere con perdita di ≈ 0,4 kg/settimana\n' +
    '- BMR (Mifflin-St Jeor) ≈ 1400 kcal; TDEE da formula (PAL 1,4) ≈ 1960 kcal\n- **Target giornaliero: ≈ ' + (o.soglia || 1500) + ' kcal** (deficit ≈ 460 kcal); proteine 80-100 g/die\n- Idratazione: obiettivo ≈ 1,8 l/die di bevande\n- Ricalcolo del target ogni 5 kg persi\n\n' +
    '## Monitoraggio\n- Obiettivo vita: rapporto vita/altezza < 0,5 (cioè < 82 cm a 1,65 m)\n- Peso registrato in passato: 75,2 kg il 03/02/2026\n' + (o.tabellaMisure ? '\n### Misure\n| Data | Peso (kg) | Vita (cm) | Collo (cm) |\n|---|---|---|---|\n' + o.tabellaMisure.map(x => '| ' + x.join(' | ') + ' |').join('\n') + '\n' : '') +
    '\n## Prodotti verificati / dati adottati\n- Latte parzialmente scremato: 46 kcal/100 ml (*)\n- Olio extravergine d\'oliva: 900 kcal/100 g; 1 cucchiaino = 5 g = 45 kcal\n\n## Storico giornaliero\n\n';
  return { testo: testa + blocchi.reverse().join('\n'), attesi };
}
