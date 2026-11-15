// s1115a A2. eslint-plugin-obsidianmd 0.6.0 regex-lookbehind (iOS before 16.4 has no lookbehind). Equivalence of the
// rewrite with the old lookbehind expression, on a table of edge cases and on seeded fuzz input (as lanes/R1-A1/eq/eq.mts).
import { describe, expect, it } from 'vitest';
import { INLINE_MATH } from '../src/indexer';
import { replaceAlts } from '../src/no-lookbehind';

let seed = 1115;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gen = (alpha: string[], len: number) => Array.from({ length: Math.floor(rnd() * len) }, () => alpha[Math.floor(rnd() * alpha.length)]).join('');
const FUZZ = 20000;
const j = (x: unknown) => JSON.stringify(x);
/** Runs old and new on each input. Returns the inputs where they differ. */
function differ(inputs: string[], oldF: (s: string) => unknown, newF: (s: string) => unknown): string[] {
	return inputs.filter((s) => j(oldF(s)) !== j(newF(s)));
}
const fuzz = (alpha: string[], len: number) => Array.from({ length: FUZZ }, () => gen(alpha, len));

const blank = (s: string) => s.replace(/[^\n]/g, ' ');
const oldMath = (s: string) => s.replace(/(?<![\\$])\$(?:[^\s$\\]|[^\s$][^$\n]*?[^\s\\])\$(?!\d)/g, blank);
const newMath = (s: string) => replaceAlts(s, INLINE_MATH, (m) => blank(m.text));
const TABLE = ['', '$x$', '\\$x$', '$$x$$', 'a$x$b', '$x$1', '$ x$', '$x $', '$x\\$', '$a$ $b$', '$$', '$x$$y$', '\\\\$x$', 'see @fig:a and $y$', '$x\ny$', '😀$x$', '$1$2'];

describe('inline math mask without lookbehind', () => {
	it('matches the old expression on the table', () => {
		expect(differ(TABLE, oldMath, newMath)).toEqual([]);
	});
	it('matches the old expression on fuzz input', () => {
		expect(differ(fuzz(['$', '\\', 'x', ' ', '1', '\n', '@fig:a', '$$'], 24), oldMath, newMath)).toEqual([]);
	});
});
