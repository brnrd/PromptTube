;(() => {
	const STORAGE_KEY = 'promptPresets'

	function toMultilineText(lines) {
		return lines.join('\n')
	}

	const DEFAULT_PROMPT_PRESETS = [
		{
			id: 'summary-analysis',
			label: 'Summary + analysis',
			body: toMultilineText([
				'Please summarise and analyse this YouTube transcript.',
				'Give me:',
				'- a 6-10 bullet summary',
				'- the main themes or arguments',
				'- what matters most and why',
				'- any notable strengths, weaknesses, or assumptions',
			]),
		},
		{
			id: 'summary-actions',
			label: 'Summary + actions',
			body: toMultilineText([
				'Please summarise this YouTube transcript and extract next steps.',
				'Give me:',
				'- a concise summary',
				'- key takeaways',
				'- clear action items',
				'- any decisions or follow-ups worth tracking',
			]),
		},
		{
			id: 'summary-fact-check',
			label: 'Summary + fact check',
			body: toMultilineText([
				'Please summarise this YouTube transcript and flag anything that should be fact-checked.',
				'Give me:',
				'- a concise summary',
				'- the main claims made',
				'- any statements that seem uncertain, exaggerated, or likely to need verification',
				'- a short fact-check checklist of what to verify first',,
				'Then do the fact-checking and give me:',
				'- a summary of what you found',
				'- any claims that were confirmed, debunked, or remain uncertain after checking',
			]),
		},
		{
			id: 'executive-brief',
			label: 'Executive brief',
			body: toMultilineText([
				'Turn this YouTube transcript into an executive brief.',
				'Give me:',
				'- a short high-level overview',
				'- the most important insights',
				'- business or strategic implications',
				'- the top risks or opportunities',
			]),
		},
		{
			id: 'study-notes',
			label: 'Study notes',
			body: toMultilineText([
				'Convert this YouTube transcript into study notes.',
				'Give me:',
				'- a structured summary by topic',
				'- important definitions or concepts',
				'- likely exam or discussion questions',
				'- a short recap I can review quickly later',
			]),
		},
		{
			id: 'critique-opportunities',
			label: 'Critique + opportunities',
			body: toMultilineText([
				'Review this YouTube transcript critically.',
				'Give me:',
				'- a concise summary',
				'- what is convincing or useful',
				'- what is missing, weak, or questionable',
				'- ideas, opportunities, or improvements inspired by it',
			]),
		},
	]

	function cloneDefaultPromptPresets() {
		return DEFAULT_PROMPT_PRESETS.map((preset) => ({ ...preset }))
	}

	globalThis.PromptTubeShared = {
		STORAGE_KEY,
		DEFAULT_PROMPT_PRESETS,
		cloneDefaultPromptPresets,
	}
})()
