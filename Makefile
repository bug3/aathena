.PHONY: install build test test-watch lint clean release-guard release-patch release-minor release-major publish

install:
	npm install

build:
	npm run build

test:
	npm run test

test-watch:
	npm run test:watch

lint:
	npm run lint

clean:
	rm -rf dist node_modules

# Releases run in CI on a pushed v* tag. Two things are deliberate here:
#
#   git pull --rebase   Repomix commits llms-full.txt on every push to main, so
#                       a local branch goes stale quickly and `git push` gets
#                       rejected mid-release.
#   branch, then tag    `git push --follow-tags` can land the tag while the
#                       branch push is rejected, which publishes a version from
#                       a commit that is not on main. Split, make halts on the
#                       failed branch push and the tag never leaves.
#   one tag by name     `git push --tags` sends every local tag. The release
#                       workflow triggers on `v*`, so a stray local tag would
#                       publish. Push only the one just created.
#   release-guard       the tag is what triggers a publish, so cutting one from
#                       a feature branch ships that branch.

release-guard:
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	test "$$branch" = main || { echo "releases are cut from main, not $$branch" >&2; exit 1; }

release-patch: release-guard
	git pull --rebase
	npm version patch -m "chore: bump version to %s"
	git push
	git push origin "v$$(node -p 'require("./package.json").version')"

release-minor: release-guard
	git pull --rebase
	npm version minor -m "chore: bump version to %s"
	git push
	git push origin "v$$(node -p 'require("./package.json").version')"

release-major: release-guard
	git pull --rebase
	npm version major -m "chore: bump version to %s"
	git push
	git push origin "v$$(node -p 'require("./package.json").version')"

publish:
	@echo "Publishing happens in CI, on a pushed v* tag." >&2
	@echo "A local 'npm publish' would need a write token and would ship" >&2
	@echo "without a provenance attestation. Use 'make release-patch' etc." >&2
	@exit 1
