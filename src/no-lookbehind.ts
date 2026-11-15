// Matching without regex lookbehind. iOS before 16.4 has no lookbehind, so the Obsidian directory scanner
// (eslint-plugin-obsidianmd regex-lookbehind) rejects it. A pattern a|b|c is a list of alternatives. At each position,
// from left to right, the alternatives are tried in order and the first one that matches wins, as in the regex engine.
// notAfter takes the place of a leading one-character lookbehind (?<![...]): the alternative fails at that position
// when the character before it matches notAfter. After a match the search goes on at its end (one step on an empty match).

export interface Alt {
	/** One alternative of the pattern. The g and y flags are ignored. */
	re: RegExp;
	/** Character class of a leading negative lookbehind, tested on the one character before the match. */
	notAfter?: RegExp;
}

export interface AltMatch {
	index: number;
	text: string;
	/** The exec result of the alternative that matched (its own groups). */
	exec: RegExpExecArray;
	/** Index of the alternative that matched. */
	alt: number;
}

function sticky(alts: readonly Alt[]): RegExp[] {
	return alts.map((a) => new RegExp(a.re.source, a.re.flags.replace(/[gy]/g, '') + 'y'));
}

function matchAt(text: string, p: number, alts: readonly Alt[], res: RegExp[]): AltMatch | null {
	for (let k = 0; k < alts.length; k++) {
		const before = alts[k]!.notAfter;
		if (before && p > 0 && before.test(text[p - 1]!)) continue;
		const re = res[k]!;
		re.lastIndex = p;
		const m = re.exec(text);
		if (m) return { index: p, text: m[0], exec: m, alt: k };
	}
	return null;
}

/** All matches, left to right, like matchAll of the global pattern with its lookbehinds. */
export function matchAlts(text: string, alts: readonly Alt[]): AltMatch[] {
	const res = sticky(alts);
	const out: AltMatch[] = [];
	for (let p = 0; p <= text.length; ) {
		const m = matchAt(text, p, alts, res);
		if (!m) {
			p++;
			continue;
		}
		out.push(m);
		p += m.text.length || 1;
	}
	return out;
}

/** True when the pattern matches anywhere, like test() of the pattern with its lookbehinds. */
export function testAlts(text: string, alts: readonly Alt[]): boolean {
	const res = sticky(alts);
	for (let p = 0; p <= text.length; p++) if (matchAt(text, p, alts, res)) return true;
	return false;
}

/** Replaces each match with fn(match), like replace() of the global pattern with its lookbehinds. */
export function replaceAlts(text: string, alts: readonly Alt[], fn: (m: AltMatch) => string): string {
	let out = '';
	let end = 0;
	for (const m of matchAlts(text, alts)) {
		out += text.slice(end, m.index) + fn(m);
		end = m.index + m.text.length;
	}
	return out + text.slice(end);
}
