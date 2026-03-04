import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

const DEV_SECRET = 'dev-hmac-secret-not-for-production';

function getSecret(platform?: App.Platform): string {
	return platform?.env?.HMAC_SECRET || DEV_SECRET;
}

function toBase64Url(buf: Buffer): string {
	return buf.toString('base64url');
}

function fromBase64Url(str: string): Buffer {
	return Buffer.from(str, 'base64url');
}

export function createSignedToken(email: string, platform?: App.Platform): string {
	const secret = getSecret(platform);
	const timestamp = Date.now().toString();
	const payload = `${email}:${timestamp}`;
	const sig = createHmac('sha256', secret).update(payload).digest();
	const token = toBase64Url(Buffer.from(`${payload}:${sig.toString('base64url')}`));
	return token;
}

export function verifySignedToken(
	token: string,
	platform?: App.Platform,
	maxAgeMs: number = 30 * 60 * 1000
): { email: string } | null {
	try {
		const secret = getSecret(platform);
		const decoded = fromBase64Url(token).toString();
		const lastColon = decoded.lastIndexOf(':');
		if (lastColon === -1) return null;

		const payload = decoded.slice(0, lastColon);
		const sigStr = decoded.slice(lastColon + 1);

		const sepIdx = payload.lastIndexOf(':');
		if (sepIdx === -1) return null;

		const email = payload.slice(0, sepIdx);
		const timestamp = payload.slice(sepIdx + 1);

		// Check expiry
		const ts = parseInt(timestamp, 10);
		if (isNaN(ts) || Date.now() - ts > maxAgeMs) return null;

		// Verify signature
		const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
		const sigBuf = Buffer.from(sigStr);
		const expectedBuf = Buffer.from(expectedSig);

		if (sigBuf.length !== expectedBuf.length) return null;
		if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

		return { email };
	} catch {
		return null;
	}
}
