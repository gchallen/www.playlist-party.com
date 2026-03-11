export function isCreator(attendee: { depth: number; invitedBy: number | null }): boolean {
	return attendee.depth === 0 && attendee.invitedBy === null;
}

export function hasPlaylistControl(attendee: { depth: number; invitedBy: number | null; isDj: number }): boolean {
	return isCreator(attendee) || attendee.isDj === 1;
}
