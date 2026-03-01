import { nanoid } from 'nanoid';

const PARTY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PARTY_CODE_LENGTH = 6;

export function generateInviteToken(): string {
	return nanoid(21);
}

export function generateAdminToken(): string {
	return nanoid(21);
}

export function generatePartyCode(): string {
	let code = '';
	for (let i = 0; i < PARTY_CODE_LENGTH; i++) {
		code += PARTY_CODE_CHARS[Math.floor(Math.random() * PARTY_CODE_CHARS.length)];
	}
	return code;
}
