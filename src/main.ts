import { MarkdownView, Modal, Notice, Plugin, normalizePath, type MarkdownPostProcessorContext } from 'obsidian';
import type { SponsorsManager } from './license/index';
import { createGitHubSponsors } from './license/github-obsidian';
import { buildIndex, reportText, targetText, type NoteIndex, type Profile, type Target } from './indexer';
import { renderReferences } from './render';
import { SPONSORS, bindPro, isPro, resetPro } from './pro';
import { DEFAULT_SETTINGS, PandocCrossrefPreviewSettingTab, normalizeProfile, normalizeSettings, type PandocCrossrefPreviewSettings } from './settings';
export default class PandocCrossrefPreviewPlugin extends Plugin {
	settings: PandocCrossrefPreviewSettings = { ...DEFAULT_SETTINGS, profiles: [] };
	pro: SponsorsManager | null = null;
	private reportModal: Modal | null = null;
	private profileModal: Modal | null = null;
	private lastIndex: { source: string; key: string; index: NoteIndex } | null = null;
	async onload(): Promise<void> {
		await this.loadSettings();
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this); pro.init(); this.pro = pro; bindPro(pro);
		const tab = new PandocCrossrefPreviewSettingTab(this.app, this); this.addSettingTab(tab);
		this.register(pro.onChange(() => tab.update()));
		this.app.workspace.onLayoutReady(() => { void pro.refresh(); this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000)); });
		this.registerMarkdownPostProcessor((el, ctx) => this.process(el, ctx));
		for (const [id, name, run] of [
			['show-report', 'Show label report', () => void this.showReport()],
			['save-report', 'Save local label report (pro)', () => void this.saveReport()],
		] as const) this.addCommand({ id, name, checkCallback: (checking) => { const ok = this.app.workspace.getActiveFile()?.extension === 'md'; if (ok && !checking) run(); return ok; } });
		this.addCommand({ id: 'profiles', name: 'Save or load number profiles (pro)', callback: () => this.showProfiles() });
	}
	onunload(): void { this.closeDialogs(); this.lastIndex = null; resetPro(); }
	closeDialogs(): void { this.reportModal?.close(); this.profileModal?.close(); this.reportModal = null; this.profileModal = null; }
	async loadSettings(): Promise<void> { this.settings = normalizeSettings(await this.loadData() as Partial<PandocCrossrefPreviewSettings> | null); }
	async saveSettings(): Promise<void> { await this.saveData(this.settings); }
	profile(): Profile { return normalizeProfile(this.settings); }
	async process(el: HTMLElement, ctx: MarkdownPostProcessorContext): Promise<void> {
		if (el.closest('.markdown-source-view')) return;
		const file = this.app.vault.getFileByPath(ctx.sourcePath); if (!file || file.extension !== 'md') return;
		const section = ctx.getSectionInfo(el); if (!section) return;
		const profile = this.profile(); const index = this.indexFor(await this.app.vault.cachedRead(file), profile);
		renderReferences(el, index, profile, section.lineStart + 1, section.lineEnd + 1, (target) => { void this.openTarget(ctx.sourcePath, target).catch(() => new Notice('Cannot open the target source line.')); });
	}
	/** Reading view calls process once for each section. Reuse the index while the source and profile stay the same. */
	indexFor(source: string, profile: Profile): NoteIndex {
		const key = JSON.stringify(profile);
		if (this.lastIndex?.source !== source || this.lastIndex.key !== key) this.lastIndex = { source, key, index: buildIndex(source, profile) };
		return this.lastIndex.index;
	}
	async openTarget(path: string, target: Target): Promise<void> {
		const file = this.app.vault.getFileByPath(path); if (!file) return;
		await this.app.workspace.getLeaf(false).openFile(file, { state: { mode: 'source' }, eState: { line: target.line - 1 }, active: true });
		const view = this.app.workspace.getActiveViewOfType(MarkdownView); view?.editor.setCursor({ line: target.line - 1, ch: 0 });
	}
	async showReport(): Promise<void> {
		this.closeDialogs();
		const file = this.app.workspace.getActiveFile(); if (!file || file.extension !== 'md') return;
		const index = buildIndex(await this.app.vault.read(file), this.profile());
		const modal = new Modal(this.app); this.reportModal = modal; modal.setTitle('Label report'); modal.contentEl.addClass('pcp-report');
		modal.contentEl.createEl('p', { text: `${file.basename}: ${index.targets.length} labels, ${index.diagnostics.length} issues.` });
		for (const t of index.targets) modal.contentEl.createEl('p', { text: `${t.id} — ${targetText(t, this.profile())} — line ${t.line}` });
		for (const d of index.diagnostics) modal.contentEl.createEl('p', { cls: 'pcp-issue', text: `${d.kind}: ${d.id}, line ${d.line}` });
		modal.contentEl.createEl('p', { text: 'Supported scope: standalone images and simple display equations in this note.' }); modal.open();
	}
	async saveReport(): Promise<string | null> {
		if (!isPro()) { new Notice('Local label reports need pro. The on-screen report is free.'); return null; }
		const file = this.app.workspace.getActiveFile(); if (!file || file.extension !== 'md') return null;
		try {
			const text = reportText(file.path, buildIndex(await this.app.vault.read(file), this.profile()), this.profile());
			const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length + 1)));
			const content = `# Local label report\n\n${fence}text\n${text}${fence}\n`;
			const folder = file.parent?.path ?? ''; const base = normalizePath(`${folder}/${file.basename} crossref report`);
			let n = 1; let path = `${base}.md`;
			while (this.app.vault.getAbstractFileByPath(path)) path = `${base} ${++n}.md`;
			await this.app.vault.create(path, content); new Notice(`Saved ${path}`); return path;
		} catch { new Notice('Cannot save the local label report.'); return null; }
	}
	async saveProfile(name: string): Promise<boolean> {
		if (!isPro()) return false;
		const key = name.trim().slice(0, 60); if (!key) return false;
		const profiles = this.settings.profiles.filter((p) => p.name !== key);
		if (profiles.length >= 30) return false;
		profiles.push({ name: key, profile: this.profile() }); this.settings.profiles = profiles; await this.saveSettings(); return true;
	}
	async loadProfile(name: string): Promise<boolean> {
		if (!isPro()) return false;
		const found = this.settings.profiles.find((p) => p.name === name); if (!found) return false;
		this.settings = { ...this.settings, ...normalizeProfile(found.profile) }; await this.saveSettings(); return true;
	}
	showProfiles(): void {
		this.closeDialogs();
		if (!isPro()) { new Notice('Saved number and prefix profiles need pro. Current prefixes and numbers are free.'); return; }
		const modal = new Modal(this.app); this.profileModal = modal; modal.setTitle('Number profiles (pro)');
		modal.contentEl.createEl('p', { text: 'Save the current prefixes and first numbers. Open the project note, load a profile, then reopen reading view.' });
		const input = modal.contentEl.createEl('input', { attr: { type: 'text', placeholder: 'Project name', 'aria-label': 'Project name', maxlength: '60' } });
		const save = modal.contentEl.createEl('button', { text: 'Save current profile' });
		save.addEventListener('click', () => { void this.saveProfile(input.value).then((ok) => { new Notice(ok ? 'Profile saved.' : 'Enter a name. The limit is 30 profiles.'); if (ok) { modal.close(); this.showProfiles(); } }); });
		for (const p of this.settings.profiles) {
			const button = modal.contentEl.createEl('button', { cls: 'pcp-profile', text: `Load ${p.name}` });
			button.addEventListener('click', () => { void this.loadProfile(p.name).then((ok) => { if (ok) { modal.close(); new Notice('Profile loaded. Reopen reading view.'); } }); });
		}
		modal.open();
	}
}
