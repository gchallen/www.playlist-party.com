export function abbreviateName(fullName: string): string {
	const parts = fullName.trim().split(/\s+/);
	if (parts.length === 1) return parts[0];
	return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
