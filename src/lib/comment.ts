export const MAX_COMMENT_LENGTH = 200;

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function renderComment(raw: string): string {
	let s = escapeHtml(raw);
	// Bold: **text**
	s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	// Italic: *text* or _text_
	s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
	s = s.replace(/\b_(.+?)_\b/g, '<em>$1</em>');
	// Links: [text](https://url)
	s = s.replace(
		/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g,
		'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
	);
	return s;
}
