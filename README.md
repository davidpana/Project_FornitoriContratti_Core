npm install
npm start

# Project_FornitoriContratti_Core

Node.js backend project for FornitoriContratti Core.

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```
2. Run the project:
   ```
   npm start
   ```

## API Endpoints

### POST /upload

Upload a PDF file via multipart/form-data.

**Request:**
  - Method: POST
  - URL: `http://localhost:3000/upload`
  - Body: Form-data with key `pdf` and the PDF file as value

**Response:**
  - 200 OK: `{ message: 'PDF uploaded successfully!', filename: '<saved-filename>' }`
  - 400 Bad Request: `{ error: 'No file uploaded or file is not a PDF.' }`

**Example using curl:**
```sh
curl -F "pdf=@yourfile.pdf" http://localhost:3000/upload
```

## IOTA Testnet Notarization Setup

1. Copy [.env.example](.env.example) to .env and set your mnemonic:
  ```
  copy .env.example .env
  ```
2. Set IOTA testnet values in .env:
  - IOTA_NODE_URL
  - IOTA_MNEMONIC
  - IOTA_FAUCET_URL
3. Start the API:
  ```
  npm start
  ```

## New Endpoints

### GET /api/wallet/status

Returns wallet address, current balance and if minimum funds are available.

### POST /api/faucet/request

Requests testnet funds for the backend wallet.
- If IOTA_FAUCET_URL is configured, it performs an automatic POST.
- If IOTA_FAUCET_URL is empty, it returns wallet address and manual instructions.

### POST /api/notarize

Stores the SHA-256 hash on IOTA testnet using locked notarization.

Request body example:
```json
{
  "hash": "<64-char-sha256-hex>",
  "metadata": {
   "filename": "contract.pdf",
   "contractId": "CF-2026-001"
  }
}
```

Response includes messageId and explorer URL.

Response includes notarizationId, transactionDigest and explorer URL.

### GET /api/verify/:notarizationId

Reads back the anchored payload from IOTA testnet and returns parsed content.

## Suggested End-to-End Flow

1. Upload document via /upload and read sha256 from response.
2. Call /api/wallet/status.
3. If no funds, call /api/faucet/request and wait faucet confirmation.
4. Call /api/notarize with hash from step 1.
5. Call /api/verify/:notarizationId to validate persistence on testnet.
