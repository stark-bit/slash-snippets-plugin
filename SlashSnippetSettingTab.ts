import {App, Notice, PluginSettingTab, Setting, Modifier} from "obsidian";
import SlashSnippetPlugin from "./main";

// Valid single keys (case-insensitive)
const VALID_KEYS = new Set([
	'tab', 'space', 'enter', 'escape', 'backspace', 'delete',
	'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
	'home', 'end', 'pageup', 'pagedown',
	'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
	'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
	'0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
	'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'
]);

// Valid modifiers
const VALID_MODIFIERS = new Set(['ctrl', 'alt', 'shift', 'mod', 'meta']);

export interface ParsedKey {
	modifiers: Modifier[];
	key: string;
}

export interface ParseResult {
	valid: boolean;
	keys: ParsedKey[];
	error?: string;
}

// Parse a single key like "Ctrl+Y" or "Tab"
function parseSingleKey(input: string): { valid: boolean; parsed?: ParsedKey; error?: string } {
	const trimmed = input.trim();
	if (!trimmed) {
		return { valid: false, error: "Empty key" };
	}

	const parts = trimmed.split('+').map(p => p.trim().toLowerCase());
	
	if (parts.length === 1) {
		// Single key like "Tab" or "Space"
		const key = parts[0];
		if (!VALID_KEYS.has(key)) {
			return { valid: false, error: `Unknown key: ${trimmed}` };
		}
		// Map to actual key values
		const keyMap: Record<string, string> = {
			'space': ' ',
			'tab': 'Tab',
			'enter': 'Enter',
			'escape': 'Escape',
			'backspace': 'Backspace',
			'delete': 'Delete',
			'arrowup': 'ArrowUp',
			'arrowdown': 'ArrowDown',
			'arrowleft': 'ArrowLeft',
			'arrowright': 'ArrowRight',
		};
		return { 
			valid: true, 
			parsed: { 
				modifiers: [], 
				key: keyMap[key] || key 
			} 
		};
	}

	// Multiple parts like "Ctrl+Y"
	const modifiers: Modifier[] = [];
	for (let i = 0; i < parts.length - 1; i++) {
		const mod = parts[i];
		if (!VALID_MODIFIERS.has(mod)) {
			return { valid: false, error: `Unknown modifier: ${mod}` };
		}
		// Map to Obsidian Modifier type
		const modMap: Record<string, Modifier> = {
			'ctrl': 'Ctrl',
			'alt': 'Alt',
			'shift': 'Shift',
			'mod': 'Mod',
			'meta': 'Meta'
		};
		modifiers.push(modMap[mod]);
	}

	const key = parts[parts.length - 1];
	if (!VALID_KEYS.has(key)) {
		return { valid: false, error: `Unknown key: ${key}` };
	}

	return { 
		valid: true, 
		parsed: { 
			modifiers, 
			key: key.length === 1 ? key : key.charAt(0).toUpperCase() + key.slice(1)
		} 
	};
}

// Parse comma-separated keys like "Tab, Ctrl+Y, Space"
export function parseCustomKeys(input: string): ParseResult {
	if (!input.trim()) {
		return { valid: false, keys: [], error: "No keys specified" };
	}

	const parts = input.split(',').map(p => p.trim()).filter(p => p);
	const keys: ParsedKey[] = [];

	for (const part of parts) {
		const result = parseSingleKey(part);
		if (!result.valid) {
			return { valid: false, keys: [], error: result.error };
		}
		keys.push(result.parsed!);
	}

	return { valid: true, keys };
}

export default class SlashSnippetSettingTab extends PluginSettingTab {
	plugin: SlashSnippetPlugin;
	customKeysContainer: HTMLElement | null = null;

	constructor(app: App, plugin: SlashSnippetPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Slash trigger")
			.setDesc(
				"Enter a character that will trigger template insert suggestion"
			)
			.addText((text) =>
				text
					.setPlaceholder("Slash trigger")
					.setValue(this.plugin.settings.slashTrigger)
					.onChange(async (value) => {
						if (value && value.length > 1) {
							new Notice("Please use one character to avoid conflict");
							text.setValue(value[0]);
						} else {
							this.plugin.settings.slashTrigger = value;
							await this.plugin.saveSettings();
						}
					})
			);

		// Accept key preset dropdown
		new Setting(containerEl)
			.setName("Accept key preset")
			.setDesc("Key to accept a snippet from the suggestion list (requires reload)")
			.addDropdown((dropdown) =>
				dropdown
					.addOption('enter', 'Enter')
					.addOption('tab', 'Tab')
					.addOption('tab-space', 'Tab and Space')
					.addOption('custom', 'Custom')
					.setValue(this.plugin.settings.acceptKeyPreset)
					.onChange(async (value) => {
						this.plugin.settings.acceptKeyPreset = value as 'enter' | 'tab' | 'tab-space' | 'custom';
						await this.plugin.saveSettings();
						this.updateCustomKeysVisibility();
					})
			);

		// Custom keys container (conditionally visible)
		this.customKeysContainer = containerEl.createDiv();
		this.renderCustomKeysInput();
		this.updateCustomKeysVisibility();

		new Setting(containerEl)
			.setName("Fuzzy Search")
			.setDesc("You don't have to type the exact name." +
				"If the letters appear in the right order, it will match." +
				"Example: 'btn' → 'Button'.")
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.fuzzySearch)
					.onChange(async (value) => {
						this.plugin.settings.fuzzySearch = value;
						await this.plugin.saveSettings();
					})
			});


		new Setting(containerEl)
			.setName("Highlight")
			.setDesc("Highlight matching terms of search results")
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.highlight)
					.onChange(async (value) => {
						this.plugin.settings.highlight = value;
						await this.plugin.saveSettings();
					})
			});
		new Setting(containerEl)
			.setName("Show full path of the snippet file")
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.showPath)
					.onChange(async (value) => {
						this.plugin.settings.showPath = value;
						await this.plugin.saveSettings();
					})
			});

		new Setting(containerEl)
			.setName("Show snippet content")
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.showFileContent)
					.onChange(async (value) => {
						this.plugin.settings.showFileContent = value;
						await this.plugin.saveSettings();
					})
			});


		new Setting(containerEl)
			.setName("Show last selected text")
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.showSelectedText)
					.onChange(async (value) => {
						this.plugin.settings.showSelectedText = value;
						await this.plugin.saveSettings();
					})
			});



		new Setting(containerEl)
			.setName("Snippet path")
			.setDesc("Set a folder that has all the snippets files")
			.addText((text) =>
				text
					.setPlaceholder("Snippet path")
					.setValue(this.plugin.settings.snippetPath)
					.onChange(async (value) => {
						this.plugin.settings.snippetPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Text Selection")
			.setDesc("Set a variable to replace text with last text selection")
			.addText((text) =>
				text
					.setPlaceholder("%% textSelection %%")
					.setValue(this.plugin.settings.textSelectionString)
					.onChange(async (value) => {
						this.plugin.settings.textSelectionString = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Cursor position")
			.setDesc("Set a variable for where to put the cursor after snippet has inserted")
			.addText((text) =>
				text
					.setPlaceholder("%% cursor %%")
					.setValue(this.plugin.settings.cursorPositionString)
					.onChange(async (value) => {
						this.plugin.settings.cursorPositionString = value;
						await this.plugin.saveSettings();
					})
			);


		new Setting(containerEl)
			.setName("Ignore properties")
			.setDesc("Enable this if you don't want to insert properties values in the snippets notes")
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.ignoreProperties)
					.onChange(async (value) => {
						this.plugin.settings.ignoreProperties = value;
						await this.plugin.saveSettings();
					})
			});


		const templaterDesc = document.createDocumentFragment();
		templaterDesc.append(
			"Enable this if you want to use ",
			templaterDesc.createEl("a", {
				href: "https://github.com/SilentVoid13/Templater",
				text: "Templater"
			}),
			" files inside snippets. (To use this, you need Templater plugin enabled)"
		)
		new Setting(containerEl)
			.setName("Enable Templater plugin support")
			.setDesc(templaterDesc)
			.addToggle((enable) => {
				enable
					.setValue(this.plugin.settings.templaterSupport)
					.onChange(async (value) => {
						this.plugin.settings.templaterSupport = value;
						await this.plugin.saveSettings();
					})
			});
	}

	private renderCustomKeysInput() {
		if (!this.customKeysContainer) return;
		
		this.customKeysContainer.empty();
		
		const setting = new Setting(this.customKeysContainer)
			.setName("Custom accept keys")
			.setDesc("Comma-separated keys. Examples: Tab, Ctrl+Y, Space, Ctrl+J");

		const errorEl = this.customKeysContainer.createDiv({ cls: "setting-item-description" });
		errorEl.style.color = "var(--text-error)";
		errorEl.style.marginTop = "4px";
		errorEl.style.display = "none";

		setting.addText((text) =>
			text
				.setPlaceholder("Tab, Ctrl+Y")
				.setValue(this.plugin.settings.customAcceptKeys)
				.onChange(async (value) => {
					// Validate in real-time
					if (value.trim() === "") {
						errorEl.style.display = "none";
						this.plugin.settings.customAcceptKeys = value;
						await this.plugin.saveSettings();
						return;
					}
					
					const result = parseCustomKeys(value);
					if (result.valid) {
						errorEl.style.display = "none";
						this.plugin.settings.customAcceptKeys = value;
						await this.plugin.saveSettings();
					} else {
						errorEl.textContent = result.error || "Invalid key format";
						errorEl.style.display = "block";
					}
				})
		);
	}

	private updateCustomKeysVisibility() {
		if (!this.customKeysContainer) return;
		
		if (this.plugin.settings.acceptKeyPreset === 'custom') {
			this.customKeysContainer.style.display = "block";
		} else {
			this.customKeysContainer.style.display = "none";
		}
	}
}
