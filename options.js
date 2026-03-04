;(() => {
	const SHARED = globalThis.PromptTubeShared || {}
	const STORAGE_KEY = SHARED.STORAGE_KEY || 'promptPresets'
	const FALLBACK_PROMPT_PRESETS = [
		{
			id: 'summary',
			label: 'Summary',
			body: 'Please summarise this YouTube transcript.',
		},
	]
	const DEFAULT_PROMPT_PRESETS =
		typeof SHARED.cloneDefaultPromptPresets === 'function'
			? SHARED.cloneDefaultPromptPresets()
			: FALLBACK_PROMPT_PRESETS

	const elements = {
		form: document.getElementById('prompt-form'),
		list: document.getElementById('prompt-list'),
		storageMeta: document.getElementById('storage-meta'),
		status: document.getElementById('status'),
		addButton: document.getElementById('add-prompt'),
		resetButton: document.getElementById('reset-defaults'),
		template: document.getElementById('prompt-item-template'),
	}

	function getExtensionApi() {
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
		if (api?.storage?.sync) {
			return {
				area: api.storage.sync,
				mode: 'sync',
			}
		}

		if (api?.storage?.local) {
			return {
				area: api.storage.local,
				mode: 'local',
			}
		}

		return {
			area: null,
			mode: 'unavailable',
		}
	}

	function cloneDefaultPromptPresets() {
		return DEFAULT_PROMPT_PRESETS.map((preset) => ({ ...preset }))
	}

	function sanitisePromptPresets(input) {
		if (!Array.isArray(input)) return DEFAULT_PROMPT_PRESETS

		const prompts = input
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

		return prompts.length > 0 ? prompts : DEFAULT_PROMPT_PRESETS
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
			elements.storageMeta.textContent = 'Storage is unavailable in this browser context.'
			return
		}

		if (mode !== 'sync') {
			elements.storageMeta.textContent =
				'Using local-only storage. Prompts will not sync between browsers.'
			return
		}

		if (!area.getBytesInUse) {
			elements.storageMeta.textContent =
				'Using sync-backed storage. Prompt data should sync between signed-in browsers that support extension sync.'
			return
		}

		try {
			const bytes = await area.getBytesInUse(STORAGE_KEY)
			elements.storageMeta.textContent =
				`Using sync-backed storage. Prompt data uses ${formatBytes(bytes)} of the sync quota (~100 KB total on Firefox).`
		} catch {
			elements.storageMeta.textContent =
				'Using sync-backed storage. Prompt data should sync between signed-in browsers that support extension sync.'
		}
	}

	function createPromptCard(preset = {}) {
		const node = elements.template.content.firstElementChild.cloneNode(true)
		node.dataset.promptId = preset.id || ''

		const labelInput = node.querySelector('.prompt-label')
		const bodyInput = node.querySelector('.prompt-body')
		const removeButton = node.querySelector('.remove-btn')

		labelInput.value = preset.label || ''
		bodyInput.value = preset.body || ''

		removeButton.addEventListener('click', () => {
			node.remove()
			updatePromptTitles()
		})

		elements.list.appendChild(node)
		updatePromptTitles()
		return node
	}

	function updatePromptTitles() {
		const cards = Array.from(elements.list.querySelectorAll('.prompt-card'))
		for (const [index, card] of cards.entries()) {
			const title = card.querySelector('.prompt-card-title')
			title.textContent = `Prompt ${index + 1}`
		}
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
			throw new Error('Add at least one prompt before saving.')
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
				throw new Error(`Prompt ${index + 1} is missing a label.`)
			}

			if (!body) {
				throw new Error(`Prompt ${index + 1} is missing prompt text.`)
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

			return { id, label, body }
		})
	}

	async function loadPrompts() {
		const storage = getStorageArea()
		if (!storage?.get) {
			renderPromptCards(DEFAULT_PROMPT_PRESETS)
			setStatus('Storage API unavailable. Showing defaults.', 'error')
			await refreshStorageMeta()
			return
		}

		try {
			const stored = await storage.get(STORAGE_KEY)
			renderPromptCards(sanitisePromptPresets(stored?.[STORAGE_KEY]))
		} catch {
			renderPromptCards(DEFAULT_PROMPT_PRESETS)
			setStatus('Could not load saved prompts. Showing defaults.', 'error')
		}

		await refreshStorageMeta()
	}

	async function savePrompts(event) {
		event.preventDefault()

		let prompts
		try {
			prompts = collectPromptPresets()
		} catch (error) {
			setStatus(error.message, 'error')
			return
		}

		const storage = getStorageArea()
		if (!storage?.set) {
			setStatus('Storage API unavailable. Prompts were not saved.', 'error')
			return
		}

		try {
			await storage.set({ [STORAGE_KEY]: prompts })
			setStatus('Prompts saved.', 'success')
			await refreshStorageMeta()
		} catch {
			setStatus('Could not save prompts.', 'error')
		}
	}

	async function resetToDefaults() {
		const storage = getStorageArea()
		const prompts = cloneDefaultPromptPresets()

		renderPromptCards(prompts)

		if (!storage?.set) {
			setStatus('Storage API unavailable. Defaults restored only on this page.', 'error')
			await refreshStorageMeta()
			return
		}

		try {
			await storage.set({ [STORAGE_KEY]: prompts })
			setStatus('Default prompts restored.', 'success')
			await refreshStorageMeta()
		} catch {
			setStatus('Could not restore defaults.', 'error')
		}
	}

	function init() {
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
