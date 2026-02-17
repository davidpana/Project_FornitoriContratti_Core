
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const pdfParse = require('pdf-parse');

const app = express();
app.use(cors()); // enable CORS for all routes (adjust options in production)
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
