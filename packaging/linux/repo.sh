#!/bin/sh
# Builds GitFolio's apt and dnf repositories, for GitHub Pages, from one release's Linux packages: apt/ and
# rpm/ with their indexes signed by the key in gpg's keyring, and its public half as gitfolio.asc.
#
# usage: packaging/linux/repo.sh <folder with GitFolio_linux_*.deb and *.rpm> <out folder>
# needs: dpkg-dev, apt-utils, createrepo-c, gpg with the signing key imported
set -eu

in=$(cd "$1" && pwd)
mkdir -p "$2"
out=$(cd "$2" && pwd)

# apt: one suite, stable, of the packages in pool/; Release signed inline (InRelease) and apart (Release.gpg).
mkdir -p "$out/apt/pool/main"
cp "$in"/*.deb "$out/apt/pool/main/"
cd "$out/apt"
for arch in amd64 arm64; do
	mkdir -p dists/stable/main/binary-$arch
	dpkg-scanpackages --arch $arch pool/ > dists/stable/main/binary-$arch/Packages
	gzip -9kn dists/stable/main/binary-$arch/Packages
done
apt-ftparchive \
	-o APT::FTPArchive::Release::Origin=GitFolio -o APT::FTPArchive::Release::Label=GitFolio \
	-o APT::FTPArchive::Release::Suite=stable -o APT::FTPArchive::Release::Codename=stable \
	-o APT::FTPArchive::Release::Architectures="amd64 arm64" -o APT::FTPArchive::Release::Components=main \
	release dists/stable > dists/stable/Release.new
mv dists/stable/Release.new dists/stable/Release
gpg --batch --yes --armor --detach-sign -o dists/stable/Release.gpg dists/stable/Release
gpg --batch --yes --clearsign -o dists/stable/InRelease dists/stable/Release

# dnf: the packages and their repodata, its repomd.xml signed (repo_gpgcheck).
mkdir -p "$out/rpm"
cp "$in"/*.rpm "$out/rpm/"
createrepo_c --quiet "$out/rpm"
gpg --batch --yes --armor --detach-sign "$out/rpm/repodata/repomd.xml"

gpg --armor --export > "$out/gitfolio.asc"
