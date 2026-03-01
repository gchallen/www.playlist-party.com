import { nanoid } from 'nanoid';

export function generateInviteToken(): string {
	return nanoid(21);
}
