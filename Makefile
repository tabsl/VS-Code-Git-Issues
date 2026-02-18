.PHONY: help install build test lint clean package release publish check version-patch version-minor version-major tag

BUMP    ?= patch
VERSION := $(shell node -p "require('./package.json').version")
NAME    := $(shell node -p "require('./package.json').name")
VSIX    := $(NAME)-$(VERSION).vsix

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm ci

build: ## Build extension and webview
	npm run build

test: ## Run tests
	npm run test

lint: ## Run linter
	npm run lint

clean: ## Remove build artifacts and .vsix files
	rm -rf dist/*.js dist/*.js.map
	rm -f $(NAME)-*.vsix

check: lint test ## Run lint + tests

package: build ## Package .vsix
	npx vsce package
	@echo "\n✓ Created $(VSIX)"

version-patch: ## Bump patch version (1.0.1 → 1.0.2)
	npm version patch --no-git-tag-version
	@echo "\n✓ Version bumped to $$(node -p "require('./package.json').version")"

version-minor: ## Bump minor version (1.0.1 → 1.1.0)
	npm version minor --no-git-tag-version
	@echo "\n✓ Version bumped to $$(node -p "require('./package.json').version")"

version-major: ## Bump major version (1.0.1 → 2.0.0)
	npm version major --no-git-tag-version
	@echo "\n✓ Version bumped to $$(node -p "require('./package.json').version")"

tag: ## Create git tag and push to GitHub
	git tag -a v$(VERSION) -m "v$(VERSION)"
	git push origin v$(VERSION)
	@echo "\n✓ Tag v$(VERSION) pushed to GitHub"

release: check ## Full release (BUMP=patch|minor|major)
	@npm version $(BUMP) --no-git-tag-version > /dev/null && \
	V=$$(node -p "require('./package.json').version") && \
	sed -i '' "s/^## Unreleased$$/## Unreleased\\n\\n## $$V — $$(date +%Y-%m-%d)/" CHANGELOG.md && \
	npx vsce package && \
	git add -A && \
	git commit -m "release v$$V" && \
	git tag -a "v$$V" -m "v$$V" && \
	git push origin main "v$$V" && \
	npx vsce publish && \
	echo "\n✓ v$$V released to GitHub + Marketplace"

publish: ## Publish current version to VS Code Marketplace
	npx vsce publish
	@echo "\n✓ Published $(VERSION) to Marketplace"
