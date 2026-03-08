#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/web-ext-artifacts"
METADATA_FILE="$ROOT_DIR/amo-metadata.json"
MANIFEST_FILE="$ROOT_DIR/manifest.json"
AMO_CHANNEL="${AMO_CHANNEL:-listed}"
IGNORE_FILES=(
	"scripts/**"
	"amo-metadata.json"
	".amo-upload-uuid"
	".git/**"
	".github/**"
	"README.md"
)
ORIGINAL_MANIFEST_CONTENT=""
VERSION_BUMPED=0

usage() {
	echo "Usage: ./scripts/release-firefox.sh <patch|minor|major>" >&2
	echo "Optional env: AMO_CHANNEL=listed|unlisted (default: listed)" >&2
	exit 1
}

restore_manifest_version() {
	if [[ $VERSION_BUMPED -eq 1 ]]; then
		printf '%s' "$ORIGINAL_MANIFEST_CONTENT" > "$MANIFEST_FILE"
		echo "Restored manifest.json after failure." >&2
	fi
}

on_exit() {
	local exit_code=$?
	if [[ $exit_code -ne 0 ]]; then
		restore_manifest_version
	fi
}

trap on_exit EXIT

cd "$ROOT_DIR"

if ! command -v web-ext >/dev/null 2>&1; then
	echo "web-ext is required but was not found in PATH." >&2
	echo "Install it with: npm i -g web-ext" >&2
	exit 1
fi

if [[ ! -f "$METADATA_FILE" ]]; then
	echo "Missing AMO metadata file: $METADATA_FILE" >&2
	exit 1
fi

if [[ ! -f "$MANIFEST_FILE" ]]; then
	echo "Missing manifest file: $MANIFEST_FILE" >&2
	exit 1
fi

if [[ $# -ne 1 ]]; then
	usage
fi

BUMP_TYPE="$1"

case "$BUMP_TYPE" in
patch|minor|major)
	;;
*)
	usage
	;;
esac

case "$AMO_CHANNEL" in
listed|unlisted)
	;;
*)
	echo "AMO_CHANNEL must be 'listed' or 'unlisted'." >&2
	exit 1
	;;
esac

CURRENT_VERSION="$(ruby -rjson -e 'puts JSON.parse(File.read(ARGV[0])).fetch("version")' "$MANIFEST_FILE")"
NEW_VERSION="$(ruby -e '
	version, bump = ARGV
	segments = version.split(".").map(&:to_i)
	abort("manifest version must be semver: #{version}") unless segments.length == 3
	major, minor, patch = segments
	case bump
	when "patch"
		patch += 1
	when "minor"
		minor += 1
		patch = 0
	when "major"
		major += 1
		minor = 0
		patch = 0
	else
		abort("unsupported bump type: #{bump}")
	end
	puts [major, minor, patch].join(".")
' "$CURRENT_VERSION" "$BUMP_TYPE")"

ORIGINAL_MANIFEST_CONTENT="$(cat "$MANIFEST_FILE")"

ruby -rjson -e '
	path, version = ARGV
	data = JSON.parse(File.read(path))
	data["version"] = version
	File.write(path, JSON.pretty_generate(data) + "\n")
' "$MANIFEST_FILE" "$NEW_VERSION"
VERSION_BUMPED=1

echo "Version bumped: $CURRENT_VERSION -> $NEW_VERSION"
echo "Building Firefox package..."
web-ext build \
	--overwrite-dest \
	--artifacts-dir "$ARTIFACT_DIR" \
	--ignore-files "${IGNORE_FILES[@]}"

if [[ -n "${AMO_JWT_ISSUER:-}" && -n "${AMO_JWT_SECRET:-}" ]]; then
	echo "Signing/submitting to AMO with translated metadata..."
	web-ext sign \
		--source-dir "$ROOT_DIR" \
		--artifacts-dir "$ARTIFACT_DIR" \
		--channel "$AMO_CHANNEL" \
		--ignore-files "${IGNORE_FILES[@]}" \
		--amo-metadata "$METADATA_FILE" \
		--api-key "$AMO_JWT_ISSUER" \
		--api-secret "$AMO_JWT_SECRET"
else
	echo "Build complete."
	echo "Set AMO_JWT_ISSUER and AMO_JWT_SECRET to submit with AMO metadata in the same command."
	echo "Then rerun: ./scripts/release-firefox.sh $BUMP_TYPE"
fi

trap - EXIT
