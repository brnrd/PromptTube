;(() => {
	const SHARED = globalThis.PromptTubeShared || {}
	const UI_MODE_STORAGE_KEY = SHARED.UI_MODE_STORAGE_KEY || 'promptUiMode'
	const UI_MODES = SHARED.UI_MODES || {
		STANDARD: 'standard',
		ADVANCED: 'advanced',
	}
	const DEFAULT_UI_MODE = SHARED.DEFAULT_UI_MODE || UI_MODES.STANDARD

	const elements = {
		modeDescription: document.getElementById('mode-description'),
		openSettingsButton: document.getElementById('open-settings'),
		modeButtons: Array.from(document.querySelectorAll('[data-mode]')),
	}

	function t(key, substitutions = [], fallback = '') {
		if (typeof SHARED.getMessage === 'function') {
			return SHARED.getMessage(key, substitutions, fallback)
		}
		return fallback
	}

	function getExtensionApi() {
		if (typeof SHARED.getExtensionApi === 'function') return SHARED.getExtensionApi()
		if (typeof browser !== 'undefined') return browser
		if (typeof chrome !== 'undefined') return chrome
		return null
	}

	function getStorageArea() {
		const api = getExtensionApi()
		return api?.storage?.sync || api?.storage?.local || null
	}

	function normaliseUiMode(value) {
		if (typeof SHARED.normaliseUiMode === 'function') {
			return SHARED.normaliseUiMode(value)
		}
		if (value === UI_MODES.STANDARD || value === UI_MODES.ADVANCED) return value
		return DEFAULT_UI_MODE
	}

	function applyMode(mode) {
		for (const button of elements.modeButtons) {
			const isActive = button.dataset.mode === mode
			button.classList.toggle('is-active', isActive)
			button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
		}

		elements.modeDescription.textContent =
			mode === UI_MODES.STANDARD
				? t(
						'popup_mode_standard_help',
						[],
						'Shows one simple summary prompt button. Edit that prompt in Settings.'
				  )
				: t(
						'popup_mode_advanced_help',
						[],
						'Shows the full prompt selector with all available prompt templates.'
				  )
	}

	async function loadUiMode() {
		const storage = getStorageArea()
		if (!storage?.get) {
			applyMode(DEFAULT_UI_MODE)
			return
		}

		try {
			const stored = await storage.get(UI_MODE_STORAGE_KEY)
			applyMode(normaliseUiMode(stored?.[UI_MODE_STORAGE_KEY]))
		} catch {
			applyMode(DEFAULT_UI_MODE)
		}
	}

	async function setUiMode(mode) {
		const normalisedMode = normaliseUiMode(mode)
		applyMode(normalisedMode)

		const storage = getStorageArea()
		if (!storage?.set) return

		try {
			await storage.set({ [UI_MODE_STORAGE_KEY]: normalisedMode })
		} catch {
			// Keep the UI responsive even if storage fails.
		}
	}

	async function openOptions() {
		const api = getExtensionApi()
		if (!api?.runtime) return false

		try {
			if (api.runtime.openOptionsPage) {
				const maybePromise = api.runtime.openOptionsPage()
				if (maybePromise && typeof maybePromise.then === 'function') {
					await maybePromise
				}
				return true
			}
		} catch {
			// Fallback below.
		}

		if (!api.runtime.getURL) return false

		try {
			const optionsUrl = api.runtime.getURL('options.html')
			window.open(optionsUrl, '_blank', 'noopener,noreferrer')
			return true
		} catch {
			return false
		}
	}

	function init() {
		if (typeof SHARED.localizeDocument === 'function') {
			SHARED.localizeDocument(document)
		}

		for (const button of elements.modeButtons) {
			button.addEventListener('click', async () => {
				await setUiMode(button.dataset.mode || DEFAULT_UI_MODE)
			})
		}

		elements.openSettingsButton.addEventListener('click', async () => {
			const opened = await openOptions()
			if (!opened) return
			window.close()
		})

		loadUiMode()
	}

	init()
})()
