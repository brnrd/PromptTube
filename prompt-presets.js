;(() => {
	const PROMPT_PRESETS_STORAGE_KEY = 'promptPresets'
	const UI_MODE_STORAGE_KEY = 'promptUiMode'
	const SETTINGS_HINT_STORAGE_KEY = 'promptSettingsHintSeen'
	const STANDARD_PROMPT_ID = 'summary'
	const UI_MODES = {
		STANDARD: 'standard',
		ADVANCED: 'advanced',
	}
	const DEFAULT_UI_MODE = UI_MODES.STANDARD

	function getExtensionApi() {
		if (typeof browser !== 'undefined') return browser
		if (typeof chrome !== 'undefined') return chrome
		return null
	}

	function getMessage(key, substitutions = [], fallback = '') {
		try {
			const api = getExtensionApi()
			const message = api?.i18n?.getMessage?.(key, substitutions)
			return message || fallback
		} catch {
			return fallback
		}
	}

	function localizeDocument(root = document) {
		const nodes = root.querySelectorAll('[data-i18n]')
		for (const node of nodes) {
			const key = node.getAttribute('data-i18n')
			if (!key) continue
			const message = getMessage(key, [], node.textContent || '')
			node.textContent = message
		}

		const placeholderNodes = root.querySelectorAll('[data-i18n-placeholder]')
		for (const node of placeholderNodes) {
			const key = node.getAttribute('data-i18n-placeholder')
			if (!key) continue
			node.setAttribute(
				'placeholder',
				getMessage(key, [], node.getAttribute('placeholder') || '')
			)
		}

		const titleNodes = root.querySelectorAll('[data-i18n-title]')
		for (const node of titleNodes) {
			const key = node.getAttribute('data-i18n-title')
			if (!key) continue
			node.setAttribute('title', getMessage(key, [], node.getAttribute('title') || ''))
		}

		const ariaNodes = root.querySelectorAll('[data-i18n-aria-label]')
		for (const node of ariaNodes) {
			const key = node.getAttribute('data-i18n-aria-label')
			if (!key) continue
			node.setAttribute(
				'aria-label',
				getMessage(key, [], node.getAttribute('aria-label') || '')
			)
		}
	}

	function clonePromptPreset(preset) {
		return { ...preset }
	}

	function toBodyMessage(key, fallback) {
		return getMessage(key, [], fallback)
	}

	function buildDefaultPromptPresets() {
		return [
			{
				id: STANDARD_PROMPT_ID,
				label: getMessage('preset_summary_label', [], 'Summary'),
				body: toBodyMessage(
					'preset_summary_body',
					[
						'Please summarise this YouTube transcript.',
						'Give me:',
						'- a concise summary',
						'- the key takeaways',
						'- the main conclusion in one short paragraph',
					].join('\n')
				),
			},
			{
				id: 'summary-analysis',
				label: getMessage('preset_summary_analysis_label', [], 'Summary + analysis'),
				body: toBodyMessage(
					'preset_summary_analysis_body',
					[
						'Please summarise and analyse this YouTube transcript.',
						'Give me:',
						'- a 6-10 bullet summary',
						'- the main themes or arguments',
						'- what matters most and why',
						'- any notable strengths, weaknesses, or assumptions',
					].join('\n')
				),
			},
			{
				id: 'summary-actions',
				label: getMessage('preset_summary_actions_label', [], 'Summary + actions'),
				body: toBodyMessage(
					'preset_summary_actions_body',
					[
						'Please summarise this YouTube transcript and extract next steps.',
						'Give me:',
						'- a concise summary',
						'- key takeaways',
						'- clear action items',
						'- any decisions or follow-ups worth tracking',
					].join('\n')
				),
			},
			{
				id: 'summary-fact-check',
				label: getMessage('preset_summary_fact_check_label', [], 'Summary + fact check'),
				body: toBodyMessage(
					'preset_summary_fact_check_body',
					[
						'Please summarise this YouTube transcript and flag anything that should be fact-checked.',
						'Give me:',
						'- a concise summary',
						'- the main claims made',
						'- any statements that seem uncertain, exaggerated, or likely to need verification',
						'- a short fact-check checklist of what to verify first',
						'Then do the fact-checking and give me:',
						'- a summary of what you found',
						'- any claims that were confirmed, debunked, or remain uncertain after checking',
					].join('\n')
				),
			},
			{
				id: 'executive-brief',
				label: getMessage('preset_executive_brief_label', [], 'Executive brief'),
				body: toBodyMessage(
					'preset_executive_brief_body',
					[
						'Turn this YouTube transcript into an executive brief.',
						'Give me:',
						'- a short high-level overview',
						'- the most important insights',
						'- business or strategic implications',
						'- the top risks or opportunities',
					].join('\n')
				),
			},
			{
				id: 'study-notes',
				label: getMessage('preset_study_notes_label', [], 'Study notes'),
				body: toBodyMessage(
					'preset_study_notes_body',
					[
						'Convert this YouTube transcript into study notes.',
						'Give me:',
						'- a structured summary by topic',
						'- important definitions or concepts',
						'- likely exam or discussion questions',
						'- a short recap I can review quickly later',
					].join('\n')
				),
			},
			{
				id: 'critique-opportunities',
				label: getMessage(
					'preset_critique_opportunities_label',
					[],
					'Critique + opportunities'
				),
				body: toBodyMessage(
					'preset_critique_opportunities_body',
					[
						'Review this YouTube transcript critically.',
						'Give me:',
						'- a concise summary',
						'- what is convincing or useful',
						'- what is missing, weak, or questionable',
						'- ideas, opportunities, or improvements inspired by it',
					].join('\n')
				),
			},
		]
	}

	function cloneDefaultPromptPresets() {
		return buildDefaultPromptPresets().map(clonePromptPreset)
	}

	function getDefaultPromptPresetById(presetId) {
		return cloneDefaultPromptPresets().find((preset) => preset.id === presetId) || null
	}

	function ensureStandardPromptPreset(presets) {
		const nextPresets = Array.isArray(presets) ? presets.map(clonePromptPreset) : []
		const standardPreset =
			getDefaultPromptPresetById(STANDARD_PROMPT_ID) || cloneDefaultPromptPresets()[0]
		const standardIndex = nextPresets.findIndex(
			(preset) => preset.id === STANDARD_PROMPT_ID
		)

		if (standardIndex === -1) {
			return [standardPreset, ...nextPresets]
		}

		if (!nextPresets[standardIndex].label) {
			nextPresets[standardIndex].label = standardPreset.label
		}
		if (!nextPresets[standardIndex].body) {
			nextPresets[standardIndex].body = standardPreset.body
		}

		return nextPresets
	}

	function sanitisePromptPresets(input) {
		if (!Array.isArray(input)) return cloneDefaultPromptPresets()

		const presets = input
			.map((preset, index) => {
				const label = typeof preset?.label === 'string' ? preset.label.trim() : ''
				const body =
					typeof preset?.body === 'string'
						? preset.body
						: Array.isArray(preset?.lines)
							? preset.lines.join('\n')
							: ''

				const cleanBody = body
					.replace(/\r/g, '')
					.split('\n')
					.map((line) => line.trimEnd())
					.join('\n')
					.trim()

				if (!label || !cleanBody) return null

				return {
					id:
						typeof preset?.id === 'string' && preset.id.trim()
							? preset.id.trim()
							: `custom-${index + 1}`,
					label,
					body: cleanBody,
				}
			})
			.filter(Boolean)

		if (presets.length === 0) return cloneDefaultPromptPresets()
		return ensureStandardPromptPreset(presets)
	}

	function normaliseUiMode(value) {
		if (value === UI_MODES.STANDARD || value === UI_MODES.ADVANCED) return value
		return DEFAULT_UI_MODE
	}

	globalThis.PromptTubeShared = {
		getExtensionApi,
		getMessage,
		localizeDocument,
		PROMPT_PRESETS_STORAGE_KEY,
		UI_MODE_STORAGE_KEY,
		SETTINGS_HINT_STORAGE_KEY,
		STANDARD_PROMPT_ID,
		UI_MODES,
		DEFAULT_UI_MODE,
		cloneDefaultPromptPresets,
		getDefaultPromptPresetById,
		sanitisePromptPresets,
		normaliseUiMode,
	}
})()
