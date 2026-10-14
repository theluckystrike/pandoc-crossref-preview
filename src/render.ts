import { maskUrls, referencePattern, resolve, targetText, type NoteIndex, type Profile, type Target } from './indexer';

/** Use DOM text nodes so label text cannot become executable markup. */
export function renderReferences(el: HTMLElement, index: NoteIndex, profile: Profile, firstLine: number, lastLine: number, open: (target: Target) => void): number {
	const available = new Map<string, number>();
	for (const r of index.references) if (r.line >= firstLine && r.line <= lastLine) available.set(r.id, (available.get(r.id) ?? 0) + 1);
	const doc = el.ownerDocument;
	const walker = doc.createTreeWalker(el, 4);
	const nodes: Text[] = [];
	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		if (!node.parentElement?.closest('code, pre, a, button, script, style, textarea, .math, .MathJax, mjx-container, .pcp-reference, .pcp-unresolved')) nodes.push(node);
	}
	let count = 0;
	for (const node of nodes) {
		const text = node.data; const frag = createFragment(); let last = 0; let changed = false;
		for (const m of maskUrls(text).matchAll(referencePattern())) {
			const id = m[2]!; const start = m.index + m[1]!.length;
			if ((available.get(id) ?? 0) === 0) continue;
			available.set(id, available.get(id)! - 1);
			frag.append(doc.createTextNode(text.slice(last, start)));
			const target = resolve(index, id);
			if (target) {
				const link = frag.createEl('a'); link.className = 'pcp-reference'; link.textContent = targetText(target, profile);
				link.href = '#'; link.dataset.label = id; link.dataset.line = String(target.line);
				link.title = `${id}, source line ${target.line}`;
				link.addEventListener('click', (event) => { event.preventDefault(); open(target); });
				frag.append(link); count++;
			} else {
				const span = frag.createSpan(); span.className = 'pcp-unresolved'; span.textContent = `@${id}`;
				span.title = index.targets.some((t) => t.id === id) ? `No unique supported target for ${id}. Use Show label report.` : `Missing target ${id}. Use Show label report.`;
				frag.append(span);
			}
			last = start + id.length + 1; changed = true;
		}
		if (changed) { frag.append(doc.createTextNode(text.slice(last))); node.replaceWith(frag); }
	}
	return count;
}
