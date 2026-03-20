const { IotaClient } = require('@iota/iota-sdk/client');
const { Ed25519Keypair } = require('@iota/iota-sdk/keypairs/ed25519');
const { requestIotaFromFaucetV1, getFaucetRequestStatus } = require('@iota/iota-sdk/faucet');
const {
	NotarizationClientReadOnly,
	NotarizationClient,
	TimeLock,
} = require('@iota/notarization/node');

const DEFAULT_NODE_URL = 'https://api.testnet.iota.cafe';
const DEFAULT_FAUCET_URL = 'https://faucet.testnet.iota.cafe/v1/gas';
const DEFAULT_EXPLORER_BASE_URL = 'https://explorer.iota.org/object/';
const TEN_YEARS_SECONDS = 315360000;

function normalizeHash(hash) {
	if (typeof hash !== 'string') {
		throw new Error('hash must be a string');
	}
	const normalized = hash.trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(normalized)) {
		throw new Error('hash must be a valid sha256 hex string (64 chars)');
	}
	return normalized;
}

function getConfig() {
	return {
		nodeUrl: process.env.IOTA_NODE_URL || DEFAULT_NODE_URL,
		mnemonic: process.env.IOTA_MNEMONIC,
		derivationPath: process.env.IOTA_DERIVATION_PATH || undefined,
		accountIndex: Number.parseInt(process.env.IOTA_ACCOUNT_INDEX || '0', 10),
		minimumBalance: process.env.IOTA_MIN_BALANCE || '100000000',
		deleteUnlockSeconds: Number.parseInt(process.env.IOTA_DELETE_UNLOCK_SECONDS || String(TEN_YEARS_SECONDS), 10),
		faucetUrl: process.env.IOTA_FAUCET_URL || DEFAULT_FAUCET_URL,
		explorerBaseUrl: process.env.IOTA_EXPLORER_BASE_URL || DEFAULT_EXPLORER_BASE_URL,
	};
}

function ensureMnemonic(config) {
	if (!config.mnemonic) {
		throw new Error('IOTA_MNEMONIC is missing in environment variables');
	}
}

function getKeypair(config) {
	ensureMnemonic(config);
	return Ed25519Keypair.deriveKeypair(config.mnemonic, config.derivationPath);
}

function getAddress(config) {
	return getKeypair(config).toIotaAddress();
}

async function getClient(config) {
	return new IotaClient({ url: config.nodeUrl });
}

async function getReadOnlyNotarizationClient(config) {
	const iotaClient = await getClient(config);
	return NotarizationClientReadOnly.create(iotaClient);
}

function getTransactionSigner(config) {
	const keypair = getKeypair(config);

	return {
		sign: async (txDataBcs) => {
			const signed = await keypair.signTransaction(txDataBcs);
			return signed.signature;
		},
		publicKey: async () => keypair.getPublicKey(),
		iotaPublicKeyBytes: async () => keypair.getPublicKey().toIotaBytes(),
		keyId: () => keypair.toIotaAddress(),
	};
}

async function getNotarizationClients(config) {
	const readOnly = await getReadOnlyNotarizationClient(config);
	const client = await NotarizationClient.create(readOnly, getTransactionSigner(config));
	return {
		readOnly,
		client,
	};
}

function safeJsonParse(rawValue) {
	try {
		return JSON.parse(rawValue);
	} catch {
		return {
			rawData: rawValue,
		};
	}
}

function serializeBigInt(value) {
	if (typeof value === 'bigint') {
		return value.toString();
	}
	return value;
}

async function getWalletStatus() {
	const config = getConfig();
	const address = getAddress(config);
	const client = await getClient(config);
	const balanceInfo = await client.getBalance({ owner: address });
	const balance = BigInt(balanceInfo.totalBalance || '0');
	const minimumBalance = BigInt(config.minimumBalance);
	return {
		nodeUrl: config.nodeUrl,
		address,
		balance: balance.toString(),
		minimumBalance: minimumBalance.toString(),
		hasEnoughFunds: balance >= minimumBalance,
	};
}

async function requestFaucetFunding() {
	const config = getConfig();
	const address = getAddress(config);
	const faucetResponse = await requestIotaFromFaucetV1({
		host: config.faucetUrl,
		recipient: address,
	});

	let status = null;
	if (faucetResponse.task) {
		status = await getFaucetRequestStatus({ host: config.faucetUrl, taskId: faucetResponse.task });
	}

	return {
		requested: true,
		address,
		faucetUrl: config.faucetUrl,
		response: faucetResponse,
		status,
	};
}

async function notarizeHash({ hash, metadata = {} }) {
	const config = getConfig();
	const normalizedHash = normalizeHash(hash);
	const walletStatus = await getWalletStatus();
	if (!walletStatus.hasEnoughFunds) {
		const error = new Error(
			`Insufficient funds on wallet ${walletStatus.address}. Current balance: ${walletStatus.balance}. Minimum required: ${walletStatus.minimumBalance}.`
		);
		error.code = 'INSUFFICIENT_FUNDS';
		error.walletStatus = walletStatus;
		throw error;
	}
	const { client } = await getNotarizationClients(config);

	const payload = {
		hash: normalizedHash,
		timestamp: new Date().toISOString(),
		metadata,
	};

	const unlockAt = Math.floor(Date.now() / 1000) + config.deleteUnlockSeconds;
	const txOutput = await client
		.createLocked()
		.withStringState(JSON.stringify(payload), 'sha256-hash')
		.withImmutableDescription('Contract hash notarization')
		.withDeleteLock(TimeLock.withUnlockAt(unlockAt))
		.finish()
		.buildAndExecute(client);

	const notarization = txOutput.output;
	const response = txOutput.response;

	return {
		network: config.nodeUrl,
		notarizationId: notarization.id,
		transactionDigest: response.digest,
		explorerUrl: `${config.explorerBaseUrl}${notarization.id}?network=testnet`,
		method: notarization.method,
		stateVersionCount: serializeBigInt(notarization.stateVersionCount),
		deleteUnlockAt: unlockAt,
		payload,
	};
}

async function verifyNotarization(notarizationId) {
	if (!notarizationId || typeof notarizationId !== 'string') {
		throw new Error('notarizationId is required');
	}
	const config = getConfig();
	const readOnly = await getReadOnlyNotarizationClient(config);

	let notarization;
	try {
		notarization = await readOnly.getNotarizationById(notarizationId);
	} catch {
		return {
			found: false,
			notarizationId,
		};
	}

	const stateValue = notarization.state.data.toString();
	const parsedState = safeJsonParse(stateValue);

	return {
		found: true,
		notarizationId,
		owner: notarization.owner,
		method: notarization.method,
		createdAt: serializeBigInt(notarization.immutableMetadata.createdAt),
		lastStateChangeAt: serializeBigInt(notarization.lastStateChangeAt),
		stateVersionCount: serializeBigInt(notarization.stateVersionCount),
		updatableMetadata: notarization.updatableMetadata,
		payload: parsedState,
		nodeUrl: config.nodeUrl,
	};
}

module.exports = {
	notarizeHash,
	verifyNotarization,
	requestFaucetFunding,
	getWalletStatus,
	normalizeHash,
};
