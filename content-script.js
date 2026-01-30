;(() => {
	// YouTube is an SPA. We need to re-inject on navigation.
	const STATE = {
		lastVideoId: null,
		injectedForVideoId: null,
	}

	function getVideoIdFromUrl() {
		try {
			const url = new URL(window.location.href)
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

	function makePromptedText(transcript) {
		return [
			'Please summarise this YouTube transcript.',
			'Give me:',
			'- a 6-10 bullet summary',
			'- key takeaways',
			'- any actionable items',
			'',
			'Transcript:',
			'',
			transcript,
		].join('\n')
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
		if (!insertionPoint) return

		// Clean any stale instance
		const stale = document.querySelector('.yt-tc-wrap')
		if (stale) stale.remove()

		const wrap = document.createElement('div')
		wrap.className = 'yt-tc-wrap'

		const btnCopyPrompt = document.createElement('button')
		btnCopyPrompt.className = 'yt-tc-btn'
		btnCopyPrompt.type = 'button'
		btnCopyPrompt.textContent = 'Copy prompt + transcript'

		btnCopyPrompt.addEventListener('click', async () => {
			btnCopyPrompt.disabled = true
			btnCopyPrompt.textContent = 'Working…'
			try {
				const transcript = await getTranscriptBestEffort()
				if (!transcript) {
					showToast('No transcript found for this video')
					return
				}

				const text = makeContextualPromptedText(transcript)
				const ok = await copyToClipboard(text)
				showToast(ok ? 'Prompt + transcript copied' : 'Copy failed')
			} finally {
				btnCopyPrompt.disabled = false
				btnCopyPrompt.textContent = 'Copy prompt + transcript'
			}
		})

		wrap.appendChild(btnCopyPrompt)

		// Insert at the start of the action area
		insertionPoint.prepend(wrap)
		STATE.injectedForVideoId = videoId
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
		if (!videoId) return
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

	function makeContextualPromptedText(transcript) {
		return (
			buildContextHeader() +
			[
				'Please summarise this YouTube transcript.',
				'Give me:',
				'- a 6-10 bullet summary',
				'- key takeaways',
				'- any actionable items',
				'',
				'Transcript:',
				'',
				transcript,
			].join('\n')
		)
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
	}

	installObservers()
	onUrlMaybeChanged()
})()