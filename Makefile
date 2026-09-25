.DEFAULT_GOAL := help
.PHONY: help install dev build check test fmt lint typecheck db-up db-down db-status db-logs db-generate db-migrate db-studio db-reset clean

COMPOSE := docker compose -f docker-compose.yml
DB_SERVICE := db

help: ## List available targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install workspace dependencies
	pnpm install

dev: ## Run backend, frontend and package watchers
	pnpm dev

build: ## Build every package and app
	pnpm build

check: ## Format check, lint and typecheck
	pnpm check

test: ## Run the test suite
	pnpm test

fmt: ## Rewrite files with oxfmt
	pnpm format

lint: ## Lint with oxlint, applying automatic fixes
	pnpm lint:fix

update:
	pnpm update --interactive --latest

typecheck: ## Typecheck every package
	pnpm typecheck

db-up: ## Start PostgreSQL and wait until it accepts connections
	$(COMPOSE) up -d $(DB_SERVICE)
	@until $(COMPOSE) exec -T $(DB_SERVICE) pg_isready -U genealogy -d genealogy >/dev/null 2>&1; do sleep 1; done
	@echo "PostgreSQL is ready"

db-down: ## Stop PostgreSQL
	$(COMPOSE) stop $(DB_SERVICE)

db-status: ## Show PostgreSQL container status
	$(COMPOSE) ps $(DB_SERVICE)

db-logs: ## Follow PostgreSQL logs
	$(COMPOSE) logs -f $(DB_SERVICE)

db-generate: ## Generate a migration from the Drizzle schema
	pnpm db:generate

db-migrate: ## Apply pending migrations
	pnpm db:migrate

db-studio: ## Open Drizzle Studio
	pnpm db:studio

db-reset: ## Destroy the local database and rebuild it from scratch
	$(COMPOSE) down -v
	$(COMPOSE) up -d db
	@until $(COMPOSE) exec -T db pg_isready -U genealogy -d genealogy >/dev/null 2>&1; do sleep 1; done
	pnpm db:migrate

clean: ## Remove build output and node_modules
	pnpm clean
