#!/usr/bin/env bash
#
# Publish the package to NPM
#

set -u

TAG=$(git tag -l --contains HEAD)

if [[ -z $TAG ]]; then
	echo "No tag found. Skipping publish."
else
	echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > ~/.npmrc
	npm publish
	rm ~/.npmrc
fi
