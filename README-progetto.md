# BiaWrite — note tecniche

## Struttura

| File | Ruolo |
|---|---|
| `index.html` | struttura della pagina e fogli di stile |
| `core.js` | **motore**: HTML dell'editor ⇄ Markdown, sanificazione, esportazioni. Nessuna rete, nessuna interfaccia |
| `archivio.js` | **archivio**: lettura e scrittura del repository GitHub (API REST «Git Database»). Nessuna interfaccia |
| `importa.js` | **importazione**: lettura di file, cartelle e archivi `.zip`, decodifica dei testi. Nessuna interfaccia |
| `app.js` | **applicazione**: bacheca, editor, archivio locale, sincronizzazione, blocco, importazione |
| `config.js` | nome proposto per il repository delle note e cartella; **nessun segreto** |
| `sw.js` | service worker: cache dei file dell'app per l'uso senza rete |
| `manifest.webmanifest`, `icon*` | installazione sulla schermata Home |
| `fonts/` | carattere a mano dei foglietti (Kalam, licenza SIL OFL, inclusa) |
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
    └── Lista della spesa.txt
```

Il titolo di una nota è il nome del suo file. Colore, «titolo automatico» (preso dalla prima riga)
e data di modifica stanno nell'indice, così il contenuto dei file resta testo puro:

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

## Collaudo

**Motore** — apri `tests/test.html`: 39 prove.

**Applicazione** — in `tests/e2e/`, con Node e Playwright:

```sh
cd tests/e2e
npm install playwright && npx playwright install chromium
node prova1.mjs && node prova2.mjs && node prova3.mjs
```

`lib.mjs` contiene un **GitHub simulato** (oggetti git in memoria, ramo con controllo di avanzamento,
chiavi valide, cieche, di sola lettura o revocate, repository vuoto, privato o pubblico) e un piccolo
scrittore di archivi zip.

- `prova1.mjs` (44 verifiche): link precompilati; errori di collegamento; repository vuoto; nota al
  volo; numero di commit durante una scrittura lunga; rinomina in un commit; copia; secondo
  dispositivo; conflitto; colori; eliminazione; modifiche fatte dal sito; chiave revocata e
  sostituita; nomi uguali; repository diventato pubblico.
- `prova2.mjs` (32 verifiche): uso senza GitHub e senza rete; importazione (zip, testo Windows,
  HTML, doppioni, file saltati, date); 207 note portate su GitHub a lotti; chiave cifrata con il PIN,
  cambio PIN, blocco tolto; senza rete.
- `prova3.mjs` (11 verifiche): impronta con un autenticatore virtuale con e senza PRF; trascinamento.

Per usare un Chrome già installato: `CHROME=/percorso/di/chrome node prova1.mjs`.

**Ciò che il collaudo automatico non copre**: il vero GitHub (le risposte simulate seguono la
documentazione), la creazione della chiave sul sito, l'impronta sui dispositivi reali (Touch ID,
Face ID, Android), la tastiera di iOS e l'incolla nel proprio WordPress.

## Aggiornare

Sostituisci i file su GitHub. A ogni rilascio cambia la costante `CACHE` in `sw.js` e `VERSIONE` in
`app.js`, e aggiungi una voce a `CHANGELOG.md`. Il service worker cancella solo le proprie cache
(`biawrite-…`): le altre pagine dello stesso sito non vengono toccate.
