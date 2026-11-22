# BiaWrite — note tecniche

## Struttura

| File | Ruolo |
|---|---|
| `index.html` | struttura della pagina e fogli di stile |
| `tema.js` | giorno o notte e colore del tavolo, applicati **prima** che la pagina sia disegnata (niente lampo bianco); segue il sistema anche ad app aperta |
| `core.js` | **motore**: HTML dell'editor ⇄ Markdown, sanificazione, esportazioni. Nessuna rete, nessuna interfaccia |
| `archivio.js` | **archivio**: lettura e scrittura del repository GitHub (API REST «Git Database»). Nessuna interfaccia |
| `importa.js` | **importazione**: lettura di file, cartelle e archivi `.zip`, decodifica dei testi. Nessuna interfaccia |
| `app.js` | **applicazione**: bacheca, editor, archivio locale, sincronizzazione, blocco, importazione |
| `diario.js` | **diario alimentare, lettore**: dal Markdown del diario al modello (giorni, pasti, macronutrienti, misure) e agli indicatori. Nessuna interfaccia |
| `cruscotto.js`, `diario.css` | **diario alimentare, cockpit**: grafici SVG, calendario, giorno; copia locale del file e file ricordato |
| `config.js` | nome proposto per il repository delle note e cartella; **nessun segreto** |
| `sw.js` | service worker: cache dei file dell'app per l'uso senza rete |
| `manifest.webmanifest`, `icon*` | installazione sulla schermata Home |
| `fonts/` | Kalam (foglietti) e IBM Plex Mono (spaziatura fissa), licenza SIL OFL, incluse |
| `privacy.html` | informativa |
| `tests/` | collaudo del motore (`test.html`) e dell'app (`e2e/`) |

Nessuna dipendenza esterna, nessuna fase di compilazione, nessuno script di terzi. La
Content-Security-Policy in `index.html` ammette script solo dal sito stesso e connessioni solo verso
`api.github.com`.

## Il repository delle note

```
biawrite-note/            (privato)
└── note/
    ├── .biawrite.json    indice dei metadati
    ├── Idea per il blog.md
    ├── Lista della spesa.txt
    └── allegati/
        └── 1caf9a3d/     una cartella per nota (dall'identificativo di Bear)
            └── foto.jpg
```

Il titolo di una nota è il nome del suo file. Colore, «titolo automatico» (preso dalla prima riga),
data di modifica, data di creazione (`creata`, se diversa), puntina (`"fissata": true`) e, per le note
importate da Bear, il loro identificativo (`bear`) stanno nell'indice, così il contenuto dei file resta
testo puro:

```json
{ "formato": 1,
  "note": { "Idea per il blog.md": { "colore": "giallo", "auto": true, "mod": "2026-11-22T08:10:00.000Z" } } }
```

Sono considerati solo i file `.md`, `.markdown` e `.txt` direttamente dentro `note/`. Un file senza
voce nell'indice prende un colore ricavato dal nome e la data in cui BiaWrite lo vede per la prima volta.

Il Markdown prodotto usa `**grassetto**`, `*corsivo*`, `~~barrato~~`, titoli `#`, elenchi `-` e
`1.`, citazioni `>`, collegamenti `[testo](url)`; sottolineato e allineamenti in HTML. Proprietà
verificata: per ogni contenuto `h`, posto `m = htmlToMd(h)`, vale `htmlToMd(mdToHtml(m)) = m`.

## Sincronizzazione

Ogni nota locale (IndexedDB) ricorda `path` e `sha`: dove sta nel repository e quale versione vi ha
visto l'ultima volta (`sha` è l'identificativo git del contenuto, SHA-1 di `blob <n>\0<byte>`,
calcolabile anche nel browser).

**Un giro** (`giro()` in `app.js`):

1. **Istantanea** del ramo: `GET git/ref/heads/main`; se il commit è cambiato, `GET git/commits/…` e
   `GET git/trees/…?recursive=1`, più l'indice se è cambiato. Se il ramo è fermo costa una richiesta.
2. **Ricezione**: per ogni file della cartella si confronta lo `sha` con quello noto. Si scaricano i
   file nuovi o cambiati, se in locale non sono in modifica; un file sparito il cui `sha` ricompare
   con un altro nome è una **rinomina** fatta altrove e viene seguita; un file sparito e basta è
   un'eliminazione (ma se in locale era in modifica, la nota si ricrea).
3. **Invio** in un solo commit: `POST git/trees` (con `base_tree`, contenuti in linea, eliminazioni
   con `sha: null`, l'indice aggiornato), `POST git/commits`, `PATCH git/refs/heads/main` con
   `force: false`. Se nel frattempo il ramo è andato avanti GitHub risponde 422: si rilegge e si
   ripete. Una rinomina senza modifiche riusa lo `sha` del contenuto, senza ricaricarlo.
4. **Conflitto**: se una nota è stata modificata qui e il suo file nel repository ha uno `sha` diverso
   da quello noto, la versione del repository viene conservata, nello stesso commit, come file
   «(altra versione gg-mm hh.mm)» che punta allo stesso `sha`; la versione locale prende il posto
   dell'originale.
5. Le note da inviare vanno a **lotti** di al massimo 150 file o circa 1,5 MB per commit.

Un repository vuoto non ha rami e l'API Git Database risponde 409: il primo file (l'indice) si crea
con `PUT contents/…`, che inizializza il ramo.

**Quando**: tre secondi dopo l'ultima modifica, e comunque ogni trenta secondi di scrittura continua;
subito tornando alla bacheca o quando la pagina va in secondo piano; all'apertura, al ritorno in primo
piano e al ritorno della rete per ricevere. In ogni sessione, alla prima sincronizzazione, si controlla
che il repository sia ancora privato; se non lo è, BiaWrite smette di scrivere e lo dice.

Le richieste usano `cache: 'no-store'`: l'API di GitHub risponde con `max-age=60` e una cache del
browser restituirebbe un ramo vecchio fino a un minuto.

## Collegamento e chiave

Al collegamento (`provaCollegamento`): se il nome non contiene il proprietario lo si ricava da
`GET /user`; `GET /repos/…` deve rispondere e dire `private: true`; poi `prepara()` crea la cartella
se il repository è vuoto, altrimenti prova a creare un oggetto albero senza toccare il ramo, per sapere
subito se la chiave può scrivere (403 altrimenti).

I collegamenti precompilati usano i parametri documentati da GitHub:
`github.com/new?name=…&visibility=private&description=…` e
`github.com/settings/personal-access-tokens/new?name=…&description=…&expires_in=none&contents=write`.
La scelta del repository non è precompilabile: va fatta nel modulo.

## Blocco

Cifratura «a busta»:

- una chiave **maestra** casuale di 256 bit cifra (AES-GCM) la chiave di GitHub → `tokenCifrato`;
- il **PIN**, con PBKDF2-SHA-256 a 310 000 iterazioni e sale casuale, produce 512 bit: i primi 256
  servono a verificare il PIN, gli altri cifrano la maestra → `lock.kPin`;
- l'**impronta** usa l'estensione PRF di WebAuthn: l'autenticatore restituisce un segreto legato alla
  credenziale e a un sale; con HKDF-SHA-256 se ne ricava la chiave che cifra la maestra → `lock.bio`.
  Se l'autenticatore non supporta PRF, l'impronta non viene attivata.

Sbloccando in uno dei due modi si riottiene la maestra e quindi la chiave di GitHub. Cambiare il PIN
ricifra solo la maestra. Al riblocco (cinque minuti in secondo piano) maestra e chiave escono dalla
memoria. Dopo quattro PIN errati le attese crescono. La copia locale delle note non è cifrata.

## Importazione

`importa.js` raccoglie i file scelti, quelli di una cartella (`webkitdirectory`) o trascinati
(`webkitGetAsEntry`, cartelle comprese) e apre gli archivi `.zip` con un lettore minimo: indice
centrale, voci memorizzate o compresse (`DecompressionStream('deflate-raw')`), nomi in UTF-8 o, se non
dichiarati e non validi come UTF-8, nella codifica OEM CP437/850 dei vecchi zip di Windows. I testi
sono letti come UTF-8 se validi, come UTF-16 se marcati, altrimenti come Windows-1252. Gli HTML passano
per il sanificatore e diventano Markdown. Sono saltati, con il motivo, i file di altro tipo, vuoti,
protetti da password o più grandi di 2 MB; ignorati in silenzio gli scarti di sistema (`__MACOSX`,
file nascosti, `Thumbs.db`). Un doppione è una nota con lo stesso titolo e lo stesso contenuto.

## Importazione da Bear

Un `.bear2bk` è uno zip con un `backup.json` e una cartella `*.textbundle` per nota: `info.json`
(sotto `net.shinyfrog.bear`: `creationDate`, `modificationDate`, `pinned`, `trashed`, `locked`,
`uniqueIdentifier`), `text.md`, `assets/`. Lo stesso lettore accetta cartelle `.textbundle` e file
`.textpack`. Conversione (`testoBear` in `importa.js`):

1. **Classificazione.** Una nota è «tecnica» se contiene LaTeX (`\[`, `$$`, `\begin{`, `\frac`,
   `\section`…) o se almeno il 40 % delle righe ha segni inequivocabili di codice (`#include`, `def`,
   `import`, tag HTML a inizio riga, righe di sole parentesi, assegnazioni, CSS, gnuplot). Le note
   tecniche diventano `.txt` identici all'originale, tolto il `# ` che Bear antepone al titolo.
2. **A capo.** Fra due righe di testo consecutive si aggiungono due spazi (a capo esplicito); fra blocchi
   di specie diversa (testo, elenco, citazione, tabella, HTML, linea) una riga vuota; titoli e recinti
   di codice si delimitano da sé; dentro i recinti nulla cambia. La trasformazione aggiunge solo spazi
   finali e righe vuote: togliendoli si riottiene l'originale. Proprietà verificata su tutte le 2.373
   note di un backup reale.
3. **Sintassi di Bear.** `==x==` → `<mark>x</mark>` fuori dal codice in linea; `[image:ID/nome]` e
   `[file:ID/nome]` di Bear 1 → collegamenti Markdown a `assets/nome`; gli allegati non citati sono
   aggiunti in fondo.
4. **Allegati.** `assets/` diventa `allegati/<id>/`, con `<id>` = primi 8 caratteri dell'identificativo
   di Bear; i file vanno nel deposito locale «allegati» e poi nel repository come oggetti git
   (`POST git/blobs`, base64) in commit da al più 40 file, prima delle note.

**Doppioni.** Dentro un backup ogni nota è importata, anche se uguale a un'altra. Una nota già
presente in BiaWrite corrisponde a una nota di Bear se ne porta l'identificativo; se il testo
(a meno di spazi e maiuscole) è lo stesso viene proposta di aggiornarla, se è stato modificato in
BiaWrite resta com'è. Senza identificativo si confronta il testo; ogni nota presente può corrispondere
a una sola nota importata.

**Nell'editor** le immagini con indirizzo relativo (`allegati/…`) si mostrano da un `blob:` creato dalla
copia locale (o scaricato una volta dal repository e poi conservato); l'indirizzo vero resta in
`data-vero` e viene rimesso nel testo a ogni salvataggio. La copia negli appunti le esclude.

**Molte note.** La bacheca disegna 120 foglietti alla volta e aggiunge gli altri scorrendo
(`IntersectionObserver`); la ricerca aspetta 120 ms; l'importazione scrive in IndexedDB in una sola
transazione; l'invio va a lotti di 300 note o 1,5 MB; la ricezione usa 8 richieste parallele; lo stato
mostra quante note mancano. Le richieste che creano contenuti passano per un freno (al più 60 al
minuto), sotto il limite secondario di GitHub (80 al minuto, 500 all'ora).

Un backup reale di 2.373 note e 26 immagini: lettura ed esame in circa 7 s; 10 commit e 26 oggetti
per caricare tutto.

## Bacheca, temi e movimento

**Cartelle dei mesi.** Sono virtuali: nascono a ogni disegno dalla data di nascita della nota
(`creata`, sincronizzata nell'indice `note/.biawrite.json`; in mancanza, la data di modifica).
Si raggruppa per nascita e non per modifica perché è un dato stabile: ritoccare una nota non la
sposta. Il repository non cambia struttura. La vista ha tre modi: *radice* (note fissate, poi un
titolo per anno e le cartelle dei suoi mesi), *cartella* (note del mese, fissate in testa, poi per
nascita decrescente, disegnate a blocchi di 120), *elenco* (ricerca, o bacheca «tutte insieme»).
L'apertura di una cartella è una voce della cronologia del browser (`history.pushState`), così il
tasto indietro di Android, il gesto di iOS e quello del mouse escono dalla cartella; ricaricando
la pagina si resta dove si era. Una nota nuova, alla chiusura, porta alla cartella del suo mese
sostituendo la voce corrente se si era già in un'altra cartella.

**Tema.** La notte è una classe (`html.notte`) che ridefinisce le variabili di colore; la sceglie
`tema.js` da *Impostazioni* (giorno, notte, come il dispositivo) prima del primo disegno. Lo sfondo
è un pastello (`--tavolo`, sei scelte con `data-sfondo`) sotto due gradienti radiali che fanno
luce e ombra e una grana leggera; i quadretti restano come opzione. `meta theme-color` segue il
tavolo, così anche la barra del telefono cambia colore.

**Macchie e pieghe.** Ogni foglietto ricava da un hash della propria impronta (data di nascita, o
nome) un'inclinazione e, con probabilità circa 28 %, un segno: alone di tazza, alone interrotto o
goccia; con probabilità 13 % una piega. I segni sono SVG in linea con `feTurbulence` +
`feDisplacementMap` (bordi irregolari), posati con `mix-blend-mode: multiply` sotto il testo
(`z-index`) e senza intercettare il tocco. Dimensioni e posizione sono in percentuale del foglietto,
così restano proporzionati sul telefono. Lo stesso foglietto ha gli stessi segni su ogni dispositivo.

**Movimento.** Proprietà di trasformazione separate (`rotate`, `translate`, `scale`) con una curva a
molla (`cubic-bezier(.34, 1.36, .64, 1)`): il foglietto si solleva e si raddrizza un poco sotto il
puntatore. L'ombra che cresce è uno pseudo-elemento di cui varia solo l'opacità, che il browser
compone senza ridisegnare. Entrata a cascata (26 ms fra un foglietto e l'altro, al massimo 22
passi), puntina che si pianta, foglietto eliminato che scivola via. Con `prefers-reduced-motion`
tutte le animazioni sono spente.

**Spaziatura fissa.** Una sola regola (`fissaPer`) decide per l'editor e per l'anteprima del
foglietto: di serie solo i `.txt`, a scelta tutte o nessuna. Nell'editor Markdown il tasto **M**
alterna `<pre>` e `<p>` (`formatBlock`); il motore scrive `<pre>` come blocco recintato da backtick.

## Diario alimentare

Modulo facoltativo: se `diario.js` e `cruscotto.js` non sono caricati, `app.js` funziona come prima.

**Flusso dei dati.** Una sola fonte: il file `diario-alimentare.md`, scritto altrove. BiaWrite non lo
modifica e non conserva dati derivati: ogni grandezza del cockpit è ricalcolata dal testo a ogni
apertura (`BiaDiario.leggi` → `BiaDiario.indicatori`). Così un file corretto a mano corregge tutto.

```
file scelto / file ricordato ──► copia locale (IndexedDB «biawrite-diario») ──► repository privato
                                                     ▲                          diario/diario-alimentare.md
                 altri dispositivi ◄─────────────────┴──────────────────────────────────┘
```

- La copia locale sta in un archivio IndexedDB suo, separato da quello delle note.
- `archivio.js` accetta `altre: ['diario']`: l'istantanea (che legge comunque tutto l'albero del
  repository) riporta anche i file di quelle cartelle in `altri`, senza richieste in più. In `giro()`
  di `app.js`, `sincronizzaDiario` invia il diario se è stato caricato qui da un file (un commit
  «BiaWrite: aggiorna il diario alimentare»), altrimenti scarica la versione del repository quando il
  suo sha è diverso da quello locale. Se due dispositivi caricano file diversi, vale l'ultimo a
  sincronizzare: sono comunque copie dello stesso file.
- **File ricordato**: dove esiste `showOpenFilePicker` (Chrome, Edge), il riferimento al file è
  conservato in IndexedDB e riletto all'apertura della cartella e al ritorno sulla scheda, se il
  permesso è già concesso; «Rileggi il file» lo chiede quando serve. Altrove si usa `<input type=file>`.

**Sola lettura, per costruzione.** Il file d'origine non è mai scritto: `<input type=file>` dà un
oggetto `File` in sola lettura; `showOpenFilePicker` è chiamato con `mode: 'read'` e
`requestPermission` solo con `{ mode: 'read' }`, sicché `createWritable()` fallirebbe comunque. Nel
modulo non compare alcuna API di scrittura su file (il collaudo lo verifica sul sorgente e sul file:
stessi byte e stessa data di modifica dopo l'uso). Il flusso è a senso unico: file → copia locale →
copia nel repository; nulla torna al file. La copia nel repository si esclude con `S.copiaDiario = 'no'`
(né invio né ricezione).

**Lettore.** Tollerante per scelta, perché il file è scritto a mano o da un assistente:

- giorno = titolo che comincia con una data (tre forme); stato da «IN CORSO»/«CHIUSA» nel titolo,
  altrimenti dal confronto con la data di oggi;
- totale del giorno: dal titolo, altrimenti dalla riga «Totale giornaliero», altrimenti dalla somma dei pasti;
- pasto = sottotitolo con una tabella che ha una colonna `kcal`; totale dalla riga «Totale» o dalla somma;
- macronutrienti da frasi (`carboidrati ≈ N g…`); se il riepilogo del giorno manca, somma dei pasti;
- misure dal riferimento, dalle frasi «N kg il gg/mm/aaaa», dalle tabelle Data/Peso/Vita/Collo, dai giorni;
- le incongruenze fra righe e totali diventano avvisi, non errori.

**Indicatori.** Sui soli giorni chiusi. Deficit del giorno = TDEE − kcal; massa teorica = deficit
accumulato / 7700 kcal/kg (valore convenzionale del tessuto adiposo); ritmo = deficit medio × 7 / 7700;
quota di energia = 4·P, 4·C, 9·G sul loro totale; BMI = peso / statura².

**Grafici.** SVG generati alla larghezza reale del contenitore (si ridisegnano se cambia). Barre al
più di 24 px con testa arrotondata e base squadrata, griglia sottile e continua, una sola scala.
Colori dei dati verificati (distanza percettiva anche per chi non distingue i colori, contrasto sul
foglio chiaro e su quello scuro) con valori propri per la notte; lo stato di un giorno non è mai
affidato al solo colore (segno ● ▲ ○ e testo). Ogni valore del grafico è raggiungibile anche da
tastiera, nel fumetto e nella tabella «Tutti i giorni».

**Sicurezza.** Il testo del diario è trattato come dato non fidato: nomi e quantità sono inseriti
come testo; le note passano dal motore Markdown e poi dal sanificatore di `core.js`.

## Collaudo

**Motore** — apri `tests/test.html`: 42 prove. **Lettore del diario** — apri `tests/test-diario.html`
(oppure `node tests/test-diario.js`): 34 prove.

**Applicazione** — in `tests/e2e/`, con Node e Playwright:

```sh
cd tests/e2e
npm install playwright && npx playwright install chromium
node prova1.mjs && node prova2.mjs && node prova3.mjs && node prova4.mjs && node prova5.mjs && node prova6.mjs && node prova7.mjs && node prova8.mjs
```

`lib.mjs` contiene un **GitHub simulato** (oggetti git in memoria, ramo con controllo di avanzamento,
chiavi valide, cieche, di sola lettura o revocate, repository vuoto, privato o pubblico) e un piccolo
scrittore di archivi zip.

- `prova1.mjs` (44 verifiche): link precompilati; errori di collegamento; repository vuoto; nota al
  volo; numero di commit durante una scrittura lunga; rinomina in un commit; copia; secondo
  dispositivo; conflitto; colori; eliminazione; modifiche fatte dal sito; chiave revocata e
  sostituita; nomi uguali; repository diventato pubblico.
- `prova2.mjs` (34 verifiche): uso senza GitHub e senza rete; importazione (zip, testo Windows,
  HTML, doppioni, file saltati, date); 207 note portate su GitHub a lotti; chiave cifrata con il PIN,
  cambio PIN, blocco tolto; senza rete.
- `prova3.mjs` (11 verifiche): impronta con un autenticatore virtuale con e senza PRF; trascinamento.
- `prova5.mjs` (34 verifiche): backup di Bear costruito ad arte — conteggi della finestra, cestino,
  aggiornamento di una nota già presente, a capo, copie identiche, date (anche incoerenti), codice e
  LaTeX esatti, evidenziato, immagini (anche di Bear 1 e non citate), editor, secondo dispositivo,
  reimportazione senza doppioni né nomi cambiati.
- `prova6.mjs` (7 verifiche): spazio fra i capoversi — il testo non cambia, cambia solo l'aspetto.
- `prova7.mjs` (67 verifiche): cartelle dei mesi — anni e conteggi, mese di nascita e non di modifica,
  ordine interno, puntine, freccia, indietro e avanti del browser, ricarica, nota nuova nella cartella
  del suo mese, repository invariato, ricerca, elenco unico; notte, giorno e tema del sistema; sfondi
  pastello e quadretti; spaziatura fissa nell'editor e sul foglietto, carattere incluso, tasto M e
  Markdown risultante; macchie (presenti ma non ovunque, sotto il testo, stabili, uguali su due
  dispositivi); movimenti di puntina ed eliminazione, curva a molla, «riduci movimento»; telefono.

- `prova8.mjs` (65 verifiche): il diario alimentare, con un diario inventato (`diario-finto.mjs`) —
  cartella fissa (posizione, ricerca, bacheca unica, impostazione); file rifiutato se non è un diario;
  cockpit (giorni letti, medie e deficit contro i dati di partenza, barre e loro stati, soglia e
  dispendio, periodo, fumetto, peso, misure, tabella); calendario e giorno (strumento, pasti, obiettivi,
  bilancio, note, frecce, tocco sul grafico, tastiera, giorno in surplus); navigazione (freccia, avanti,
  ricarica, Esc); repository (file identico in `diario/`, note intatte, messaggio del commit, nessun
  commit per lo stesso file, secondo dispositivo, aggiornamento dal telefono, note che continuano a
  salvarsi, file messo da fuori); file ricordato (profilo vero del browser); sola lettura (file identico dopo l'uso, nessun permesso di
  scrittura chiesto, nessuna API di scrittura nel sorgente, nessun campo nel cockpit); copia su GitHub
  esclusa e rimessa; file ostile; notte; stampa.

Le prove 1–6 guardano la bacheca «tutte insieme» (`piatta()` in `lib.mjs`); la 7 le cartelle.
- `prova4.mjs` (17 verifiche): la puntina — ordine in bacheca, ricerca, indice del repository, secondo
  dispositivo, modifica di una nota fissata, puntina tolta dall'editor, copia, uso senza GitHub.
  Con `FOTO=1` salva anche le immagini della bacheca.

Per usare un Chrome già installato: `CHROME=/percorso/di/chrome node prova1.mjs`.

**Ciò che il collaudo automatico non copre**: il vero GitHub (le risposte simulate seguono la
documentazione), la creazione della chiave sul sito, l'impronta sui dispositivi reali (Touch ID,
Face ID, Android), la tastiera di iOS e l'incolla nel proprio WordPress.

## Aggiornare

Sostituisci i file su GitHub. A ogni rilascio cambia la costante `CACHE` in `sw.js` e `VERSIONE` in
`app.js`, e aggiungi una voce a `CHANGELOG.md`. Il service worker cancella solo le proprie cache
(`biawrite-…`): le altre pagine dello stesso sito non vengono toccate.
