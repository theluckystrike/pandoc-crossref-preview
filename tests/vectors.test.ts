import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { previewSummary } from '../src/indexer';
import vectors from './fixtures/vectors.json';
describe('Acceptance vectors', () => {
	for (const c of vectors.cases) it(`${c.acceptance} ${c.name}`, () => { expect(previewSummary(c.args[0]!)).toEqual(c.expected); });
	const path = '../../packages/spec/vectors/pandoc-crossref-preview.json';
	it.skipIf(!existsSync(path))('keeps the exported fixture equal to the factory vectors', () => { expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(vectors); });
});
