function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function applyInlineFormatting(s: string, options?: { linkStyle?: string }): string {
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

export interface MarkdownOptions {
	linkStyle?: string;
	listStyle?: string;
	listItemStyle?: string;
}

export function renderMarkdown(raw: string, options?: MarkdownOptions): string {
	const escaped = escapeHtml(raw);
	const lines = escaped.split('\n');
	const output: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Unordered list: * item or - item
		const ulMatch = line.match(/^[*-] (.+)/);
		if (ulMatch) {
			const items: string[] = [];
			while (i < lines.length) {
				const m = lines[i].match(/^[*-] (.+)/);
				if (!m) break;
				items.push(m[1]);
				i++;
			}
			const listStyle = options?.listStyle ? ` style="${options.listStyle}"` : '';
			const itemStyle = options?.listItemStyle ? ` style="${options.listItemStyle}"` : '';
			output.push(
				`<ul${listStyle}>` +
					items.map((item) => `<li${itemStyle}>${applyInlineFormatting(item, options)}</li>`).join('') +
					'</ul>'
			);
			continue;
		}

		// Ordered list: 1. item
		const olMatch = line.match(/^\d+\. (.+)/);
		if (olMatch) {
			const items: string[] = [];
			while (i < lines.length) {
				const m = lines[i].match(/^\d+\. (.+)/);
				if (!m) break;
				items.push(m[1]);
				i++;
			}
			const listStyle = options?.listStyle ? ` style="${options.listStyle}"` : '';
			const itemStyle = options?.listItemStyle ? ` style="${options.listItemStyle}"` : '';
			output.push(
				`<ol${listStyle}>` +
					items.map((item) => `<li${itemStyle}>${applyInlineFormatting(item, options)}</li>`).join('') +
					'</ol>'
			);
			continue;
		}

		// Regular line
		output.push(applyInlineFormatting(line, options));
		i++;
	}

	return output.join('\n');
}
