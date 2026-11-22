# BiaWrite

Appunti e articoli scritti nel browser e conservati, come file `.md` o `.txt`, in un **repository
privato di GitHub**. Una bacheca di foglietti adesivi per ritrovarli, un foglio bianco per scriverli.
Nessun pulsante «Salva»: ciò che si scrive resta.

BiaWrite è una pagina statica: non ha un server, non ha un database, non costa nulla.
Si pubblica su GitHub Pages e parla soltanto con GitHub.

## Che cosa fa

- **Bacheca** di foglietti scritti a mano, ognuno attaccato a modo suo, con anteprima, colore e ricerca.
- **Editor** essenziale: grassetto, corsivo, sottolineato, allineamento (sinistra, centro, destra,
  giustificato), titoli, elenchi, citazioni, collegamenti. Oppure testo semplice, per i `.txt`.
- **Salvataggio automatico**: ogni modifica va subito nell'archivio del browser e, dopo tre secondi di
  pausa, nel repository. Senza rete si continua a scrivere; alla riconnessione parte tutto da sé.
- **Copia** con un tocco: tutta la nota negli appunti come testo formattato, pronta da incollare
  nell'editor di WordPress (o in una mail, in Word…).
- **Importazione** delle vecchie note: file `.md`, `.txt`, `.html`, cartelle intere, archivi `.zip`.
- **Blocco del dispositivo** con PIN e, dove il browser lo consente, impronta o volto. Con il blocco
  la chiave di GitHub è conservata cifrata.
- **Installabile** sulla schermata Home di telefono e tablet; si apre anche senza rete.

## Due repository

| Repository | Visibilità | Contiene |
|---|---|---|
| `braucci/biawrite` | pubblico | il programma: questa cartella. Nessuna nota, nessuna chiave |
| `braucci/biawrite-note` | **privato** | l'archivio: le note, nella cartella `note/` |

Il programma è come un client di posta: chiunque può aprirlo, ma vede soltanto l'archivio di cui ha
la chiave. Chi apre BiaWrite senza una chiave valida per il tuo repository privato non vede nulla;
chi scarica il repository pubblico ottiene solo il codice. Se un'altra persona usa la tua pagina con
il proprio repository e la propria chiave, le sue note vanno da lei: non c'è un server comune dove le
due cose possano incontrarsi.

## Messa in opera

### 1. Pubblicare l'app (una volta sola)

1. Crea il repository pubblico `biawrite` e trascina dentro tutti i file di questa cartella.
2. *Settings → Pages → Build and deployment*: sorgente **Deploy from a branch**, ramo `main`,
   cartella `/ (root)`.
3. Dopo un minuto l'app è a `https://braucci.github.io/biawrite/`.

### 2. Collegare un dispositivo

Apri l'indirizzo dell'app. La schermata di benvenuto ha due collegamenti che aprono GitHub con i
moduli già compilati.

1. **Crea il repository privato** (solo la prima volta, su un dispositivo qualunque): si apre la
   pagina di GitHub con nome `biawrite-note` e visibilità **Private** già impostati. Premi
   **Create repository**. Non serve aggiungere nulla.
2. **Crea la chiave**: si apre *New fine-grained personal access token* con nome, descrizione,
   scadenza e permesso già compilati. Restano due cose da fare:
   - alla voce **Repository access** scegli **Only select repositories** e seleziona `biawrite-note`;
   - controlla che in **Permissions → Repository permissions** la voce **Contents** sia
     **Read and write**.

   Premi **Generate token** e copia la chiave (comincia con `github_pat_`). **GitHub la mostra una
   volta sola.**
3. **Incolla la chiave** nell'app e premi **Collega GitHub**. BiaWrite controlla che il repository
   esista, che la chiave possa scriverci e che sia **privato**: se fosse pubblico rifiuta di usarlo.
4. Imposta il **PIN** quando te lo propone: da quel momento la chiave è conservata cifrata.

Se i collegamenti precompilati non funzionassero, la strada a mano è: foto del profilo →
*Settings* → *Developer settings* → *Personal access tokens* → *Fine-grained tokens* →
*Generate new token*.

**Una chiave per dispositivo.** Il collegamento propone un nome con il tipo di dispositivo e la data
(«BiaWrite iPhone 22-11-2026 09.40»). Così, se perdi il telefono, revochi solo la sua chiave da
*Fine-grained tokens* e gli altri dispositivi continuano a funzionare.

**Scadenza.** Il collegamento propone una chiave senza scadenza, perché altrimenti andrebbe
rinnovata a mano. Se preferisci, sceglierne una (per esempio un anno): quando scade, BiaWrite te lo
dice e ti chiede la nuova chiave, senza perdere nulla di ciò che hai scritto nel frattempo.

## Importare le vecchie note

Il pulsante con la freccia in basso, nella barra della bacheca (o *Impostazioni → Importa note*),
accetta:

- file `.md`, `.markdown`, `.txt`, `.html`, anche molti insieme;
- una **cartella** intera (sul computer);
- un archivio **`.zip`**: è il formato in cui quasi tutti i programmi di note esportano.

Sul computer si possono anche **trascinare** file e cartelle sulla bacheca.

Prima di importare, BiaWrite mostra quante note ha trovato, quali file ha saltato e perché
(immagini, PDF, file vuoti) e quali sono già presenti, così che reimportare lo stesso archivio non
crei doppioni. Ogni nota conserva il **nome del file** come titolo e la **data del file**: in bacheca
le vecchie note si mettono in ordine di tempo. Le pagine HTML diventano Markdown pulito; i vecchi file
di testo scritti su Windows sono letti con gli accenti giusti. A scelta, i `.txt` possono diventare
note formattabili.

Le immagini non vengono importate: se una vecchia nota ne richiamava, nel testo resta il richiamo.

## Incollare in WordPress

Il pulsante **Copia** mette negli appunti l'intera nota come testo formattato: grassetto, corsivo,
sottolineato, allineamenti, titoli, elenchi, citazioni e collegamenti. Nell'editor di WordPress basta
incollare. Anche selezionando una parte del testo e copiandola con i comandi consueti, negli appunti
finisce la stessa formattazione pulita, senza caratteri né colori di BiaWrite.

Quanta formattazione sopravvive dipende da chi riceve. L'editor classico di WordPress la conserva
tutta. L'editor a blocchi non prevede il testo giustificato e può scartare qualche attributo: se un
allineamento o un sottolineato non arrivano, si riapplicano lì con un clic.

## Da sapere

- **Il blocco.** Con il PIN la chiave di GitHub è cifrata (AES-GCM) e si decifra solo sbloccando;
  dopo cinque minuti in secondo piano BiaWrite si richiude e la chiave esce dalla memoria. L'impronta
  o il volto si possono usare solo se il browser sa derivarne una chiave di cifratura (estensione PRF
  di WebAuthn): se non ne è capace, BiaWrite lo dice e resta il PIN. La copia locale delle note invece
  non è cifrata. Il PIN non si recupera: si azzera l'app su quel dispositivo e si incolla di nuovo una
  chiave (le note su GitHub non si toccano).
- **Senza blocco** la chiave è conservata in chiaro nel browser: le impostazioni lo dicono.
- **Due dispositivi sulla stessa nota.** Se una nota viene modificata in due posti prima che si
  sincronizzino, non si perde nulla: l'altra versione viene salvata in una copia «(altra versione …)».
- **Eliminare** toglie il file dal repository; una copia resta nella cronologia di GitHub.
- **Lavorare dal sito di GitHub.** File caricati a mano nella cartella `note/` compaiono in bacheca;
  le rinomine fatte sul sito vengono seguite. Il resto del repository (README e altre cartelle) è
  ignorato.
- **Cronologia.** Ogni salvataggio su GitHub è un commit con un messaggio leggibile («BiaWrite:
  modifica «Titolo»»): qualunque versione passata di una nota si ritrova da *History* sul sito.
- I file sono Markdown ordinario. Sottolineato e allineamenti, che il Markdown non prevede, sono
  scritti con piccoli tag HTML (`<u>`, `<p style="text-align:right">`), validi in ogni lettore Markdown.

## Collaudo

- `tests/test.html`, aperto nel browser, verifica il motore di conversione (39 prove).
- `tests/e2e/` contiene il collaudo dell'intera app con un GitHub simulato (87 verifiche);
  le istruzioni sono in `README-progetto.md`.

## Licenza

MIT © B. Raucci. Il carattere Kalam dei foglietti è distribuito con licenza SIL Open Font
(`fonts/OFL.txt`).
