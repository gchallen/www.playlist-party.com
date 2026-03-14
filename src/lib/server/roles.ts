export function isCreator(attendee: { depth: number; invitedBy: number | null }): boolean {
	return attendee.depth === 0 && attendee.invitedBy === null;
}

export function hasPlaylistControl(attendee: { depth: number; invitedBy: number | null; isDj: number }): boolean {
	return isCreator(attendee) || attendee.isDj === 1;
}

export function isApproved(
	attendee: { approvedAt: string | null; depth: number; invitedBy: number | null },
	party: { inviteMode: string }
): boolean {
	if (party.inviteMode !== 'audition') return true;
	if (isCreator(attendee)) return true;
	return attendee.approvedAt !== null;
}
