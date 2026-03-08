<p align="center">
  <img src="icon.png" alt="PromptTube icon" width="128" height="128">
</p>

# YouTube transcript → Summary prompt (Firefox extension)
Available on [Firefox Browser Add-ons](https://addons.mozilla.org/en-US/firefox/addon/prompttube/)


A lightweight Firefox extension that adds a single button on YouTube watch pages to copy:

- the video title
- the channel name
- the video URL
- a ready-to-paste ChatGPT summary prompt
- the full transcript

into your clipboard in one click.

This is intended as a fast, privacy-friendly workflow: no backend, no API key, no data sent anywhere.


## Features

- Adds a **“Copy prompt + transcript”** button directly on YouTube video pages
- Automatically includes contextual metadata:
  - Title
  - Channel
  - URL
- Tries to:
  1. open the YouTube transcript panel automatically when needed
  2. fall back to YouTube caption tracks if the panel is not available
- Works with YouTube’s single-page navigation (SPA)

## What gets copied

The clipboard content looks like this:

```
Title: …
Channel: …
URL: …

Please summarise this YouTube transcript.
Give me:
- a 6–10 bullet summary
- key takeaways
- any actionable items

Transcript:

<full transcript>
```

## Installation (temporary, for development)

1. Open Firefox
2. Go to:

```
about:debugging#/runtime/this-firefox
```

3. Click **Load Temporary Add-on…**
4. Select the `manifest.json` file in this project

Open any YouTube video page and the button will appear near the action buttons
(like, share, etc.).

## How it works (high level)

The content script:

1. Injects a small button into the YouTube watch page UI
2. When clicked:
   - attempts to open the transcript panel via the page UI
   - reads transcript segments from the DOM if available
   - otherwise fetches captions through YouTube’s internal caption track endpoint
3. Builds a prompt that includes:
   - video metadata
   - a summary instruction
   - the transcript
4. Copies the result to the clipboard

All processing happens locally in the browser.

## Limitations

- Some videos genuinely have no transcript or captions
- YouTube frequently changes its internal DOM and UI structure
- The automatic “open transcript” step relies on heuristics and localisation-dependent labels

When YouTube changes its layout, selectors may need updating.

## Supported browser

- Firefox

## Building
```
npm i -g web-ext

web-ext lint
web-ext build --overwrite-dest
```

## Firefox submission metadata
To submit to AMO without retyping the listing text in the web form, use the checked-in [`amo-metadata.json`](./amo-metadata.json) file with `web-ext`.

For a single build/release command, run:

```bash
./scripts/release-firefox.sh patch
```

The script:

- increments the `manifest.json` version using `patch`, `minor`, or `major`
- builds the extension into `web-ext-artifacts/`
- uses [`amo-metadata.json`](./amo-metadata.json) for AMO listing translations
- submits/signs automatically if `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` are set
- uses `AMO_CHANNEL=listed` by default; set `AMO_CHANNEL=unlisted` if needed

Example:

```bash
export AMO_JWT_ISSUER="your-amo-jwt-issuer"
export AMO_JWT_SECRET="your-amo-jwt-secret"
export AMO_CHANNEL="listed"
./scripts/release-firefox.sh minor
```

## Folder structure

```
PromptTube/
├─ manifest.json
├─ icon.png
├─ content-script.js
├─ styles.css
├─ LICENCE
└─ README.md
```
