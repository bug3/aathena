.PHONY: install build test test-watch lint clean release-patch release-minor release-major publish

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
release-patch:
	git pull --rebase
	npm version patch -m "chore: bump version to %s"
	git push
	git push --tags

release-minor:
	git pull --rebase
	npm version minor -m "chore: bump version to %s"
	git push
	git push --tags

release-major:
	git pull --rebase
	npm version major -m "chore: bump version to %s"
	git push
	git push --tags

publish:
	@echo "Publishing happens in CI, on a pushed v* tag." >&2
	@echo "A local 'npm publish' would need a write token and would ship" >&2
	@echo "without a provenance attestation. Use 'make release-patch' etc." >&2
	@exit 1
