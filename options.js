;(() => {
	const SHARED = globalThis.PromptTubeShared || {}
	const STORAGE_KEY = SHARED.PROMPT_PRESETS_STORAGE_KEY || 'promptPresets'
	const STANDARD_PROMPT_ID = SHARED.STANDARD_PROMPT_ID || 'summary'
	const DEFAULT_PROMPT_PRESETS =
		typeof SHARED.cloneDefaultPromptPresets === 'function'
			? SHARED.cloneDefaultPromptPresets()
			: [
					{
						id: STANDARD_PROMPT_ID,
						label: 'Summary',
						body: 'Please summarise this YouTube transcript.',
					},
			  ]

	const elements = {
		form: document.getElementById('prompt-form'),
		list: document.getElementById('prompt-list'),
		storageMeta: document.getElementById('storage-meta'),
		status: document.getElementById('status'),
		addButton: document.getElementById('add-prompt'),
		resetButton: document.getElementById('reset-defaults'),
		template: document.getElementById('prompt-item-template'),
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

	function getStorageDetails() {
		const api = getExtensionApi()
		if (api?.storage?.sync) return { area: api.storage.sync, mode: 'sync' }
		if (api?.storage?.local) return { area: api.storage.local, mode: 'local' }
		return { area: null, mode: 'unavailable' }
	}

	function cloneDefaultPromptPresets() {
		return DEFAULT_PROMPT_PRESETS.map((preset) => ({ ...preset }))
	}

	function sanitisePromptPresets(input) {
		if (typeof SHARED.sanitisePromptPresets === 'function') {
			return SHARED.sanitisePromptPresets(input)
		}
		return cloneDefaultPromptPresets()
	}

	function slugify(value) {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40)
	}

	function setStatus(message, type = '') {
		elements.status.textContent = message
		elements.status.className = `status${type ? ` ${type}` : ''}`
	}

	function formatBytes(bytes) {
		if (typeof bytes !== 'number' || Number.isNaN(bytes)) return 'unknown size'
		if (bytes < 1024) return `${bytes} B`
		return `${(bytes / 1024).toFixed(1)} KB`
	}

	async function refreshStorageMeta() {
		const { area, mode } = getStorageDetails()

		if (!area?.get) {
			elements.storageMeta.textContent = t(
				'options_storage_unavailable',
				[],
				'Storage is unavailable in this browser context.'
			)
			return
		}

		if (mode !== 'sync') {
			elements.storageMeta.textContent = t(
				'options_storage_local',
				[],
				'Using local-only storage. Prompts will not sync between browsers.'
			)
			return
		}

		if (!area.getBytesInUse) {
			elements.storageMeta.textContent = t(
				'options_storage_sync_generic',
				[],
				'Using sync-backed storage. Prompt data should sync between signed-in browsers that support extension sync.'
			)
			return
		}

		try {
			const bytes = await area.getBytesInUse(STORAGE_KEY)
			elements.storageMeta.textContent = t(
				'options_storage_sync_usage',
				[formatBytes(bytes)],
				`Using sync-backed storage. Prompt data uses ${formatBytes(bytes)} of the sync quota (~100 KB total on Firefox).`
			)
		} catch {
			elements.storageMeta.textContent = t(
				'options_storage_sync_generic',
				[],
				'Using sync-backed storage. Prompt data should sync between signed-in browsers that support extension sync.'
			)
		}
	}

	function updatePromptTitles() {
		const cards = Array.from(elements.list.querySelectorAll('.prompt-card'))
		for (const [index, card] of cards.entries()) {
			const title = card.querySelector('.prompt-card-title')
			title.textContent = t(
				'options_prompt_card_title',
				[String(index + 1)],
				`Prompt ${index + 1}`
			)
		}
	}

	function applyCardState(node) {
		const removeButton = node.querySelector('.remove-btn')
		const promptId = node.dataset.promptId || ''
		const isStandardPrompt = promptId === STANDARD_PROMPT_ID

		removeButton.textContent = t('options_remove', [], 'Remove')
		removeButton.disabled = isStandardPrompt
		removeButton.hidden = false

		if (isStandardPrompt) {
			removeButton.setAttribute(
				'title',
				t(
					'options_standard_prompt_locked',
					[],
					'The Summary prompt is used in Standard mode and cannot be removed.'
				)
			)
		} else {
			removeButton.removeAttribute('title')
		}
	}

	function createPromptCard(preset = {}) {
		const node = elements.template.content.firstElementChild.cloneNode(true)
		node.dataset.promptId = preset.id || ''

		if (typeof SHARED.localizeDocument === 'function') {
			SHARED.localizeDocument(node)
		}

		const labelInput = node.querySelector('.prompt-label')
		const bodyInput = node.querySelector('.prompt-body')
		const removeButton = node.querySelector('.remove-btn')

		labelInput.value = preset.label || ''
		bodyInput.value = preset.body || ''

		removeButton.addEventListener('click', () => {
			node.remove()
			updatePromptTitles()
		})

		applyCardState(node)
		elements.list.appendChild(node)
		updatePromptTitles()
		return node
	}

	function renderPromptCards(prompts) {
		elements.list.textContent = ''
		for (const prompt of prompts) {
			createPromptCard(prompt)
		}
	}

	function collectPromptPresets() {
		const cards = Array.from(elements.list.querySelectorAll('.prompt-card'))
		if (cards.length === 0) {
			throw new Error(t('options_status_add_one', [], 'Add at least one prompt before saving.'))
		}

		const usedIds = new Set()

		return cards.map((card, index) => {
			const label = card.querySelector('.prompt-label').value.trim()
			const body = card.querySelector('.prompt-body').value
				.replace(/\r/g, '')
				.split('\n')
				.map((line) => line.trimEnd())
				.join('\n')
				.trim()

			if (!label) {
				throw new Error(
					t(
						'options_status_missing_label',
						[String(index + 1)],
						`Prompt ${index + 1} is missing a label.`
					)
				)
			}

			if (!body) {
				throw new Error(
					t(
						'options_status_missing_body',
						[String(index + 1)],
						`Prompt ${index + 1} is missing prompt text.`
					)
				)
			}

			let id = card.dataset.promptId.trim()
			if (!id) {
				id = slugify(label) || `custom-${index + 1}`
			}

			while (usedIds.has(id)) {
				id = `${id}-${index + 1}`
			}

			usedIds.add(id)
			card.dataset.promptId = id
			applyCardState(card)

			return { id, label, body }
		})
	}

	async function loadPrompts() {
		const storage = getStorageArea()
		if (!storage?.get) {
			renderPromptCards(DEFAULT_PROMPT_PRESETS)
			setStatus(
				t(
					'options_status_storage_defaults_error',
					[],
					'Storage API unavailable. Showing defaults.'
				),
				'error'
			)
			await refreshStorageMeta()
			return
		}

		try {
			const stored = await storage.get(STORAGE_KEY)
			renderPromptCards(sanitisePromptPresets(stored?.[STORAGE_KEY]))
		} catch {
			renderPromptCards(DEFAULT_PROMPT_PRESETS)
			setStatus(
				t(
					'options_status_load_saved_error',
					[],
					'Could not load saved prompts. Showing defaults.'
				),
				'error'
			)
		}

		await refreshStorageMeta()
	}

	async function savePrompts(event) {
		event.preventDefault()

		let prompts
		try {
			prompts = sanitisePromptPresets(collectPromptPresets())
		} catch (error) {
			setStatus(error.message, 'error')
			return
		}

		const storage = getStorageArea()
		if (!storage?.set) {
			setStatus(
				t(
					'options_status_storage_unavailable',
					[],
					'Storage API unavailable. Prompts were not saved.'
				),
				'error'
			)
			return
		}

		try {
			await storage.set({ [STORAGE_KEY]: prompts })
			renderPromptCards(prompts)
			setStatus(t('options_status_save_success', [], 'Prompts saved.'), 'success')
			await refreshStorageMeta()
		} catch {
			setStatus(t('options_status_save_error', [], 'Could not save prompts.'), 'error')
		}
	}

	async function resetToDefaults() {
		const storage = getStorageArea()
		const prompts = cloneDefaultPromptPresets()

		renderPromptCards(prompts)

		if (!storage?.set) {
			setStatus(
				t(
					'options_status_storage_only_page',
					[],
					'Storage API unavailable. Defaults restored only on this page.'
				),
				'error'
			)
			await refreshStorageMeta()
			return
		}

		try {
			await storage.set({ [STORAGE_KEY]: prompts })
			setStatus(
				t('options_status_restore_success', [], 'Default prompts restored.'),
				'success'
			)
			await refreshStorageMeta()
		} catch {
			setStatus(
				t('options_status_restore_error', [], 'Could not restore defaults.'),
				'error'
			)
		}
	}

	function init() {
		if (typeof SHARED.localizeDocument === 'function') {
			SHARED.localizeDocument(document)
		}

		elements.addButton.addEventListener('click', () => {
			createPromptCard()
			setStatus('')
		})

		elements.resetButton.addEventListener('click', resetToDefaults)
		elements.form.addEventListener('submit', savePrompts)

		loadPrompts()
	}

	init()
})()
