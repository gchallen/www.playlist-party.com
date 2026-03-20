export function isCreator(attendee: { depth: number; invitedBy: number | null }): boolean {
	return attendee.depth === 0 && attendee.invitedBy === null;
}

export function isCohost(attendee: { isCohost: number }): boolean {
	return attendee.isCohost === 1;
}

export function isCreatorOrCohost(attendee: { depth: number; invitedBy: number | null; isCohost: number }): boolean {
	return isCreator(attendee) || isCohost(attendee);
}

export function hasPlaylistControl(attendee: {
	depth: number;
	invitedBy: number | null;
	isDj: number;
	isCohost: number;
}): boolean {
	return isCreatorOrCohost(attendee) || attendee.isDj === 1;
}

export function isApproved(
	attendee: { approvedAt: string | null; depth: number; invitedBy: number | null; isCohost: number },
	party: { inviteMode: string }
): boolean {
	if (party.inviteMode !== 'audition') return true;
	if (isCreatorOrCohost(attendee)) return true;
	return attendee.approvedAt !== null;
}
