#!/usr/bin/env bash

set -euo pipefail

INSTALL_DIR="${HOME}/.local/bin"
TARGET=""
VERSION=""

usage() {
  cat <<'EOF'
Install a released backup-to-cloud binary from GitHub Releases.

Usage:
  bash scripts/install-release.sh --version 6.0.0
  bash scripts/install-release.sh --version v6.0.0 --dir /usr/local/bin
  bash scripts/install-release.sh --version 6.0.0 --target linux-x64

Options:
  --version VERSION   Release version to install. Required. Accepts 6.0.0 or v6.0.0.
  --dir PATH          Install directory. Default: ~/.local/bin
  --target TARGET     Override detected target. Supported: linux-x64, linux-arm64, darwin-x64, darwin-arm64.
  -h, --help          Show this help.
EOF
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

normalize_version() {
  local raw_version="$1"

  if [[ -z "$raw_version" ]]; then
    fail "--version is required"
  fi

  if [[ "$raw_version" == v* ]]; then
    printf '%s\n' "$raw_version"
    return
  fi

  printf 'v%s\n' "$raw_version"
}

detect_target() {
  local os
  local arch

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    linux|darwin)
      ;;
    *)
      fail "Unsupported OS: $os"
      ;;
  esac

  case "$arch" in
    x86_64|amd64)
      arch="x64"
      ;;
    arm64|aarch64)
      arch="arm64"
      ;;
    *)
      fail "Unsupported architecture: $arch"
      ;;
  esac

  printf '%s-%s\n' "$os" "$arch"
}

download_file() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "$url" --output "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="$output" "$url"
    return
  fi

  fail "Missing downloader: install curl or wget"
}

compute_sha256() {
  local file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{ print $1 }'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{ print $1 }'
    return
  fi

  fail "Missing checksum tool: install sha256sum or shasum"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --owner)
      OWNER="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

need_command tar
need_command mktemp

VERSION="$(normalize_version "$VERSION")"
TARGET="${TARGET:-$(detect_target)}"

case "$TARGET" in
  linux-x64|linux-arm64|darwin-x64|darwin-arm64)
    ;;
  *)
    fail "Unsupported target: $TARGET"
    ;;
esac

ARTIFACT="backup-to-cloud-${VERSION}-${TARGET}"
ARCHIVE_NAME="${ARTIFACT}.tar.gz"
CHECKSUM_NAME="${ARCHIVE_NAME}.sha256"
RELEASE_URL="https://github.com/avaly/backup-to-cloud/releases/download/${VERSION}"

temp_dir="$(mktemp -d)"
archive_path="${temp_dir}/${ARCHIVE_NAME}"
checksum_path="${temp_dir}/${CHECKSUM_NAME}"

cleanup() {
  rm -rf "$temp_dir"
}

trap cleanup EXIT

echo "Downloading ${ARCHIVE_NAME}"
download_file "${RELEASE_URL}/${ARCHIVE_NAME}" "$archive_path"

echo "Downloading ${CHECKSUM_NAME}"
download_file "${RELEASE_URL}/${CHECKSUM_NAME}" "$checksum_path"

expected_sha="$(awk 'NR == 1 { print $1 }' "$checksum_path")"
[[ -n "$expected_sha" ]] || fail "Could not read checksum from ${CHECKSUM_NAME}"

actual_sha="$(compute_sha256 "$archive_path")"
[[ "$actual_sha" == "$expected_sha" ]] || fail "Checksum mismatch for ${ARCHIVE_NAME}"

mkdir -p "$INSTALL_DIR"
tar -xzf "$archive_path" -C "$temp_dir"
extracted_path="${temp_dir}/${ARTIFACT}"
[[ -f "$extracted_path" ]] || fail "Archive did not contain ${ARTIFACT}"

if command -v install >/dev/null 2>&1; then
  install -m 755 "$extracted_path" "${INSTALL_DIR}/backup-to-cloud"
else
  cp "$extracted_path" "${INSTALL_DIR}/backup-to-cloud"
  chmod 755 "${INSTALL_DIR}/backup-to-cloud"
fi

echo "Installed ${VERSION} for ${TARGET} to ${INSTALL_DIR}/backup-to-cloud"
