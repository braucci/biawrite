/* BiaWrite — meteo.js
 * Il tempo che fa, per la plancia: poche grandezze, icone chiare.
 * I dati vengono da Open-Meteo (open-meteo.com, licenza CC BY 4.0), senza chiave: si inviano solo le
 * coordinate della località scelta nelle impostazioni, arrotondate. Nessuna località, nessuna richiesta.
 * L'ultima risposta resta sul dispositivo: senza rete si vede quella, con l'ora a cui risale.
 * © B. Raucci — licenza MIT
 */
(function (root) {
  'use strict';
  const PREVISIONI = 'https://api.open-meteo.com/v1/forecast', LUOGHI = 'https://geocoding-api.open-meteo.com/v1/search';
  const K = 'biawrite.meteo', FRESCO = 30 * 60 * 1000;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Codici WMO → [descrizione, icona di giorno, icona di notte] */
  const CODICI = {
    0: ['Sereno', 'sole', 'luna'], 1: ['Quasi sereno', 'sole', 'luna'], 2: ['Poco nuvoloso', 'sole-nuvola', 'luna-nuvola'], 3: ['Coperto', 'nuvola'],
    45: ['Nebbia', 'nebbia'], 48: ['Nebbia con brina', 'nebbia'],
    51: ['Pioviggine debole', 'pioviggine'], 53: ['Pioviggine', 'pioviggine'], 55: ['Pioviggine fitta', 'pioviggine'], 56: ['Pioviggine gelata', 'pioviggine'], 57: ['Pioviggine gelata fitta', 'pioviggine'],
    61: ['Pioggia debole', 'pioggia'], 63: ['Pioggia', 'pioggia'], 65: ['Pioggia forte', 'pioggia-forte'], 66: ['Pioggia gelata', 'pioggia'], 67: ['Pioggia gelata forte', 'pioggia-forte'],
    71: ['Neve debole', 'neve'], 73: ['Neve', 'neve'], 75: ['Neve forte', 'neve'], 77: ['Nevischio', 'neve'],
    80: ['Rovesci deboli', 'pioggia'], 81: ['Rovesci', 'pioggia-forte'], 82: ['Rovesci violenti', 'pioggia-forte'], 85: ['Rovesci di neve', 'neve'], 86: ['Rovesci di neve forti', 'neve'],
    95: ['Temporale', 'temporale'], 96: ['Temporale con grandine', 'temporale'], 97: ['Temporale forte', 'temporale'], 99: ['Temporale con grandine forte', 'temporale'],
  };
  /* Icone al tratto, 24 × 24: stessa mano di quelle della barra. Il colore lo dà il testo. */
  const NUVOLA = '<path d="M7 18a4 4 0 01-.6-7.96A5.5 5.5 0 0117 9.6 4.2 4.2 0 0117.2 18z"/>';
  const NUVOLA_ALTA = '<path d="M7 15a3.6 3.6 0 01-.5-7.17A5 5 0 0116.3 7.4 3.8 3.8 0 0116.5 15z"/>';
  const ICONE = {
    'sole': '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    'luna': '<path d="M19.5 14.2A8 8 0 019.8 4.5a8 8 0 109.7 9.7z"/>',
    'sole-nuvola': '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.6M2 8h1.6M3.8 3.8l1.1 1.1M12.2 3.8l-1.1 1.1"/><path d="M9.5 19a3.5 3.5 0 01-.4-6.98A4.8 4.8 0 0118.3 11 3.9 3.9 0 0118.5 19z"/>',
    'luna-nuvola': '<path d="M11.6 6.3A4.6 4.6 0 006 3a4.6 4.6 0 00.9 6.6"/><path d="M9.5 19a3.5 3.5 0 01-.4-6.98A4.8 4.8 0 0118.3 11 3.9 3.9 0 0118.5 19z"/>',
    'nuvola': NUVOLA,
    'nebbia': NUVOLA_ALTA + '<path d="M4 18.5h16M7 21.5h10"/>',
    'pioviggine': NUVOLA_ALTA + '<path d="M9 18.3v1.4M12.5 18.3v1.4M16 18.3v1.4"/>',
    'pioggia': NUVOLA_ALTA + '<path d="M9 17.8l-1 3.2M13 17.8l-1 3.2M17 17.8l-1 3.2"/>',
    'pioggia-forte': NUVOLA_ALTA + '<path d="M7.6 17.5l-1.3 4M11 17.5l-1.3 4M14.4 17.5l-1.3 4M17.8 17.5l-1.3 4"/>',
    'neve': NUVOLA_ALTA + '<path d="M8.5 18.6v.01M12 20.4v.01M15.5 18.6v.01M10.2 21.8v.01M13.8 21.8v.01" stroke-width="2.4"/>',
    'temporale': NUVOLA_ALTA + '<path d="M12.6 16.4l-2.3 3.4h3l-1.6 2.9"/>',
    'termometro': '<path d="M10 13.6V5a2 2 0 014 0v8.6a4 4 0 11-4 0z"/><path d="M12 9v7"/>',
    'goccia': '<path d="M12 3.5c3 3.7 5.5 6.6 5.5 9.9a5.5 5.5 0 01-11 0c0-3.3 2.5-6.2 5.5-9.9z"/>',
    'vento': '<path d="M3 9h10.5a2.5 2.5 0 10-2.4-3.2M3 13h15a2.5 2.5 0 11-2.4 3.2M3 17h7"/>',
    'umidita': '<path d="M12 3.5c3 3.7 5.5 6.6 5.5 9.9a5.5 5.5 0 01-11 0c0-3.3 2.5-6.2 5.5-9.9z"/><path d="M9.5 14.5a2.6 2.6 0 002.5 2.4"/>',
    'spillo': '<path d="M12 21s6-5.6 6-10.5a6 6 0 10-12 0C6 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  };
  const svg = (nome, cls) => '<svg class="mt-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONE[nome] || ICONE.nuvola) + '</svg>';
  const voce = c => CODICI[c] || ['Tempo variabile', 'nuvola'];
  const icona = (codice, giorno, cls) => { const v = voce(codice); return svg(giorno === false && v[2] ? v[2] : v[1], cls); };
  const gradi = v => (v == null || isNaN(v) ? '–' : Math.round(v) + '°');

  /* La risposta di Open-Meteo, ridotta a ciò che la plancia mostra. */
  function riduci(j) {
    const c = j.current || {}, h = j.hourly || {}, d = j.daily || {};
    const o = {
      quando: Date.now(), fuso: j.timezone || '',
      ora: { t: c.temperature_2m, percepita: c.apparent_temperature, codice: c.weather_code, giorno: c.is_day !== 0, vento: c.wind_speed_10m, umidita: c.relative_humidity_2m, pioggia: c.precipitation },
      oggi: { min: d.temperature_2m_min && d.temperature_2m_min[0], max: d.temperature_2m_max && d.temperature_2m_max[0], prob: d.precipitation_probability_max && d.precipitation_probability_max[0] },
      domani: d.time && d.time.length > 1 ? { min: d.temperature_2m_min[1], max: d.temperature_2m_max[1], prob: d.precipitation_probability_max && d.precipitation_probability_max[1], codice: d.weather_code && d.weather_code[1] } : null,
      ore: [],
    };
    if (typeof o.ora.t !== 'number' || typeof o.ora.codice !== 'number') throw new Error('risposta senza dati');
    const tempi = h.time || [];
    let i = tempi.findIndex(t => t > (c.time || ''));
    if (i < 0) i = 0;
    for (const k of [2, 5, 8, 11]) {                       // fra circa 3, 6, 9 e 12 ore
      const x = i + k;
      if (x >= tempi.length) break;
      o.ore.push({ h: tempi[x].slice(11, 13), t: h.temperature_2m[x], codice: h.weather_code[x], giorno: !h.is_day || h.is_day[x] !== 0, prob: h.precipitation_probability ? h.precipitation_probability[x] : null });
    }
    return o;
  }

  const memoria = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch (e) { return null; } };
  const stesso = (m, l) => m && l && Math.abs(m.lat - l.lat) < 0.011 && Math.abs(m.lon - l.lon) < 0.011;

  /** prendi(luogo, { forza }) → { dati, vecchio } — dalla memoria se è fresca, altrimenti dalla rete; senza rete, l'ultima risposta. */
  async function prendi(luogo, opz) {
    if (!luogo || typeof luogo.lat !== 'number' || typeof luogo.lon !== 'number') return null;
    const m = memoria();
    if (stesso(m, luogo) && !(opz && opz.forza) && Date.now() - m.dati.quando < FRESCO) return { dati: m.dati, vecchio: false };
    const u = PREVISIONI + '?latitude=' + luogo.lat.toFixed(2) + '&longitude=' + luogo.lon.toFixed(2) +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day,precipitation' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2&wind_speed_unit=kmh';
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      const dati = riduci(await r.json());
      try { localStorage.setItem(K, JSON.stringify({ lat: luogo.lat, lon: luogo.lon, dati })); } catch (e) { /* pazienza */ }
      return { dati, vecchio: false };
    } catch (e) {
      if (stesso(m, luogo)) return { dati: m.dati, vecchio: true };
      throw e;
    }
  }

  /** cerca('Napoli') → [{ nome, dove, lat, lon }] */
  async function cerca(nome) {
    const r = await fetch(LUOGHI + '?name=' + encodeURIComponent(String(nome).trim()) + '&count=6&language=it&format=json', { cache: 'no-store' });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    return (j.results || []).filter(x => typeof x.latitude === 'number').map(x => ({ nome: x.name, dove: [x.admin2 !== x.name ? x.admin2 : '', x.admin1, x.country].filter((v, i, a) => v && a.indexOf(v) === i).join(', '), lat: Math.round(x.latitude * 100) / 100, lon: Math.round(x.longitude * 100) / 100 }));
  }
  /** La posizione del dispositivo, arrotondata al centesimo di grado (circa un chilometro). */
  function qui() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Questo dispositivo non dice la sua posizione.'));
      navigator.geolocation.getCurrentPosition(p => res({ nome: 'Qui', lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
        e => rej(new Error(e.code === 1 ? 'Il permesso di leggere la posizione non è stato dato.' : 'La posizione non è disponibile.')), { maximumAge: 3600000, timeout: 15000 });
    });
  }

  /** Il riquadro della plancia. `esito` = ciò che restituisce prendi(); senza località invita a sceglierla. */
  function html(luogo, esito, errore) {
    if (!luogo) return '<button class="mt-vuoto" data-a="meteo-luogo">' + svg('sole-nuvola') + '<span><b>Meteo</b><small>scegli la località</small></span></button>';
    if (!esito) return '<div class="mt mt-attesa">' + svg('nuvola') + '<span><b>' + esc(luogo.nome) + '</b><small>' + (errore ? 'meteo non raggiungibile' : 'sto guardando fuori…') + '</small></span>' + (errore ? '<button class="mt-riprova" data-a="meteo-riprova">Riprova</button>' : '') + '</div>';
    const d = esito.dati, o = d.ora, v = voce(o.codice);
    const ora = new Date(d.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const dice = esc(luogo.nome) + ': ' + gradi(o.t) + ', ' + v[0].toLowerCase() + '; minima ' + gradi(d.oggi.min) + ', massima ' + gradi(d.oggi.max) + (d.oggi.prob != null ? '; probabilità di pioggia ' + Math.round(d.oggi.prob) + '%' : '');
    let s = '<div class="mt" role="group" aria-label="' + dice + '">' +
      '<div class="mt-ora">' + icona(o.codice, o.giorno, 'grande') + '<b class="mt-t">' + gradi(o.t) + '</b>' +
      '<div class="mt-d"><span class="mt-desc">' + esc(v[0]) + '</span><span class="mt-luogo">' + svg('spillo') + esc(luogo.nome) + (esito.vecchio ? ' · alle ' + ora : '') + '</span>' +
      '<a class="mt-fonte" href="https://open-meteo.com/" target="_blank" rel="noopener" title="Dati meteo di Open-Meteo.com (CC BY 4.0)">dati Open-Meteo</a></div></div>' +
      '<ul class="mt-fatti">' +
      '<li title="Minima e massima di oggi">' + svg('termometro') + '<span>' + gradi(d.oggi.min) + ' / ' + gradi(d.oggi.max) + '</span></li>' +
      (d.oggi.prob != null ? '<li title="Probabilità di pioggia oggi">' + svg('goccia') + '<span>' + Math.round(d.oggi.prob) + '%</span></li>' : '') +
      (o.vento != null ? '<li title="Vento">' + svg('vento') + '<span>' + Math.round(o.vento) + ' km/h</span></li>' : '') +
      (o.percepita != null && Math.abs(o.percepita - o.t) >= 2 ? '<li class="perc" title="Temperatura percepita">percepiti <span>' + gradi(o.percepita) + '</span></li>' : '') + '</ul>';
    if (d.ore.length) s += '<ol class="mt-ore" aria-label="Prossime ore">' + d.ore.map(x => '<li><time>' + esc(x.h) + '</time>' + icona(x.codice, x.giorno) + '<b>' + gradi(x.t) + '</b>' + (x.prob >= 25 ? '<small title="Probabilità di pioggia">' + Math.round(x.prob) + '%</small>' : '<small></small>') + '</li>').join('') +
      (d.domani ? '<li class="domani"><time>domani</time>' + icona(d.domani.codice, true) + '<b>' + gradi(d.domani.max) + '</b><small>' + gradi(d.domani.min) + '</small></li>' : '') + '</ol>';
    return s + '</div>';
  }

  root.BiaMeteo = { prendi, cerca, qui, html, riduci, CODICI, icona, svg, FRESCO };
})(typeof window !== 'undefined' ? window : globalThis);
