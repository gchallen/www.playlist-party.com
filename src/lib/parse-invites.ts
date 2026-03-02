/**
 * Parse bulk invite text into name+email pairs.
 * Supports formats like:
 *   John Doe john@example.com
 *   john@example.com John Doe
 *   John Doe <john@example.com>
 *   Jane, jane@test.com
 *   Tab-separated variants of the above
 */

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

export interface ParsedInvite {
	name: string;
	email: string;
}

export function parseInviteLines(text: string): ParsedInvite[] {
	const results: ParsedInvite[] = [];

	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line) continue;

		const emailMatch = line.match(EMAIL_RE);
		if (!emailMatch) continue;

		const email = emailMatch[0];
		// Remove the email and surrounding angle brackets, commas, tabs, extra spaces
		const remainder = line
			.replace(EMAIL_RE, '')
			.replace(/[<>,\t]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		if (!remainder) continue;

		results.push({ name: remainder, email });
	}

	return results;
}
