// s1115a A2. src/no-lookbehind.ts must give the same matches as matchAll, test and replace of the regex engine.
// For alternatives without notAfter, matchAlts of [a, b] equals matchAll of /a|b/g. With notAfter it equals a lookbehind.
import { describe, expect, it } from 'vitest';
import { matchAlts, replaceAlts, testAlts, type Alt } from '../src/no-lookbehind';

let seed = 1115;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gen = (alpha: string[], len: number) => Array.from({ length: Math.floor(rnd() * len) }, () => alpha[Math.floor(rnd() * alpha.length)]).join('');
const A = ['a', 'b', 'x', '!', ' ', '\n', 'aa'];
const CASES: { alts: Alt[]; re: RegExp }[] = [
	{ alts: [{ re: /aa/ }], re: /aa/g },
	{ alts: [{ re: /a+/ }, { re: /b/ }], re: /a+|b/g },
	{ alts: [{ re: /ab?/ }, { re: /a/ }], re: /ab?|a/g },
	{ alts: [{ re: /a(?=b)/ }, { re: /x[ab]*/ }], re: /a(?=b)|x[ab]*/g },
	{ alts: [{ re: /a+/, notAfter: /!/ }], re: /(?<!!)a+/g },
	{ alts: [{ re: /ab/, notAfter: /[!x]/ }, { re: /a/ }], re: /(?<![!x])ab|a/g },
	{ alts: [{ re: /b/ }, { re: /a+/, notAfter: /[\s]/ }], re: /b|(?<![\s])a+/g },
];
const pairs = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => [m.index, m[0]]);

describe('no-lookbehind helper', () => {
	it.each(CASES.map((c, i) => [i, c]))('case %s: matchAlts, testAlts and replaceAlts equal the regex engine on 3000 inputs', (_i, c) => {
		for (let n = 0; n < 3000; n++) {
			const s = gen(A, 16);
			expect(matchAlts(s, c.alts).map((m) => [m.index, m.text]), s).toEqual(pairs(s, c.re));
			expect(testAlts(s, c.alts), s).toBe(new RegExp(c.re.source).test(s));
			expect(replaceAlts(s, c.alts, (m) => `<${m.text}>`), s).toBe(s.replace(c.re, (m) => `<${m}>`));
		}
	});

	it('resumes after a match, not inside it', () => {
		expect(matchAlts('aaaa', [{ re: /aa/ }]).map((m) => m.index)).toEqual([0, 2]);
	});
});
