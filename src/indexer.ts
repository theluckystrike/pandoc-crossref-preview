/** The v1 grammar is deliberately limited to standalone Markdown images and simple display math. */
export interface Target { id: string; kind: 'fig' | 'eq'; number: number; line: number }
export interface Diagnostic { kind: 'duplicate' | 'missing' | 'unsupported'; id: string; line: number }
export interface Reference { id: string; line: number; offset: number }
export interface NoteIndex { targets: Target[]; references: Reference[]; diagnostics: Diagnostic[] }
export interface Profile { figurePrefix: string; equationPrefix: string; figureStart: number; equationStart: number }
export const DEFAULT_PROFILE: Profile = { figurePrefix: 'Figure', equationPrefix: 'Equation', figureStart: 1, equationStart: 1 };
const ID = '(?:fig|eq):[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?';
export function referencePattern(): RegExp { return new RegExp(`(^|[^\\\\\\w@:/.-])@(${ID})(?![\\w:-])`, 'g'); }
function blank(s: string): string { return s.replace(/[^\n]/g, ' '); }
export function maskUrls(text: string): string { return text.replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi, blank); }

/** Preserve offsets while hiding source that cannot supply a reference or label. */
function maskSource(source: string): string {
	const lines = source.split('\n');
	let fence = ''; let length = 0; let yaml = lines[0]?.trim() === '---' && lines.slice(1).some((l) => /^(---|\.\.\.)\s*$/.test(l));
	// Indented code needs a blank line before it and cannot sit in a list, where tabs and spaces nest items.
	let prevBlank = true; let prevCode = false; let inList = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (yaml) { lines[i] = blank(line); if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) yaml = false; continue; }
		const f = (inList ? /^[ \t]*(`{3,}|~{3,})/ : /^ {0,3}(`{3,}|~{3,})/).exec(line);
		if (fence) {
			lines[i] = blank(line);
			if (f && f[1]![0] === fence && f[1]!.length >= length && /^[ \t]*(?:`+|~+)\s*$/.test(line)) fence = '';
		} else if (f) { fence = f[1]![0]!; length = f[1]!.length; lines[i] = blank(line); prevBlank = false; prevCode = false; }
		else if (!line.trim()) { prevBlank = true; prevCode = false; }
		else {
			const indented = /^(?: {4}|\t)/.test(line);
			if (indented && !inList && (prevBlank || prevCode)) { lines[i] = blank(line); prevCode = true; }
			else {
				if (/^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/.test(line)) inList = true; else if (!indented && prevBlank) inList = false;
				prevCode = false;
			}
			prevBlank = false;
		}
	}
	return lines.join('\n').replace(/<!--[^]*?(?:-->|$)/g, blank)
		.replace(/(`+)([^]*?)\1(?!`)/g, blank)
		.replace(/<[^>\n]*>/g, blank);
}

export function buildIndex(source: string, profile: Profile = DEFAULT_PROFILE): NoteIndex {
	const clean = maskSource(source.replace(/\r\n/g, '\n'));
	const lines = clean.split('\n');
	const targets: Target[] = []; const diagnostics: Diagnostic[] = [];
	const recognized = new Set<number>(); const math = new Set<number>();
	let fig = profile.figureStart; let eq = profile.equationStart; let divDepth = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (/^:{3,}/.test(line)) { if (/^:{3,}\s*$/.test(line)) divDepth = Math.max(0, divDepth - 1); else divDepth++; continue; }
		if (divDepth > 0) continue;
		const image = /^!\[(?:[^\]\\]|\\.)*\]\([^\n()]+\)\s*\{#(fig:[A-Za-z0-9_][A-Za-z0-9_.-]*)\}$/.exec(line);
		if (image) { targets.push({ id: image[1]!, kind: 'fig', number: fig++, line: i + 1 }); recognized.add(i); }
		if (line.startsWith('$$')) {
			let end = i;
			if (!/^\$\$[^]*?\$\$/.test(line)) {
				end = i + 1;
				while (end < lines.length && !/^\s*\$\$/.test(lines[end]!)) end++;
			}
			if (end >= lines.length) { for (let n = i; n < lines.length; n++) math.add(n); break; }
			for (let n = i; n <= end; n++) math.add(n);
			const closing = lines[end]!.trim();
			const next = /^\s*\{#(eq:[A-Za-z0-9_][A-Za-z0-9_.-]*)\}\s*$/.exec(lines[end + 1] ?? '');
			const label = next;
			const body = lines.slice(i, end + 1).join('\n');
			if (label && !/\\begin\s*\{(?:subequations|align|gather|split)/.test(body) && /^\$\$/.test(line) && (end === i ? /^\$\$[^]*?\$\$\s*$/.test(line) : /^\$\$\s*$/.test(closing))) {
				targets.push({ id: label[1]!, kind: 'eq', number: eq++, line: i + 1 });
				recognized.add(end + 1);
			}
			i = end;
		}
	}
	for (let i = 0; i < lines.length; i++) {
		if (recognized.has(i)) continue;
		for (const m of lines[i]!.matchAll(/\{#([A-Za-z][A-Za-z0-9_:.-]*)[^}]*\}/g)) diagnostics.push({ kind: 'unsupported', id: m[1]!, line: i + 1 });
	}
	const counts = new Map<string, number>();
	for (const t of targets) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
	for (const t of targets) if (counts.get(t.id)! > 1) diagnostics.push({ kind: 'duplicate', id: t.id, line: t.line });
	const references: Reference[] = [];
	let offset = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (!math.has(i)) {
			const eligible = maskUrls(line.replace(/!?\[[^\]]*\]\([^)]*\)/g, blank).replace(/\[\[[^\]]*\]\]/g, blank))
				.replace(/(?<![\\$])\$(?:[^\s$\\]|[^\s$][^$\n]*?[^\s\\])\$(?!\d)/g, blank);
			for (const m of eligible.matchAll(referencePattern())) {
				const id = m[2]!; references.push({ id, line: i + 1, offset: offset + m.index + m[1]!.length });
				if (!counts.has(id)) diagnostics.push({ kind: 'missing', id, line: i + 1 });
			}
		}
		offset += line.length + 1;
	}
	return { targets, references, diagnostics };
}
export function resolve(index: NoteIndex, id: string): Target | null {
	const found = index.targets.filter((t) => t.id === id);
	return found.length === 1 && !index.diagnostics.some((d) => d.id === id && d.kind === 'unsupported') ? found[0]! : null;
}
export function targetText(target: Target, profile: Profile): string { return `${target.kind === 'fig' ? profile.figurePrefix : profile.equationPrefix} ${target.number}`; }
export function reportText(path: string, index: NoteIndex, profile: Profile): string {
	return ['Pandoc Crossref Preview label report', `Note: ${path}`, '', ...index.targets.map((t) => `${t.id}\t${targetText(t, profile)}\tline ${t.line}`), '', ...index.diagnostics.map((d) => `${d.kind}\t${d.id}\tline ${d.line}`), '', 'Scope: standalone images and simple display equations in this note.', ''].join('\n');
}

/** Compact deterministic output for the acceptance vectors. */
export function previewSummary(source: string): { labels: string[]; references: string[]; issues: string[] } {
 const index = buildIndex(source);
 return { labels: index.targets.map((t) => `${t.id}=${t.number}@${t.line}`), references: index.references.map((r) => { const t = resolve(index, r.id); return t ? targetText(t, DEFAULT_PROFILE) : `@${r.id}`; }), issues: index.diagnostics.map((d) => `${d.kind}:${d.id}@${d.line}`) };
}
