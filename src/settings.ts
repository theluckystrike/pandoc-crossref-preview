import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { DEFAULT_PROFILE, type Profile } from './indexer';
import { PRO_UI } from './pro';
import type PandocCrossrefPreviewPlugin from './main';
import { helloSettingItems } from './hello/settings';
export interface SavedProfile { name: string; profile: Profile }
export interface PandocCrossrefPreviewSettings extends Profile { profiles: SavedProfile[] }
export const DEFAULT_SETTINGS: PandocCrossrefPreviewSettings = { ...DEFAULT_PROFILE, profiles: [] };
function prefix(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback; }
function start(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.min(99999, Math.max(1, Math.round(value))) : 1; }
export function normalizeProfile(value: Partial<Profile> | null | undefined): Profile {
	const s = value ?? {};
	return { figurePrefix: prefix(s.figurePrefix, 'Figure'), equationPrefix: prefix(s.equationPrefix, 'Equation'), figureStart: start(s.figureStart), equationStart: start(s.equationStart) };
}
export function normalizeSettings(saved: Partial<PandocCrossrefPreviewSettings> | null | undefined): PandocCrossrefPreviewSettings {
	const profiles: SavedProfile[] = [];
	if (Array.isArray(saved?.profiles)) for (const item of saved.profiles.slice(0, 30)) {
		if (!item || typeof item.name !== 'string' || !item.name.trim() || !item.profile || typeof item.profile !== 'object') continue;
		const name = item.name.trim().slice(0, 60);
		if (!profiles.some((p) => p.name === name)) profiles.push({ name, profile: normalizeProfile(item.profile) });
	}
	return { ...normalizeProfile(saved), profiles };
}
export class PandocCrossrefPreviewSettingTab extends PluginSettingTab {
	plugin: PandocCrossrefPreviewPlugin;
	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], plugin: PandocCrossrefPreviewPlugin) { super(app, plugin); this.plugin = plugin; }
	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		return [
			...(this.plugin.pro ? sponsorsSettingItems(this.plugin.pro, PRO_UI) : []),
			...(['figurePrefix', 'equationPrefix'] as const).map((key) => ({ name: key === 'figurePrefix' ? 'Figure prefix' : 'Equation prefix', desc: 'Text before the reference number. Reopen Reading view after a change.', control: { type: 'text' as const, key, defaultValue: DEFAULT_PROFILE[key] } })),
			...(['figureStart', 'equationStart'] as const).map((key) => ({ name: key === 'figureStart' ? 'First figure number' : 'First equation number', desc: 'An integer from 1 to 99999. Reopen Reading view after a change.', control: { type: 'number' as const, key, defaultValue: 1 } })),
			{ name: 'Saved profiles (Pro)', desc: `${this.plugin.settings.profiles.length} saved profiles.`, action: () => this.plugin.showProfiles() },
		];
	}
	async setControlValue(key: string, value: unknown): Promise<void> {
		const next = normalizeSettings({ ...this.plugin.settings, [key]: value });
		this.plugin.settings = next; await this.plugin.saveSettings();
	}
}
