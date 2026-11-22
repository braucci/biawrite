# Registro delle modifiche

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
