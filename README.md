# Project FornitoriContratti Core

Backend Node.js/Express per:

- upload di PDF di contratto;
- calcolo hash SHA-256 del documento;
- notarizzazione hash su IOTA Testnet;
- verifica notarizzazione tramite ID;
- endpoint Swagger per test rapidi API.

## Funzionalita principali

- Upload PDF via multipart/form-data (`/upload`)
- Calcolo SHA-256 del file caricato
- Notarizzazione hash su IOTA (`/api/notarize`)
- Verifica notarizzazione (`/api/verify/:notarizationId`)
- Stato wallet (`/api/wallet/status`)
- Richiesta fondi faucet (`/api/faucet/request`)
- Documentazione API Swagger (`/api-docs`)

## Requisiti

- Node.js 18+ (consigliato 20+)
- npm
- Connessione internet verso IOTA testnet e faucet

## Installazione

```bash
npm install
```

## Configurazione ambiente

1. Crea file `.env` partendo da `.env.example`:

```powershell
Copy-Item .env.example .env
```

2. Imposta almeno la variabile obbligatoria:

- `IOTA_MNEMONIC` (obbligatoria)

3. Opzionalmente personalizza:

- `PORT` (default `3000`)
- `IOTA_NODE_URL`
- `IOTA_DERIVATION_PATH`
- `IOTA_ACCOUNT_INDEX`
- `IOTA_MIN_BALANCE`
- `IOTA_DELETE_UNLOCK_SECONDS`
- `IOTA_EXPLORER_BASE_URL`
- `IOTA_FAUCET_URL`

## Avvio progetto

```bash
npm start
```

Server disponibile su:

- API base: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/api-docs`

## Script disponibili

- `npm start` - Avvia server Express
- `npm run smoke:notarization` - Esegue smoke test completo (wallet, faucet, upload, notarize, verify)

## API principali

### 1) Upload PDF

`POST /upload`

Body `multipart/form-data`:

- key: `pdf`
- value: file PDF

Esempio curl:

```bash
curl -F "pdf=@CONTRATTO%20DI%20FORNITURA.pdf" http://localhost:3000/upload
```

Risposta (esempio):

```json
{
  "message": "PDF uploaded successfully!",
  "filename": "1742480000000-CONTRATTO DI FORNITURA.pdf",
  "sha256": "..."
}
```

### 2) Stato wallet

`GET /api/wallet/status`

Restituisce address, balance, minimumBalance e `hasEnoughFunds`.

### 3) Richiesta faucet

`POST /api/faucet/request`

Richiede fondi testnet per il wallet backend.

### 4) Notarizzazione hash

`POST /api/notarize`

Body JSON:

```json
{
  "hash": "<sha256-64-char-hex>",
  "metadata": {
    "filename": "contract.pdf",
    "contractId": "CF-2026-001"
  }
}
```

Risposta include `notarizationId`, `transactionDigest`, `explorerUrl`.

### 5) Verifica notarizzazione

`GET /api/verify/:notarizationId`

Restituisce payload notarizzato e metadati di stato.

## Smoke test end-to-end

Il progetto include uno script che verifica il flusso completo.

Prerequisiti:

- server avviato (`npm start`)
- file test presente (`CONTRATTO DI FORNITURA.pdf` in root o in `uploads`)
- `.env` configurato

Esecuzione:

```bash
npm run smoke:notarization
```

## Flusso consigliato

1. Upload documento via `/upload`
2. Controllo fondi via `/api/wallet/status`
3. Se necessario, faucet via `/api/faucet/request`
4. Notarizzazione hash via `/api/notarize`
5. Verifica via `/api/verify/:notarizationId`

## Errori comuni

- `IOTA_MNEMONIC is missing in environment variables`
: imposta `IOTA_MNEMONIC` in `.env`.

- `Insufficient funds ...`
: richiama `/api/faucet/request` e riprova dopo conferma faucet.

- `hash must be a valid sha256 hex string (64 chars)`
: invia un hash SHA-256 valido in formato esadecimale.

## Sicurezza

- Non committare mai `.env` con mnemonic reali.
- Usa secret manager in ambienti condivisi/production.

## Stack tecnico

- Express
- Multer
- Swagger (`swagger-jsdoc`, `swagger-ui-express`)
- IOTA SDK (`@iota/iota-sdk`, `@iota/notarization`)
