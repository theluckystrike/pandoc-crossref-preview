import { describe, expect, it } from 'vitest';
import { previewSummary } from '../src/indexer';
const fig = '![A](a.png){#fig:a}\n\n';
describe('Review defects', () => {
	it('counts references in nested list items with tab or space indent', () => {
		expect(previewSummary(`${fig}- Item\n\t- tab see @fig:a\n- Other\n    - four see @fig:a`).references).toEqual(['Figure 1', 'Figure 1']);
	});
	it('counts references in an indented paragraph continuation line', () => {
		expect(previewSummary(`${fig}Para line one\n    continued @fig:a`).references).toEqual(['Figure 1']);
	});
	it('still ignores an indented code block after a blank line', () => {
		expect(previewSummary(`${fig}    code @fig:a\n\nSee @fig:a`).references).toEqual(['Figure 1']);
	});
	it('still ignores a fenced code block inside a list item', () => {
		expect(previewSummary(`${fig}- Item\n\t\`\`\`\n\t@fig:zz {#fig:zz}\n\t\`\`\`\n- See @fig:a`)).toEqual({ labels: ['fig:a=1@1'], references: ['Figure 1'], issues: [] });
	});
	it('does not hide the note when the first line is a rule with no closing line', () => {
		expect(previewSummary(`---\nrule above\n\n${fig}See @fig:a.`).references).toEqual(['Figure 1']);
	});
	it('still ignores closed frontmatter', () => {
		expect(previewSummary(`---\nnote: "@fig:a"\n---\n${fig}See @fig:a.`).references).toEqual(['Figure 1']);
	});
	it('counts a reference between two dollar prices', () => {
		expect(previewSummary(`${fig}It costs $5 and @fig:a shows $6 more.`).references).toEqual(['Figure 1']);
	});
	it('still ignores a reference in inline math', () => {
		expect(previewSummary(`${fig}Math $x @fig:a$ and @fig:a.`).references).toEqual(['Figure 1']);
	});
});
describe('Reading view index cache', () => {
	it('parses a large note once for many sections and parses again after an edit', async () => {
		const { App } = await import('obsidian-test-mocks/obsidian');
		const { default: Plugin } = await import('../src/main');
		const indexer = await import('../src/indexer');
		const big = Array.from({ length: 5000 }, (_, i) => `Paragraph ${i} cites @fig:x${i}.\n\n![X](x.png){#fig:x${i}}\n`).join('\n');
		const plugin = new Plugin(App.createConfigured__({ files: {} }) as never, { id: 'pandoc-crossref-preview' } as never);
		const profile = indexer.DEFAULT_PROFILE;
		const first = plugin.indexFor(big, profile);
		const start = performance.now();
		for (let n = 0; n < 2000; n++) expect(plugin.indexFor(big, profile)).toBe(first);
		expect(performance.now() - start).toBeLessThan(500);
		expect(first.targets).toHaveLength(5000);
		expect(plugin.indexFor(`${big}\nMore.`, profile)).not.toBe(first);
		expect(plugin.indexFor(big, { ...profile, figureStart: 3 }).targets[0]!.number).toBe(3);
	});
});
