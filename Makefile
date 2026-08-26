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

release-patch:
	npm version patch -m "chore: bump version to %s"
	git push --follow-tags

release-minor:
	npm version minor -m "chore: bump version to %s"
	git push --follow-tags

release-major:
	npm version major -m "chore: bump version to %s"
	git push --follow-tags

publish:
	@echo "Publishing happens in CI, on a pushed v* tag." >&2
	@echo "A local 'npm publish' would need a write token and would ship" >&2
	@echo "without a provenance attestation. Use 'make release-patch' etc." >&2
	@exit 1
