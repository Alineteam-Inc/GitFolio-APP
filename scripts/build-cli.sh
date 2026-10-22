#!/bin/sh
# Builds the gitfolio CLI the app bundles (tauri.conf.json bundle.externalBin) from a GitFolio-CLI checkout,
# without touching its working tree, into src-tauri/binaries/gitfolio-<target triple>. It is built as the
# CLI's releases are, plus main.bundled: a copy an app ships never updates itself (the app updates it).
#
# usage: scripts/build-cli.sh <GitFolio-CLI checkout> [git ref, default HEAD] [version, default the source's] [Rust target triple, default this computer's]
#
# Without a version, the source's own is kept (such as 0.6.0-dev): a build from source, which keeps its own
# data (gitfolio-dev). A release version (0.6.0, no v) makes a release build, which works with aline.team
# itself: only for the app's releases.
set -eu

src=$1
ref=${2:-HEAD}
version=${3:-}
triple=${4:-$(rustc --print host-tuple)}

case $triple in
aarch64-*) arch=arm64 ;;
x86_64-*) arch=amd64 ;;
*) echo "unsupported target: $triple" >&2; exit 1 ;;
esac
case $triple in
*-apple-darwin) os=darwin ext= ;;
*-linux-*) os=linux ext= ;;
*-windows-*) os=windows ext=.exe ;;
*) echo "unsupported target: $triple" >&2; exit 1 ;;
esac

out=$(cd "$(dirname "$0")/.." && pwd)/src-tauri/binaries/gitfolio-$triple$ext
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C "$src" archive "$ref" | tar -x -C "$tmp"
mkdir -p "$(dirname "$out")"
(cd "$tmp" && CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath \
	-ldflags "-s -w ${version:+-X main.version=$version} -X main.bundled=yes" -o "$out" ./cmd/gitfolio)
echo "$out"
