;(() => {
	const openSettingsButton = document.getElementById('open-settings')

	function getExtensionApi() {
		if (typeof browser !== 'undefined') return browser
		if (typeof chrome !== 'undefined') return chrome
		return null
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

	openSettingsButton.addEventListener('click', async () => {
		const opened = await openOptions()
		if (!opened) return
		window.close()
	})
})()
