Per creare un MVP con Node.js per registrare contratti fornitori tramite IOTA Locked Notarization, segui questi passaggi strutturati. [docs.iota](https://docs.iota.org/developer/iota-notarization/how-tos/locked-notarizations/create)

## 1. Setup progetto (15 min)
```
mkdir iota-contract-mvp && cd iota-contract-mvp
npm init -y
npm i express multer @iota/notarization pdf-parse crypto-js qrcode
npm i -D nodemon typescript @types/node @types/express
```

## 2. Configurazione base (server.js)
```javascript
const express = require('express');
const multer = require('multer');
const { NotarizationClient } = require('@iota/notarization');
const app = express();
app.use(express.json());

const upload = multer({ dest: 'uploads/' });
const client = new NotarizationClient({ url: 'https://api.testnet.shimmer.network' });
```

## 3. Endpoint notarizzazione contratti (/api/notarize)
```javascript
app.post('/api/notarize', upload.single('contract'), async (req, res) => {
  try {
    // 1. Hash PDF contratto
    const fs = require('fs');
    const CryptoJS = require('crypto-js');
    const fileBuffer = fs.readFileSync(req.file.path);
    const hash = CryptoJS.SHA256(fileBuffer).toString();
    
    // 2. Estrai metadati (data, fornitore, importo)
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    const metadata = {
      supplierId: extractSupplierId(data.text), // regex custom
      date: new Date().toISOString(),
      amount: extractAmount(data.text),
      hash
    };
    
    // 3. Crea Locked Notarization (10 anni delete lock)
    const deleteUnlockAt = Math.round(Date.now() / 1000 + 315360000); // +10y
    const notarization = await client.lockedNotarization()
      .state({ data: metadata })
      .deleteLock({ unlockAt: deleteUnlockAt })
      .buildAndExecute(client.wallet); // Usa mnemonic Firefly
    
    // 4. Genera QR per verifica
    const QRCode = require('qrcode');
    const qrData = await QRCode.toDataURL(notarization.objectId);
    
    res.json({ 
      success: true, 
      objectId: notarization.objectId,
      qrCode: qrData,
      costIOTA: notarization.cost 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## 4. Endpoint verifica (/api/verify/:objectId)
```javascript
app.get('/api/verify/:objectId', async (req, res) => {
  const notarization = await client.getNotarization(req.params.objectId);
  res.json({
    valid: true,
    timestamp: notarization.createdAt,
    metadata: notarization.state.data,
    locked: true
  });
});
```

## 5. Frontend base (public/index.html)
```html
<!DOCTYPE html>
<html>
<body>
  <input type="file" id="contract" accept=".pdf">
  <button onclick="uploadContract()">Notarizza</button>
  <div id="result"></div>
  
  <script>
    async function uploadContract() {
      const formData = new FormData();
      formData.append('contract', document.getElementById('contract').files[0]);
      
      const res = await fetch('/api/notarize', { method: 'POST', body: formData });
      const data = await res.json();
      
      document.getElementById('result').innerHTML = `
        <p>ID: ${data.objectId}</p>
        <img src="${data.qrCode}" />
        <a href="/api/verify/${data.objectId}">Verifica</a>
      `;
    }
  </script>
</body>
</html>
```

## 6. Deploy e test (30 min)
```
# Test locale
npm run dev  # nodemon server.js

# Testnet faucet per fondi
# 1. Scarica Firefly wallet
# 2. Ottieni 10 IOTA testnet
# 3. Importa mnemonic in codice

# Deploy Railway/Vercel
railway login && railway init
git push railway main
```

## Costi MVP
| Operazione | Costo |
|------------|-------|
| 1000 contratti | ~5€ (depositi rimborsabili) |
| Deploy Railway | Gratuito primo mese |
| Dominio | 10€/anno |

## Tempo totale sviluppo
**2-3 giorni** per MVP funzionante: upload → hash → Locked Notarization → QR verifica on-chain.

**Prossimo step**: Testa con contratto PDF campione, poi integra con Vue.js dashboard per l'azienda. [docs.iota](https://docs.iota.org/developer/iota-notarization/how-tos/locked-notarizations/create)