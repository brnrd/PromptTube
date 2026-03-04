;(() => {
	// YouTube is an SPA. We need to re-inject on navigation.
	const STATE = {
		lastVideoId: null,
		injectedForVideoId: null,
		promptPresets: null,
		selectedPresetId: null,
		uiCleanup: null,
	}

	const SHARED = globalThis.PromptTubeShared || {}
	const STORAGE_KEY = SHARED.STORAGE_KEY || 'promptPresets'
	const SETTINGS_HINT_KEY = 'promptSettingsHintSeen'
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

	function getExtensionApi() {
		if (typeof browser !== 'undefined') return browser
		if (typeof chrome !== 'undefined') return chrome
		return null
	}

	function getStorageArea() {
		const api = getExtensionApi()
		return api?.storage?.sync || api?.storage?.local || null
	}

	async function maybeShowSettingsHint() {
		const storage = getStorageArea()
		if (!storage?.get || !storage?.set) return

		try {
			const existing = await storage.get(SETTINGS_HINT_KEY)
			if (existing?.[SETTINGS_HINT_KEY]) return

			showToast('Tip: Use the PromptTube icon to manage prompts')
			await storage.set({ [SETTINGS_HINT_KEY]: true })
		} catch {
			// Non-blocking hint.
		}
	}

	function sanitisePromptPresets(input) {
		if (!Array.isArray(input)) return DEFAULT_PROMPT_PRESETS

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

		return presets.length > 0 ? presets : DEFAULT_PROMPT_PRESETS
	}

	function getPromptPresets() {
		return STATE.promptPresets || DEFAULT_PROMPT_PRESETS
	}

	function cleanupUi() {
		if (typeof STATE.uiCleanup === 'function') {
			STATE.uiCleanup()
			STATE.uiCleanup = null
		}
	}

	async function loadPromptPresets() {
		const storage = getStorageArea()
		if (!storage?.get) {
			STATE.promptPresets = DEFAULT_PROMPT_PRESETS
			return getPromptPresets()
		}

		try {
			const stored = await storage.get(STORAGE_KEY)
			STATE.promptPresets = sanitisePromptPresets(stored?.[STORAGE_KEY])
		} catch {
			STATE.promptPresets = DEFAULT_PROMPT_PRESETS
		}

		return getPromptPresets()
	}

	function installStorageListener() {
		const api = getExtensionApi()
		if (!api?.storage?.onChanged?.addListener) return

		api.storage.onChanged.addListener((changes) => {
			if (!changes?.[STORAGE_KEY]) return

			STATE.promptPresets = sanitisePromptPresets(changes[STORAGE_KEY].newValue)
			STATE.injectedForVideoId = null
			injectButtons()
		})
	}

	function getVideoIdFromUrl() {
		try {
			const url = new URL(window.location.href)
			if (url.pathname !== '/watch') return null
			return url.searchParams.get('v')
		} catch {
			return null
		}
	}

	function sleep(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	function showToast(message) {
		const existing = document.querySelector('.yt-tc-toast')
		if (existing) existing.remove()

		const el = document.createElement('div')
		el.className = 'yt-tc-toast'
		el.textContent = message
		document.documentElement.appendChild(el)

		setTimeout(() => {
			el.remove()
		}, 2200)
	}

	async function copyToClipboard(text) {
		// Try modern clipboard API first
		try {
			await navigator.clipboard.writeText(text)
			return true
		} catch {
			// Fallback: temporary textarea
			try {
				const ta = document.createElement('textarea')
				ta.value = text
				ta.setAttribute('readonly', '')
				ta.style.position = 'fixed'
				ta.style.top = '-1000px'
				ta.style.left = '-1000px'
				document.body.appendChild(ta)
				ta.select()
				const ok = document.execCommand('copy')
				ta.remove()
				return ok
			} catch {
				return false
			}
		}
	}

	function normaliseWhitespace(s) {
		return s
			.replace(/\r/g, '')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)
			.join('\n')
	}

	function getPromptPreset(presetId) {
		const presets = getPromptPresets()
		return (
			presets.find((preset) => preset.id === presetId) || presets[0]
		)
	}

	function makePromptedText(transcript, presetId) {
		const preset = getPromptPreset(presetId)
		return [preset.body, '', 'Transcript:', '', transcript].join('\n')
	}

	function findInsertionPoint() {
		// Best place: the action bar row (Like/Share/etc)
		// On most layouts, #top-level-buttons-computed exists under ytd-menu-renderer.
		return (
			document.querySelector('ytd-watch-metadata #top-level-buttons-computed') ||
			document.querySelector('ytd-watch-metadata #actions') ||
			document.querySelector('ytd-watch-metadata') ||
			null
		)
	}

	function alreadyInjected() {
		return Boolean(document.querySelector('.yt-tc-wrap'))
	}

	function injectButtons() {
		const videoId = getVideoIdFromUrl()
		if (!videoId) return
		if (STATE.injectedForVideoId === videoId && alreadyInjected()) return

		const insertionPoint = findInsertionPoint()
		if (!insertionPoint) {
			if (!alreadyInjected()) cleanupUi()
			return
		}

		// Clean any stale instance
		cleanupUi()
		const stale = document.querySelector('.yt-tc-wrap')
		if (stale) stale.remove()

		const wrap = document.createElement('div')
		wrap.className = 'yt-tc-wrap'

		const presets = getPromptPresets()
		const split = document.createElement('div')
		split.className = 'yt-tc-split'

		const btnCopyPrompt = document.createElement('button')
		btnCopyPrompt.className = 'yt-tc-main-btn'
		btnCopyPrompt.type = 'button'
		btnCopyPrompt.title = 'Copy prompt + transcript'

		const btnMenu = document.createElement('button')
		btnMenu.className = 'yt-tc-caret-btn'
		btnMenu.type = 'button'
		btnMenu.setAttribute('aria-label', 'Choose prompt template')
		btnMenu.setAttribute('aria-expanded', 'false')
		btnMenu.textContent = '▾'

		const menu = document.createElement('div')
		menu.className = 'yt-tc-menu'
		menu.hidden = true

		let selectedPresetId = STATE.selectedPresetId || presets[0]?.id || null

		function closeMenu() {
			menu.hidden = true
			btnMenu.setAttribute('aria-expanded', 'false')
		}

		function positionMenu() {
			const anchorRect = split.getBoundingClientRect()
			const menuRect = menu.getBoundingClientRect()
			const menuWidth = menuRect.width || 240
			const menuHeight = menuRect.height || 200
			const viewportPadding = 8

			const clampedLeft = Math.min(
				Math.max(viewportPadding, anchorRect.left),
				window.innerWidth - menuWidth - viewportPadding
			)

			const belowTop = anchorRect.bottom + 8
			const aboveTop = anchorRect.top - menuHeight - 8
			const top =
				belowTop + menuHeight <= window.innerHeight - viewportPadding
					? belowTop
					: Math.max(viewportPadding, aboveTop)

			menu.style.left = `${Math.round(clampedLeft)}px`
			menu.style.top = `${Math.round(top)}px`
		}

		function openMenu() {
			if (!menu.isConnected) document.body.appendChild(menu)
			menu.hidden = false
			menu.style.visibility = 'hidden'
			positionMenu()
			menu.style.visibility = ''
			btnMenu.setAttribute('aria-expanded', 'true')
		}

		function updateMainLabel() {
			const preset = getPromptPreset(selectedPresetId)
			selectedPresetId = preset?.id || presets[0]?.id || null
			STATE.selectedPresetId = selectedPresetId
			btnCopyPrompt.textContent = preset?.label
				? `Copy prompt: ${preset.label}`
				: 'Copy prompt'
		}

		function rebuildMenu() {
			menu.textContent = ''

			for (const preset of presets) {
				const item = document.createElement('button')
				item.type = 'button'
				item.className = 'yt-tc-menu-item'
				item.textContent =
					preset.id === selectedPresetId ? `✓ ${preset.label}` : preset.label
				item.addEventListener('click', () => {
					selectedPresetId = preset.id
					updateMainLabel()
					rebuildMenu()
					closeMenu()
					showToast(`Prompt: ${preset.label}`)
				})
				menu.appendChild(item)
			}

		}

		btnMenu.addEventListener('click', (event) => {
			event.stopPropagation()
			if (menu.hidden) openMenu()
			else closeMenu()
		})

		const onDocumentClick = (event) => {
			if (!wrap.contains(event.target) && !menu.contains(event.target)) {
				closeMenu()
			}
		}

		const onDocumentKeydown = (event) => {
			if (event.key === 'Escape') closeMenu()
		}

		const onViewportChange = () => {
			if (!menu.hidden) positionMenu()
		}

		document.addEventListener('click', onDocumentClick, true)
		document.addEventListener('keydown', onDocumentKeydown)
		window.addEventListener('resize', onViewportChange)
		window.addEventListener('scroll', onViewportChange, true)
		STATE.uiCleanup = () => {
			document.removeEventListener('click', onDocumentClick, true)
			document.removeEventListener('keydown', onDocumentKeydown)
			window.removeEventListener('resize', onViewportChange)
			window.removeEventListener('scroll', onViewportChange, true)
			if (menu.isConnected) menu.remove()
		}

		btnCopyPrompt.addEventListener('click', async () => {
			btnCopyPrompt.disabled = true
			btnMenu.disabled = true
			const previousLabel = btnCopyPrompt.textContent
			btnCopyPrompt.textContent = 'Working…'
			try {
				const transcript = await getTranscriptBestEffort()
				if (!transcript) {
					showToast('No transcript found for this video')
					return
				}

				const text = makeContextualPromptedText(transcript, selectedPresetId)
				const ok = await copyToClipboard(text)
				showToast(ok ? 'Prompt + transcript copied' : 'Copy failed')
			} finally {
				btnCopyPrompt.disabled = false
				btnMenu.disabled = false
				btnCopyPrompt.textContent = previousLabel
			}
		})

		updateMainLabel()
		rebuildMenu()

		split.appendChild(btnCopyPrompt)
		split.appendChild(btnMenu)
		wrap.appendChild(split)

		// Insert at the start of the action area
		insertionPoint.prepend(wrap)
		STATE.injectedForVideoId = videoId
		maybeShowSettingsHint()
	}

	async function getTranscriptBestEffort() {
	// Strategy 1: If panel already open, read it
	const fromDom = getTranscriptFromOpenPanel()
	if (fromDom) return fromDom

	// New: Try to open transcript UI, then read it from DOM
	const opened = await ensureTranscriptPanelOpen()
	if (opened) {
		const afterOpen = getTranscriptFromOpenPanel()
		if (afterOpen) return afterOpen
	}

	// Strategy 2: Fetch captions via timedtext
	const fromTimedText = await getTranscriptFromTimedText()
	if (fromTimedText) return fromTimedText

	return null
}

	function getTranscriptFromOpenPanel() {
		// When transcript panel is open, captions typically appear as segments:
		// ytd-transcript-segment-renderer contains text in #segment-text or similar.
		const segmentTexts = Array.from(
			document.querySelectorAll(
				'ytd-transcript-segment-renderer #segment-text, ytd-transcript-segment-renderer .segment-text'
			)
		)
			.map((el) => el.textContent || '')
			.map((s) => s.trim())
			.filter(Boolean)

		if (segmentTexts.length > 0) {
			return normaliseWhitespace(segmentTexts.join('\n'))
		}

		return null
	}

	function readInitialPlayerResponse() {
		// Often available as window.ytInitialPlayerResponse
		// If not, sometimes embedded in a script tag.
		if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse

		const scripts = Array.from(document.scripts)
		for (const script of scripts) {
			const txt = script.textContent || ''
			if (!txt.includes('ytInitialPlayerResponse')) continue

			// Try to extract JSON object
			const m = txt.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;/s)
			if (m && m[1]) {
				try {
					return JSON.parse(m[1])
				} catch {
					// ignore
				}
			}
		}

		return null
	}

	function pickBestCaptionTrack(tracks) {
		// Prefer English (manual), then English (auto), then anything
		const normalised = tracks.map((t) => ({
			...t,
			lang: (t.languageCode || '').toLowerCase(),
			isAuto: Boolean(t.kind === 'asr'),
		}))

		const exactEn = normalised.find((t) => t.lang === 'en' && !t.isAuto)
		if (exactEn) return exactEn

		const exactEnAuto = normalised.find((t) => t.lang === 'en')
		if (exactEnAuto) return exactEnAuto

		const anyManual = normalised.find((t) => !t.isAuto)
		if (anyManual) return anyManual

		return normalised[0] || null
	}

	async function getTranscriptFromTimedText() {
		const player = readInitialPlayerResponse()
		const tracks =
			player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null

		if (!tracks || tracks.length === 0) return null

		const track = pickBestCaptionTrack(tracks)
		if (!track?.baseUrl) return null

		// Fetch as JSON3 (more stable to parse than XML in JS)
		const url = new URL(track.baseUrl)
		url.searchParams.set('fmt', 'json3')

		let resp
		try {
			resp = await fetch(url.toString(), {
				credentials: 'omit',
			})
		} catch {
			return null
		}

		if (!resp.ok) return null

		let data
		try {
			data = await resp.json()
		} catch {
			return null
		}

		// json3 format has events[].segs[].utf8
		const events = Array.isArray(data?.events) ? data.events : []
		const lines = []

		for (const ev of events) {
			const segs = Array.isArray(ev?.segs) ? ev.segs : []
			const text = segs.map((s) => s.utf8 || '').join('')
			const cleaned = text.replace(/\u200b/g, '').trim()
			if (cleaned) lines.push(cleaned)
		}

		if (lines.length === 0) return null

		return normaliseWhitespace(lines.join('\n'))
	}

	async function tryInjectLoop() {
		// Attempt injection a few times because YouTube loads chunks late.
		for (let i = 0; i < 20; i++) {
			injectButtons()
			if (alreadyInjected()) return
			await sleep(500)
		}
	}

	function onUrlMaybeChanged() {
		const videoId = getVideoIdFromUrl()
		if (!videoId) {
			STATE.lastVideoId = null
			STATE.injectedForVideoId = null
			cleanupUi()

			const stale = document.querySelector('.yt-tc-wrap')
			if (stale) stale.remove()
			return
		}
		if (STATE.lastVideoId === videoId) return

		STATE.lastVideoId = videoId
		STATE.injectedForVideoId = null
		tryInjectLoop()
	}

	async function ensureTranscriptPanelOpen() {
		// If it’s already there, we’re done
		if (document.querySelector('ytd-transcript-segment-renderer')) return true

		// Give the page a moment to settle (YouTube SPA races are real)
		await sleep(200)

		// Attempt A: Direct "Show transcript" button (some layouts)
		if (await clickShowTranscriptDirect()) {
			await waitForTranscriptDom()
			return Boolean(document.querySelector('ytd-transcript-segment-renderer'))
		}

		// Attempt B: Expand description (some layouts only reveal transcript entry after expand)
		await maybeExpandDescription()

		// Retry direct after expanding
		if (await clickShowTranscriptDirect()) {
			await waitForTranscriptDom()
			return Boolean(document.querySelector('ytd-transcript-segment-renderer'))
		}

		// Attempt C: Open overflow menu (three dots) and click "Show transcript"
		if (await clickShowTranscriptFromMenu()) {
			await waitForTranscriptDom()
			return Boolean(document.querySelector('ytd-transcript-segment-renderer'))
		}

		return false
	}

	async function waitForTranscriptDom() {
		// Wait up to ~3 seconds for transcript to render
		for (let i = 0; i < 15; i++) {
			if (document.querySelector('ytd-transcript-segment-renderer')) return true
			await sleep(200)
		}
		return false
	}

	async function maybeExpandDescription() {
		// Try common "Show more" expanders
		// Note: selectors differ between layouts; we try a few.
		const candidates = [
			// Newer layouts often have an expander in ytd-text-inline-expander
			'ytd-watch-metadata ytd-text-inline-expander #expand',
			'ytd-watch-metadata ytd-text-inline-expander tp-yt-paper-button#expand',
			// Sometimes it's a button with aria-label
			'ytd-watch-metadata button[aria-label]',
		]

		for (const sel of candidates) {
			const el = document.querySelector(sel)
			if (!el) continue

			// Avoid clicking random buttons: only click if it looks like an expander
			const label = (el.getAttribute('aria-label') || el.textContent || '').toLowerCase()
			if (label.includes('show more') || label.includes('plus') || label.includes('more')) {
				el.click()
				await sleep(200)
				return true
			}
		}

		return false
	}

	async function clickShowTranscriptDirect() {
		// Try to find a visible "Show transcript" control without opening menus.
		// We prefer aria-label/title because text can be nested.
		const buttons = Array.from(
			document.querySelectorAll('button, tp-yt-paper-button, yt-button-shape button')
		)

		const matches = (s) => {
			const t = (s || '').toLowerCase()
			// English + French (since you’re in France), add more if you like
			return (
				t.includes('show transcript') ||
				t.includes('open transcript') ||
				t.includes('transcript') ||
				t.includes('afficher la transcription') ||
				t.includes('transcription')
			)
		}

		for (const b of buttons) {
			// Ignore hidden/disabled
			if (b.disabled) continue
			const rect = b.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) continue

			const label = [
				b.getAttribute('aria-label'),
				b.getAttribute('title'),
				b.textContent,
			]
				.filter(Boolean)
				.join(' | ')

			if (!matches(label)) continue

			// Extra guard: avoid clicking captions toggle etc by requiring transcript-ish label
			b.click()
			await sleep(250)
			return true
		}

		return false
	}

	async function clickShowTranscriptFromMenu() {
		// Open the overflow menu (three dots) then click transcript entry.
		// Menu button selectors vary, so we try common ones.
		const menuButtons = [
			// Often in the action bar
			'ytd-watch-metadata ytd-menu-renderer yt-icon-button',
			// Sometimes a button with aria-label containing "More actions"
			'ytd-watch-metadata button[aria-label*="More"]',
			'ytd-watch-metadata button[aria-label*="Plus"]',
		]

		let openedMenu = false
		for (const sel of menuButtons) {
			const btns = Array.from(document.querySelectorAll(sel))
			for (const btn of btns) {
				const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase()
				if (
					label.includes('more actions') ||
					label.includes('more') ||
					label.includes('plus') ||
					label.includes('actions')
				) {
					btn.click()
					openedMenu = true
					await sleep(250)
					break
				}
			}
			if (openedMenu) break
		}

		if (!openedMenu) return false

		// Now find a menu item that looks like "Show transcript"
		// YouTube menus often use tp-yt-paper-item or ytd-menu-service-item-renderer.
		const items = Array.from(
			document.querySelectorAll(
				'tp-yt-paper-item, ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer'
			)
		)

		const matches = (s) => {
			const t = (s || '').toLowerCase()
			return (
				t.includes('show transcript') ||
				t.includes('transcript') ||
				t.includes('afficher la transcription') ||
				t.includes('transcription')
			)
		}

		for (const item of items) {
			const text = (item.textContent || '').trim()
			if (!matches(text)) continue
			item.click()
			await sleep(250)
			return true
		}

		// Close menu by clicking outside (optional)
		document.body.click()
		return false
	}

	function getVideoTitle() {
		// Most reliable: watch-metadata title
		const el =
			document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
			document.querySelector('h1.title yt-formatted-string') ||
			document.querySelector('meta[name="title"]')

		if (!el) return null

		if (el.tagName.toLowerCase() === 'meta') {
			return el.getAttribute('content')?.trim() || null
		}

		return (el.textContent || '').trim() || null
	}

	function getChannelName() {
		// Channel name near the subscribe button area
		const el =
			document.querySelector('#owner ytd-channel-name a') ||
			document.querySelector('ytd-video-owner-renderer ytd-channel-name a') ||
			document.querySelector('ytd-video-owner-renderer a.yt-simple-endpoint') ||
			document.querySelector('meta[itemprop="author"]')

		if (!el) return null

		if (el.tagName.toLowerCase() === 'meta') {
			return el.getAttribute('content')?.trim() || null
		}

		return (el.textContent || '').trim() || null
	}

	function buildContextHeader() {
		const title = getVideoTitle() || 'Unknown title'
		const channel = getChannelName() || 'Unknown channel'
		const url = window.location.href

		return [
			`Title: ${title}`,
			`Channel: ${channel}`,
			`URL: ${url}`,
			'',
		].join('\n')
	}

	function makeContextualTranscript(transcript) {
		return buildContextHeader() + transcript
	}

	function makeContextualPromptedText(transcript, presetId) {
		return buildContextHeader() + makePromptedText(transcript, presetId)
	}

	// Observe SPA navigations by watching URL changes and key DOM mutations.
	function installObservers() {
		// 1) MutationObserver (DOM changes frequently on YouTube)
		const mo = new MutationObserver(() => {
			onUrlMaybeChanged()
			// Also try inject in case buttons got removed by re-render
			injectButtons()
		})
		mo.observe(document.documentElement, { childList: true, subtree: true })

		// 2) Hook history API for SPA navigation
		const origPush = history.pushState
		history.pushState = function (...args) {
			origPush.apply(this, args)
			onUrlMaybeChanged()
		}

		const origReplace = history.replaceState
		history.replaceState = function (...args) {
			origReplace.apply(this, args)
			onUrlMaybeChanged()
		}

		window.addEventListener('popstate', onUrlMaybeChanged)
		window.addEventListener('yt-navigate-start', onUrlMaybeChanged)
		window.addEventListener('yt-navigate-finish', onUrlMaybeChanged)
	}

	async function init() {
		await loadPromptPresets()
		installStorageListener()
		installObservers()
		onUrlMaybeChanged()
	}

	init()
})()
