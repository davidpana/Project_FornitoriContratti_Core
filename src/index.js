
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const pdfParse = require('pdf-parse');
const {
	notarizeHash,
	verifyNotarization,
	requestFaucetFunding,
	getWalletStatus,
} = require('./services/iotaNotarizationService');

const app = express();
app.use(cors()); // enable CORS for all routes (adjust options in production)
app.use(express.json());
const port = process.env.PORT || 3000;
// Swagger setup
const swaggerOptions = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'Project_FornitoriContratti_Core API',
			version: '1.0.0',
			description: 'API for uploading PDF files',
		},
		servers: [
			{
				url: 'http://localhost:3000',
			},
		],
	},
	apis: [__filename],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// Set up multer for PDF uploads
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		const uploadDir = path.join(__dirname, '../uploads');
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir);
		}
		cb(null, uploadDir);
	},
	filename: function (req, file, cb) {
		cb(null, Date.now() + '-' + file.originalname);
	}
});

const upload = multer({
	storage: storage,
	fileFilter: function (req, file, cb) {
		if (file.mimetype !== 'application/pdf') {
			return cb(new Error('Only PDF files are allowed!'));
		}
		cb(null, true);
	}
});

app.get('/', (req, res) => {
	res.json({
		service: 'Project_FornitoriContratti_Core API',
		status: 'ok',
		docs: '/api-docs',
	});
});

app.get('/health', (req, res) => {
	res.json({ status: 'ok' });
});


/**
 * @openapi
 * /upload:
 *   post:
 *     summary: Upload a PDF file
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdf:
 *                 type: string
 *                 format: binary
 *                 description: The PDF file to upload
 *     responses:
 *       200:
 *         description: PDF uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 filename:
 *                   type: string
 *       400:
 *         description: No file uploaded or file is not a PDF
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
app.post('/upload', upload.single('pdf'), async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: 'No file uploaded or file is not a PDF.' });
	}
	const filePath = req.file.path;
	const crypto = require('crypto');
	const fileBuffer = fs.readFileSync(filePath);
	const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
	// Log per debug
	console.log('fileBuffer.length:', fileBuffer.length);
	console.log('req.file.mimetype:', req.file.mimetype);

		// 2. Estrai metadati (data, fornitore, importo)
		if (!fileBuffer || fileBuffer.length === 0) {
			return res.status(400).json({ error: 'Uploaded file is empty.' });
		}
		 // Questo FUNZIONA col tuo PDF
    //const data = await pdfParse(fileBuffer);
    //console.log(data.text); // Vedrai tutto il testo estratto
    
    // Estrazione metadati specifica per il tuo PDF
    //const text = data.text.toLowerCase();

		const metadata = {
			contractId: 'CF-2026-001',
			supplierId: 'SUP001',
			supplierName: 'TechSupply Srl',
			amount: '125000',
			hash
		};
	res.json({
		message: 'PDF uploaded successfully!',
		filename: req.file.filename,
		sha256: hash,
		//metadata: metadata
	});
});

/**
 * @openapi
 * /api/notarize:
 *   post:
 *     summary: Notarize a SHA-256 hash on IOTA testnet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - hash
 *             properties:
 *               hash:
 *                 type: string
 *                 description: SHA-256 hash (64 hex chars)
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Optional metadata linked to the hash
 *     responses:
 *       200:
 *         description: Hash notarized successfully
 *       400:
 *         description: Invalid input
 *       402:
 *         description: Wallet has insufficient funds, use faucet
 *       500:
 *         description: Unexpected server error
 */
app.post('/api/notarize', async (req, res) => {
	try {
		const { hash, metadata } = req.body || {};
		if (!hash) {
			return res.status(400).json({ error: 'hash is required' });
		}

		const result = await notarizeHash({ hash, metadata: metadata || {} });
		res.json({
			success: true,
			...result,
		});
	} catch (error) {
		if (error.code === 'INSUFFICIENT_FUNDS') {
			return res.status(402).json({
				error: error.message,
				wallet: error.walletStatus,
				nextStep: 'Call POST /api/faucet/request or request funds manually from testnet faucet.',
			});
		}
		if (error.message && error.message.includes('sha256')) {
			return res.status(400).json({ error: error.message });
		}
		res.status(500).json({ error: error.message || 'Failed to notarize hash' });
	}
});

/**
 * @openapi
 * /api/verify/{notarizationId}:
 *   get:
 *     summary: Verify hash notarization from IOTA testnet
 *     parameters:
 *       - in: path
 *         name: notarizationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification result
 *       404:
 *         description: Notarization not found
 */
app.get('/api/verify/:notarizationId', async (req, res) => {
	try {
		const result = await verifyNotarization(req.params.notarizationId);
		if (!result.found) {
			return res.status(404).json(result);
		}
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: error.message || 'Failed to verify notarization' });
	}
});

/**
 * @openapi
 * /api/wallet/status:
 *   get:
 *     summary: Get IOTA testnet wallet status used for notarization
 *     responses:
 *       200:
 *         description: Wallet info and current balance
 */
app.get('/api/wallet/status', async (req, res) => {
	try {
		const status = await getWalletStatus();
		res.json(status);
	} catch (error) {
		res.status(500).json({ error: error.message || 'Failed to read wallet status' });
	}
});

/**
 * @openapi
 * /api/faucet/request:
 *   post:
 *     summary: Request testnet funds from faucet for the notarization wallet
 *     responses:
 *       200:
 *         description: Faucet request submitted or manual instructions returned
 */
app.post('/api/faucet/request', async (req, res) => {
	try {
		const faucetResult = await requestFaucetFunding();
		res.json(faucetResult);
	} catch (error) {
		res.status(500).json({ error: error.message || 'Failed to request faucet funding' });
	}
});


app.listen(port, () => {
	// Funzioni di estrazione base
	function extractSupplierId(text) {
		// Esempio: cerca un codice fornitore tipo "Fornitore: 12345"
		const match = text.match(/Fornitore:\s*(\d+)/);
		return match ? match[1] : null;
	}

	function extractAmount(text) {
		// Esempio: cerca importo tipo "Importo: 1234.56"
		const match = text.match(/Importo:\s*([\d,.]+)/);
		return match ? match[1] : null;
	}
	console.log(`API server listening on port ${port}`);
	console.log(`Swagger UI available at http://localhost:${port}/api-docs`);
});
