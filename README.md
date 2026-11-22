# BiaWrite

Appunti e articoli scritti nel browser e conservati, come file `.md` o `.txt`, in un **repository
privato di GitHub**. Una bacheca di foglietti adesivi per ritrovarli, un foglio bianco per scriverli.
Nessun pulsante «Salva»: ciò che si scrive resta.

BiaWrite è una pagina statica: non ha un server, non ha un database, non costa nulla.
Si pubblica su GitHub Pages e parla soltanto con GitHub.

## Che cosa fa

- **Bacheca** di foglietti scritti a mano, ognuno attaccato a modo suo, con anteprima, colore e ricerca.
  Le note sono raccolte in **cartelle, una per mese**, divise per anno; quelle con la **puntina** stanno
  anche nella cartella «Fissate», in testa, su tutti i dispositivi. I foglietti hanno quattro formati
  (striscia, foglietto, scheda, tabulato) e qualcuno porta l'alone di una tazza, come quelli veri.
- **Giorno e notte**: tema chiaro, scuro o come il dispositivo; tavolo color pastello (salvia, cielo,
  cipria, lavanda, menta) o, per chi li preferisce, i quadretti.
- **Editor** essenziale: grassetto, corsivo, sottolineato, allineamento (sinistra, centro, destra,
  giustificato), titoli, elenchi, citazioni, collegamenti, blocchi a spaziatura fissa. Oppure testo
  semplice, per i `.txt`, scritto a **spaziatura fissa** (IBM Plex Mono) come su una macchina da scrivere.
- **Salvataggio automatico**: ogni modifica va subito nell'archivio del browser e, dopo tre secondi di
  pausa, nel repository. Senza rete si continua a scrivere; alla riconnessione parte tutto da sé.
- **Copia** con un tocco: tutta la nota negli appunti come testo formattato, pronta da incollare
  nell'editor di WordPress (o in una mail, in Word…).
- **Importazione** delle vecchie note: file `.md`, `.txt`, `.html`, cartelle intere, archivi `.zip` e
  **backup di Bear** (`.bear2bk`), con date, puntine e immagini.
- **Plancia**: in testa alla bacheca la data, il **meteo** della località scelta (icone chiare, prossime
  ore, domani) e il pulsante del diario.
- **Due stili**: *scrivania* (carta, cartelle come nel Finder, riquadri smerigliati) e *terminale*
  (tutto a spaziatura fissa, cartelle elencate come da `ls -l`), ciascuno di giorno e di notte.
- **Diario alimentare** (modulo facoltativo): un pulsante della plancia che si apre su un
  cockpit — calorie nel tempo, peso, indicatori, calendario e dettaglio di ogni giorno — ricavato dal
  file `diario-alimentare.md`, che non viene mai modificato.
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

Dai file sciolti le immagini non vengono importate: se una vecchia nota ne richiamava, nel testo resta il
richiamo. Dai backup di Bear invece arrivano, con il testo che le cita (vedi sotto).

## Importare da Bear

In Bear: *File → Backup Notes…* (sul Mac) produce un file `.bear2bk`. Lo stesso pulsante di
importazione di BiaWrite lo riconosce e mostra quante note contiene, quante con la puntina, quante
immagini. Conviene farlo dal computer e lasciare BiaWrite aperta finché lo stato dice «Su GitHub».

Che cosa arriva, e come:

| In Bear | In BiaWrite |
|---|---|
| il testo | identico riga per riga: si aggiungono solo spazi a fine riga e righe vuote fra blocchi diversi |
| ogni a capo va a capo | a capo veri (nel Markdown due righe consecutive si fonderebbero); le righe vuote restano capoversi |
| il titolo è la prima riga | idem: titolo automatico dalla prima riga, che cambia se cambi la prima riga |
| date di creazione e di modifica | conservate (nell'indice del repository), anche quando in Bear sono incoerenti |
| puntina | puntina |
| `==evidenziato==` | evidenziato |
| immagini e allegati | nel repository, in `note/allegati/<nota>/`, identici; si vedono nell'editor e sul sito di GitHub |
| vecchie immagini di Bear 1 `[image:…/nome.jpg]` | immagini Markdown che puntano al file giusto |
| allegati che la nota non cita | citati in fondo alla nota, perché restino visibili |
| note di codice o con formule LaTeX | testo esatto, carattere per carattere (rientri, barre rovesce, asterischi) |
| copie identiche di una stessa nota | importate tutte: in Bear erano note distinte |
| cestino | escluso, salvo diversa scelta |
| note vuote | saltate, e la finestra lo dice |

Ogni nota ricorda da quale nota di Bear viene. Se reimporti lo stesso backup, le note già importate
non si duplicano; quelle che nel frattempo hai modificato in BiaWrite restano come sono. Una nota già
presente con lo stesso testo (per esempio importata prima come `.txt`) viene aggiornata alla versione
di Bear, se lasci spuntata la casella relativa.

## Il diario alimentare

Sulla plancia c'è il pulsante **Diario alimentare**. La prima volta chiede il file
`diario-alimentare.md`; da lì in poi mostra:

- **Calorie**: una barra per giorno, con la linea della soglia e quella del dispendio stimato; dopo
  qualche giorno anche la media mobile su 7 giorni. Periodo a scelta: 30 giorni, 90, tutto.
- **Peso**: ultimo valore, variazione dall'inizio, percorso verso l'obiettivo, BMI, chili da perdere,
  data d'arrivo al ritmo del piano e al ritmo del deficit medio, grafico con la linea del piano, misure
  registrate (peso, vita, collo).
- **In sintesi** (sui soli giorni chiusi): media giornaliera, deficit medio e accumulato con
  l'equivalente teorico in grasso, giorni entro la soglia, proteine e fibra medie rispetto
  all'obiettivo, passi, quota di energia da proteine, carboidrati e grassi.
- **Calendario**: si scelgono i giorni registrati; il segno dice com'è andata (● entro la soglia,
  ▲ oltre, ○ in corso).
- **Il giorno**: lo strumento a lancetta delle calorie rispetto a soglia e dispendio, proteine e fibra
  rispetto all'obiettivo, bilancio stimato, passi, acqua, pasti con ora, alimenti, quantità e calorie
  (l'asterisco segna le stime), note del giorno per intero.
- **Scheda**: le sezioni generali del diario (dati di riferimento, attività, monitoraggio, prodotti).

**Sola lettura.** BiaWrite non può modificare il diario, e non per semplice scelta di interfaccia:
il file viene aperto o con il campo di scelta dei file (che consegna al browser una copia in sola
lettura) o con il permesso di sola lettura del browser; il permesso di scrittura non viene mai
chiesto, quindi è il browser stesso a impedire ogni modifica. Nel cockpit non c'è alcun campo in cui
scrivere: si può soltanto rileggere il file e scegliere periodo, mese e giorno.

**Rileggere.** Il diario si scrive altrove; BiaWrite lo legge. «Leggi il file» fa scegliere il
file (su iPhone e iPad: *Scegli file → iCloud Drive*). In Chrome e in Edge, sul computer, il file
scelto viene ricordato: da allora il diario si rilegge da solo ogni volta che si apre la cartella o si
torna sulla scheda, e il pulsante diventa «Rileggi il file». Safari e Firefox non lo consentono: lì si
sceglie il file ogni volta. Nell'app per Mac (progetto `biawrite-mac`) il file viene seguito dal sistema e il
diario si aggiorna da solo a ogni modifica. Basta farlo su un dispositivo: con GitHub collegato il diario sale nel
repository privato (`diario/diario-alimentare.md`, fuori dalla cartella delle note) e gli altri
dispositivi lo ricevono alla prima sincronizzazione. Vale anche il contrario: un file messo in quella
posizione dal sito di GitHub o da un altro programma arriva nell'app. Quella nel repository è una
copia identica di ciò che è stato letto, non il diario: il file d'origine non riceve mai nulla
indietro. Chi non vuole nemmeno la copia sceglie *Impostazioni → Aspetto → Diario: solo su questo
dispositivo*; allora il diario si legge su ogni dispositivo dal file.

**Riservatezza.** Il diario non entra mai nel repository pubblico dell'app: sta sul dispositivo e nel
repository privato delle note. Come le note, la copia locale non è cifrata.

**Che cosa serve nel file.** Il lettore cerca la struttura, non la forma esatta:

- un giorno è un titolo che comincia con una data (`### 22 novembre 2026`, anche `22/11/2026`), meglio
  se seguito da stato e totale: `— GIORNATA CHIUSA: 1571 kcal (soglia 1800, …)` oppure
  `— IN CORSO: progressivo ≈ 318 kcal (…)`;
- un pasto è un sottotitolo (`##### Pranzo (≈ 13:00)`) seguito da una tabella con una colonna `kcal`;
  la riga `Totale` è facoltativa;
- i macronutrienti si leggono da frasi come `carboidrati ≈ 54 g, proteine ≈ 13 g, grassi ≈ 5 g,
  fibra ≈ 7 g`, nel riepilogo del giorno e sotto ogni pasto;
- statura, peso, peso obiettivo, ritmo, BMR, TDEE, target e proteine dalla sezione
  `## Dati di riferimento (gg/mm/aaaa)`;
- le **misure**: una riga `Peso: 107,4 kg` (anche `Circonferenza vita: 104 cm`, `collo 42 cm`) nel
  giorno della pesata, oppure una tabella con le colonne `Data`, `Peso`, `Vita`, `Collo`;
- `Passi del giorno …: ≈ 3900` e `Acqua: 500 ml …` nel giorno.

Se i conti del file non tornano (le righe di un pasto non danno il totale scritto), BiaWrite lo
segnala in alto, senza fermarsi. Il pulsante si può togliere da *Impostazioni → Aspetto*.

## Aspetto, plancia e meteo

**Plancia.** Sopra la bacheca (non dentro le cartelle né durante la ricerca) tre riquadri: la data con
il conto delle note, il meteo, il diario alimentare.

**Meteo.** In *Impostazioni → Meteo* si cerca la località per nome, oppure si usa la posizione del
dispositivo. Il riquadro mostra il tempo di adesso con un'icona, la temperatura, minima e massima,
probabilità di pioggia, vento, le prossime ore a passi di tre e domani. I dati sono di
[Open-Meteo](https://open-meteo.com/) (licenza CC BY 4.0), senza chiave: al servizio vanno solo le
coordinate della località, arrotondate al centesimo di grado (circa un chilometro). Finché non si
sceglie una località non parte alcuna richiesta. Il meteo si rinnova al più ogni mezz'ora; senza rete
resta l'ultimo, con l'ora a cui risale. «Nessun meteo» lo spegne.

**Cartelle.** Icone piccole con il nome sotto, come nel Finder; i pallini accanto al nome sono i colori
delle note che contengono. La prima, gialla e con la puntina, è **Fissate**: raccoglie le note con la
puntina, che restano anche nella cartella del loro mese.

**Foglietti in quattro formati**, scelti dal contenuto e quindi uguali su ogni dispositivo:

| Formato | Quando | Aspetto |
|---|---|---|
| striscia | una riga o due, meno di 90 caratteri | foglietto basso, scritto grande |
| foglietto | il caso comune | adesivo quasi quadrato, scritto a mano |
| scheda | più di 650 caratteri o di 14 righe | cartoncino da schedario a righe, largo il doppio; il colore è la costola |
| tabulato | le note `.txt` | modulo continuo a bande verdi, a spaziatura fissa; il colore è il bordo in alto |

**Stile terminale.** In *Impostazioni → Aspetto → Stile*. Nasce scuro («come il dispositivo» lì vuol
dire notte); con «Sempre giorno» diventa carta e inchiostro. Le note sono riquadri dritti con il colore
sul bordo sinistro, le cartelle righe di un elenco, i riquadri della plancia hanno la loro etichetta.
Vale per tutta l'app: editor, impostazioni, diario.

## Scrivere sul telefono

Quando la tastiera è aperta lo schermo utile si riduce a poche righe. Allora la barra in alto (stato,
Copia, menu) si ritira e restano solo gli strumenti di scrittura, un poco più bassi; tornano com'erano
appena la tastiera si chiude (✓ su iPhone, «indietro» su Android). La riga che si sta scrivendo resta
sempre sopra la fascia in fondo allo schermo dove iOS appoggia la sua capsula ˄ ˅ ✓.

Quella capsula, e la riga dei suggerimenti sotto di essa, appartengono alla tastiera dell'iPhone: una
pagina web non le può togliere (le frecce passano da un campo all'altro, ✓ chiude la tastiera). Se nella
riga dei suggerimenti compaiono gli indirizzi dei contatti («casa», «ufficio»), si spengono da
*Impostazioni → App → Safari → Riempimento automatico → Usa informazioni contatto*; l'intera riga dei
suggerimenti da *Impostazioni → Generali → Tastiera → Predittiva*, se si rinuncia ai suggerimenti di parola.

## Sul Mac

BiaWrite esiste anche come app per Mac: progetto [`biawrite-mac`](https://github.com/braucci/biawrite-mac).
È questa stessa webapp in una finestra propria, con i menu del Mac, gli appunti del sistema per
WordPress e il diario alimentare seguito da sé; le note restano nel repository privato di GitHub e la
webapp si aggiorna da questo sito. Nella pagina formattata ⌘B, ⌘I e ⌘U (Ctrl su Windows e Linux)
mettono grassetto, corsivo e sottolineato.

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
- **Le cartelle dei mesi.** Una nota sta nella cartella del mese in cui è nata, e lì resta anche quando
  la si ritocca: le cartelle non si svuotano e non si riempiono da sole. Dentro, le note vanno dalla più
  recente alla più vecchia per data di nascita (la data sul foglietto è quella). Una nota nuova, appena
  chiusa, porta nella cartella del mese corrente. La freccia in alto, o il tasto «indietro» del telefono,
  riporta alla radice; la ricerca guarda in tutte le cartelle insieme. Le cartelle sono solo un modo di
  guardare: nel repository le note restano tutte in `note/`, come prima. Chi preferisce l'elenco unico
  lo sceglie in *Impostazioni → Aspetto*.
- **Spaziatura fissa.** Di serie le note `.txt` (codice, formule, tabelle allineate a spazi) si scrivono
  e si vedono in IBM Plex Mono, le `.md` nel carattere normale; in *Impostazioni → Scrittura* si può
  scegliere la spaziatura fissa per tutte le note o per nessuna. Dentro una nota `.md`, il tasto **M**
  della barra trasforma il capoverso in un blocco a spaziatura fissa (nel file, un blocco di codice
  Markdown); premuto di nuovo, lo riporta normale.
- **Macchie e pieghe** sono solo un disegno: dipendono dalla data di nascita della nota, quindi lo stesso
  foglietto ha lo stesso aspetto su ogni dispositivo, e non toccano il testo. Con «riduci movimento»
  attivo nel sistema, BiaWrite rinuncia a tutte le animazioni.
- **Due dispositivi sulla stessa nota.** Se una nota viene modificata in due posti prima che si
  sincronizzino, non si perde nulla: l'altra versione viene salvata in una copia «(altra versione …)».
- **Capoversi.** Ogni Invio apre un capoverso: così arriva in WordPress. Quanto si vedono staccati
  nell'editor si sceglie in *Impostazioni → Scrittura* (appena staccati, senza spazio, con rientro, ben
  staccati). Per andare a capo dentro lo stesso capoverso, come in una poesia, si usa Maiuscolo+Invio.
- **La puntina** si mette e si toglie dal menu del foglietto (⋮) o della nota aperta: «Fissa in alto».
  Le note fissate stanno in testa, fra loro in ordine di data; fissare non cambia la data della nota.
- **Eliminare** toglie il file dal repository; una copia resta nella cronologia di GitHub.
- **Lavorare dal sito di GitHub.** File caricati a mano nella cartella `note/` compaiono in bacheca;
  le rinomine fatte sul sito vengono seguite. Il resto del repository (README e altre cartelle) è
  ignorato.
- **Cronologia.** Ogni salvataggio su GitHub è un commit con un messaggio leggibile («BiaWrite:
  modifica «Titolo»»): qualunque versione passata di una nota si ritrova da *History* sul sito.
- I file sono Markdown ordinario. Sottolineato e allineamenti, che il Markdown non prevede, sono
  scritti con piccoli tag HTML (`<u>`, `<p style="text-align:right">`), validi in ogni lettore Markdown.

## Collaudo

- `tests/test.html`, aperto nel browser, verifica il motore di conversione (42 prove);
  `tests/test-diario.html` il lettore del diario alimentare (34 prove).
- `tests/e2e/` contiene il collaudo dell'intera app con un GitHub simulato (364 verifiche);
  le istruzioni sono in `README-progetto.md`.

## Licenza

MIT © B. Raucci. I caratteri Kalam (foglietti) e IBM Plex Mono (spaziatura fissa) sono distribuiti
con licenza SIL Open Font (`fonts/OFL-Kalam.txt`, `fonts/OFL-IBM-Plex-Mono.txt`).
