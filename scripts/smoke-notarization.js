require('dotenv').config();

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

function logStep(step, data) {
	console.log(`\n[${step}]`);
	if (data !== undefined) {
		console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
	}
}

async function parseBody(response) {
	const raw = await response.text();
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function getPdfPath() {
	const candidates = [
		path.join(process.cwd(), 'CONTRATTO DI FORNITURA.pdf'),
		path.join(process.cwd(), 'uploads', 'CONTRATTO DI FORNITURA.pdf'),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error('No test PDF found. Expected CONTRATTO DI FORNITURA.pdf in project root or uploads/.');
}

async function main() {
	logStep('CONFIG', {
		baseUrl: BASE_URL,
		nodeUrl: process.env.IOTA_NODE_URL,
		faucetUrl: process.env.IOTA_FAUCET_URL || '(empty)',
	});

	const walletRes = await fetch(`${BASE_URL}/api/wallet/status`);
	const walletBody = await parseBody(walletRes);
	logStep('WALLET STATUS', { status: walletRes.status, body: walletBody });

	if (!walletRes.ok && typeof walletBody?.error === 'string' && walletBody.error.toLowerCase().includes('mnemonic')) {
		throw new Error('Wallet status failed: invalid mnemonic configuration.');
	}

	if (!walletRes.ok) {
		throw new Error(`Wallet status failed with HTTP ${walletRes.status}`);
	}

	let wallet = walletBody;
	if (!wallet.hasEnoughFunds) {
		logStep('FAUCET REQUEST', 'Wallet has insufficient funds, requesting faucet...');
		const faucetRes = await fetch(`${BASE_URL}/api/faucet/request`, { method: 'POST' });
		const faucetBody = await parseBody(faucetRes);
		logStep('FAUCET RESPONSE', { status: faucetRes.status, body: faucetBody });
		if (!faucetRes.ok) {
			throw new Error(`Faucet request failed with HTTP ${faucetRes.status}`);
		}

		const retryRes = await fetch(`${BASE_URL}/api/wallet/status`);
		wallet = await parseBody(retryRes);
		logStep('WALLET RETRY', { status: retryRes.status, body: wallet });
	}

	const pdfPath = getPdfPath();
	const fileBuffer = fs.readFileSync(pdfPath);
	const form = new FormData();
	form.append('pdf', new Blob([fileBuffer], { type: 'application/pdf' }), path.basename(pdfPath));

	const uploadRes = await fetch(`${BASE_URL}/upload`, {
		method: 'POST',
		body: form,
	});
	const uploadBody = await parseBody(uploadRes);
	logStep('UPLOAD', { status: uploadRes.status, body: uploadBody });

	if (!uploadRes.ok || !uploadBody.sha256) {
		throw new Error('Upload failed or sha256 missing in response.');
	}

	const notarizePayload = {
		hash: uploadBody.sha256,
		metadata: {
			filename: path.basename(pdfPath),
			contractId: `SMOKE-${Date.now()}`,
		},
	};

	const notarizeRes = await fetch(`${BASE_URL}/api/notarize`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
		},
		body: JSON.stringify(notarizePayload),
	});
	const notarizeBody = await parseBody(notarizeRes);
	logStep('NOTARIZE', { status: notarizeRes.status, body: notarizeBody });

	if (!notarizeRes.ok || !notarizeBody.notarizationId) {
		throw new Error('Notarization failed or notarizationId missing in response.');
	}

	const verifyRes = await fetch(`${BASE_URL}/api/verify/${encodeURIComponent(notarizeBody.notarizationId)}`);
	const verifyBody = await parseBody(verifyRes);
	logStep('VERIFY', { status: verifyRes.status, body: verifyBody });

	if (!verifyRes.ok || !verifyBody.found) {
		throw new Error('Verification failed or notarization not found.');
	}

	const expectedHash = notarizePayload.hash;
	const verifiedHash = verifyBody?.payload?.hash;
	if (verifiedHash !== expectedHash) {
		throw new Error(`Hash mismatch: expected ${expectedHash}, got ${verifiedHash || '(missing)'}`);
	}

	console.log('\nSMOKE TEST PASSED: notarization created and verified on testnet.');
}

main().catch((error) => {
	console.error(`\nSMOKE TEST FAILED: ${error.message}`);
	process.exitCode = 1;
});
