function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function renderMarkdown(raw: string, options?: { linkStyle?: string }): string {
	let s = escapeHtml(raw);
	// Bold: **text**
	s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	// Italic: *text* or _text_
	s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
	s = s.replace(/\b_(.+?)_\b/g, '<em>$1</em>');
	// Links: [text](http(s)://url)
	if (options?.linkStyle) {
		s = s.replace(
			/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
			`<a href="$2" target="_blank" rel="noopener noreferrer" style="${options.linkStyle}">$1</a>`
		);
	} else {
		s = s.replace(
			/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
		);
	}
	return s;
}
