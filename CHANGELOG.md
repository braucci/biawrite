# Registro delle modifiche

## 1.8.1 — 22 novembre 2026

- **Scrivere sul telefono**: con la tastiera aperta la barra in alto si ritira e restano gli strumenti di
  scrittura; la riga che si scrive resta sempre sopra la capsula ˄ ˅ ✓ che iOS appoggia sulla pagina.
- I campi di scrittura chiedono al browser di non proporre i dati dei contatti.

## 1.8.0 — 22 novembre 2026

- **Aspetto rifatto.** Cartelle piccole come le icone del Finder, con il nome sotto e i colori delle
  note come pallini. Foglietti ridisegnati e in quattro formati scelti dal contenuto: striscia,
  foglietto, scheda da schedario, tabulato.
- **Cartella «Fissate»**: le note con la puntina stanno in una cartella loro, in testa.
- **Plancia** in testa alla bacheca: data, meteo, diario. Il **diario alimentare** si apre da un
  pulsante, non più da una cartella fra le note.
- **Meteo** della località scelta (Open-Meteo): tempo di adesso con icona, temperatura, minima e
  massima, pioggia, vento, prossime ore, domani. Spento finché non si sceglie una località.
- **Stile terminale**, in alternativa alla scrivania: tutto a spaziatura fissa, riquadri, cartelle a
  elenco; scuro di serie, chiaro a richiesta.

## 1.7.1 — 22 novembre 2026

- **Diario in sola lettura, dichiarato e verificato**: il file si apre esplicitamente in modalità di
  lettura e il permesso di scrittura non viene mai chiesto; il cockpit lo dice («sola lettura») e i
  comandi si chiamano «Leggi il file» / «Rileggi il file». Nuove prove automatiche: file identico dopo
  l'uso, nessuna richiesta di scrittura, nessuna API di scrittura nel modulo.
- La copia del diario nel repository privato si può escludere (*Impostazioni → Aspetto*).

## 1.7.0 — 22 novembre 2026

- **Diario alimentare**, modulo nuovo: una cartella fissa in bacheca che si apre su un cockpit
  ricavato dal file `diario-alimentare.md` (mai modificato). Andamento delle calorie con soglia,
  dispendio e media mobile; peso, BMI, percorso verso l'obiettivo e misure; indicatori sui giorni
  chiusi (media, deficit medio e accumulato, giorni entro la soglia, proteine, fibra, passi, quota di
  energia dai macronutrienti); calendario dei giorni registrati; per ogni giorno lo strumento delle
  calorie, gli obiettivi, il bilancio, i pasti con alimenti e stime, le note.
- Il diario si aggiorna scegliendo il file; in Chrome e Edge il file viene ricordato e riletto da solo.
  Con GitHub collegato viaggia nel repository privato, in `diario/`, e arriva sugli altri dispositivi.
- Giorno, notte, telefono e stampa; colori dei grafici verificati per chi non distingue i colori.

## 1.6.0 — 22 novembre 2026

- **Cartelle dei mesi**: la bacheca raccoglie le note in una cartella per mese, sotto un titolo per
  anno; la cartella è il mese di nascita della nota e non cambia quando la si ritocca. Le note con la
  puntina restano in testa. Freccia, tasto indietro del telefono e ricarica funzionano come ci si
  aspetta; la ricerca guarda dappertutto. Nel repository nulla cambia. L'elenco unico resta disponibile
  in *Impostazioni → Aspetto*.
- **Modalità notturna**: giorno, notte o come il dispositivo, decisa prima del disegno della pagina.
- **Sfondo pastello** lieve con luce e ombra morbide, in cinque tinte; i quadretti diventano un'opzione.
- **Spaziatura fissa** (IBM Plex Mono, incluso): di serie per le note `.txt`, a scelta per tutte o per
  nessuna, anche nell'anteprima dei foglietti; tasto **M** per un blocco a spaziatura fissa nelle `.md`.
- **Foglietti più veri**: aloni di tazza, gocce e pieghe su alcuni di essi, uguali su ogni dispositivo
  e senza toccare il testo; movimenti a molla, entrata a cascata, puntina che si pianta, eliminazione
  che scivola via; nessuna animazione con «riduci movimento».

## 1.5.0 — 22 novembre 2026

- **Spazio fra i capoversi** a scelta (*Impostazioni → Scrittura*): appena staccati (nuovo predefinito,
  al posto dello spazio ampio), senza spazio come a macchina, con rientro della prima riga come nei libri,
  ben staccati come in un blog. Cambia solo l'aspetto: nel file e in WordPress ogni Invio resta un
  capoverso; Maiuscolo+Invio va a capo dentro lo stesso capoverso.

## 1.4.0 — 22 novembre 2026

- **Importazione dei backup di Bear** (`.bear2bk`, anche cartelle `.textbundle` e file `.textpack`):
  date di creazione e modifica, puntine, immagini e allegati, cestino a scelta. Gli a capo di Bear
  diventano a capo veri; le note di codice e LaTeX restano testo esatto; `==evidenziato==` e le vecchie
  immagini di Bear 1 sono convertite; gli allegati non citati restano visibili. Reimportare non duplica
  e non tocca le note modificate in BiaWrite.
- **Immagini**: conservate nel repository in `note/allegati/`, mostrate nell'editor, scaricate una volta
  e tenute in una copia locale; nel testo resta sempre l'indirizzo vero.
- **Migliaia di note**: bacheca a blocchi, ricerca con un attimo di pausa, scritture in blocco, lotti di
  300 note, ricezione parallela, conteggio dell'avanzamento nello stato, freno sulle richieste a GitHub.
- Motore: gli elenchi numerati che non partono da 1 conservano il numero; le caselle `- [ ]` non vengono
  alterate. Il titolo automatico salta le righe senza testo.
- Le immagini esterne in `http://` non sono più bloccate.

## 1.3.0 — 22 novembre 2026

- **Puntina**: dal menu del foglietto o della nota aperta, «Fissa in alto» tiene una nota in testa alla
  bacheca, anche cercando. La puntina è disegnata sul foglietto e viaggia nell'indice del repository
  (`"fissata": true`), quindi compare su tutti i dispositivi. Fissare non cambia la data; la copia di
  una nota fissata nasce senza puntina.

## 1.2.0 — 22 novembre 2026

- **Archivio su GitHub** al posto di Google Drive: le note stanno in un repository privato, nella
  cartella `note/`. Ogni giro di salvataggio è un solo commit; rinomine, colori e date viaggiano
  nell'indice `note/.biawrite.json`. Niente più console di Google né permessi da rinnovare ogni ora.
- Collegamento guidato: link a GitHub precompilati per il repository privato e per la chiave;
  controllo che il repository sia privato (altrimenti BiaWrite rifiuta di usarlo) e che la chiave
  possa scrivere; errori spiegati.
- **Chiave cifrata** con il PIN e, dove il browser lo consente, con l'impronta (WebAuthn PRF).
- **Importazione** delle vecchie note: file `.md`, `.txt`, `.html`, cartelle, archivi `.zip`;
  date originali, doppioni riconosciuti, testi di Windows con gli accenti giusti, trascinamento
  sulla bacheca.
- Conflitti risolti con una copia «(altra versione …)»; rinomine fatte sul sito di GitHub seguite.
- Sul telefono la ricerca sta su una riga sua; il titolo non si ripete nell'anteprima del foglietto.
- Il service worker cancella solo le proprie cache.

## 1.1.0 — 22 novembre 2026

- Foglietti realistici: quadrati, attaccati storti ciascuno a modo suo, ombra da carta sollevata,
  orecchia piegata nell'angolo, grana della carta, scrittura a mano (carattere Kalam, incluso).
- «Copia» diventa un gesto solo: tutta la nota negli appunti come testo formattato. Tolte le voci
  per blocchi, HTML e Markdown.
- Il pulsante delle azioni di ogni foglietto sta in alto a destra.

## 1.0.0 — 22 novembre 2026

Prima versione.

- Bacheca a foglietti con anteprima, otto colori, ricerca nel testo.
- Editor per file `.md` (grassetto, corsivo, sottolineato, allineamenti, titoli, elenchi,
  citazioni, collegamenti) e per file `.txt`.
- Salvataggio automatico in IndexedDB e sincronizzazione con la cartella `BiaWrite` di Google Drive
  (ambito `drive.file`), con gestione dei conflitti tramite copia.
- Uso senza rete; installazione come app.
- Copia come testo formattato, blocchi WordPress, HTML, Markdown.
- Blocco con PIN e con impronta o volto.
