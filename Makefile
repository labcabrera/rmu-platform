# Workspace with the rmu-* checkouts, and the images built from them (all, or p="rmu-api-tactical rmu-mfe-tactical").
BASE_DIR ?= $(or $(RMU_WORKSPACE_DIR),$(abspath ..))
TAG      ?= local
p        ?= $(patsubst $(BASE_DIR)/%/Dockerfile,%,$(wildcard $(BASE_DIR)/rmu-api-*/Dockerfile $(BASE_DIR)/rmu-mfe-*/Dockerfile))
MFES     := rmu-mfe-shell rmu-mfe-core rmu-mfe-strategic rmu-mfe-tactical rmu-mfe-items rmu-mfe-npcs rmu-mfe-spells rmu-mfe-wiki

TF_KEYCLOAK ?= terraform/stacks/keycloak-local

# rmu-api-attack-tables serves the enriched tables of a workspace checkout (../data/core-law, not
# published) when they exist, unless RMU_ATTACK_TABLES_DATA_DIR is set in the shell or in .env.
# The value is relative to compose/. See docs/architecture/configuration.adoc.
ifeq ($(origin RMU_ATTACK_TABLES_DATA_DIR)$(shell grep -s '^RMU_ATTACK_TABLES_DATA_DIR=' .env),undefined)
ifneq ($(wildcard ../data/core-law/critical-tables),)
export RMU_ATTACK_TABLES_DATA_DIR := ../../data/core-law
endif
endif

.DEFAULT_GOAL := help
.PHONY: e2e help build-local up-local config up up-infra up-apis down ps logs mongo-backup mongo-restore mongo-migrate \
	mongo-reassign-users catalog-export keycloak-init keycloak-default-group mfes-dev mfe-dev mfe-container e2e-combat diagrams

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.env:
	@echo "Missing .env. Create it with: cp .env.example .env" >&2; exit 1

config: .env ## Validate the compose files and list the services of the active profiles
	docker compose config -q
	docker compose config --services

up: .env ## Start the profiles listed in COMPOSE_PROFILES (.env)
	docker compose up -d

up-infra: .env ## Start only the infrastructure (Mongo, Postgres, Keycloak, Kafka)
	docker compose --profile infrastructure up -d

up-apis: .env ## Start the infrastructure and the APIs
	docker compose --profile infrastructure --profile apis up -d

down: .env ## Stop every service of every profile (volumes are kept)
	docker compose --profile '*' down

ps: .env ## List the running services of every profile
	docker compose --profile '*' ps

logs: .env ## Follow logs (all services, or one with s=<service>)
	docker compose --profile '*' logs -f --tail=200 $(s)

# MFE images take the shared lib as a BuildKit named context, like `make docker-build` in each MFE. Every project is
# built even if one fails, and the target fails at the end.
build-local: ## Build images of the rmu-api-*/rmu-mfe-* checkouts (all, or p="..."; TAG=local, NO_CACHE=1)
	@built=; failed=; \
	for project in $(p); do \
		context=; \
		case "$$project" in \
			rmu-mfe-assets) ;; \
			rmu-mfe-*) context="--build-context shared-lib=$(BASE_DIR)/rmu-react-shared-lib" ;; \
		esac; \
		echo "==> labcabrera/$$project:$(TAG)"; \
		if docker build $(if $(NO_CACHE),--no-cache) $$context -t "labcabrera/$$project:$(TAG)" "$(BASE_DIR)/$$project"; then \
			built="$$built $$project"; \
		else \
			failed="$$failed $$project"; \
		fi; \
	done; \
	echo; echo "Built ($(TAG)):$${built:- none}"; \
	if [ -n "$$failed" ]; then echo "Failed:$$failed" >&2; exit 1; fi

# RMU_<PROJECT>_VERSION is set to the tag for every project with an image of that tag (workspace spec 056: the published
# `latest` images can be months older than the local ones). A version set in the shell always wins; the rest come from
# .env. --remove-orphans also drops containers of services no longer defined.
up-local: .env build-local ## Build images (all, or p="...") and start the stack using them
	@echo "Versions used (the rest come from .env):"; \
	for repository in $$(docker image ls --filter "reference=labcabrera/rmu-*:$(TAG)" --format '{{.Repository}}' | sort -u); do \
		var=$$(echo "$${repository#labcabrera/}_VERSION" | tr 'a-z-' 'A-Z_'); \
		[ -n "$$(printenv "$$var")" ] || export "$$var=$(TAG)"; \
		echo "  $$var=$$(printenv "$$var")"; \
	done; \
	docker compose up -d --remove-orphans; \
	docker compose ps

mongo-backup: ## Dump the local Mongo into backups/
	scripts/mongo-backup.sh

mongo-restore: ## Restore a dump into the local Mongo (f=<archive>, drops the restored collections)
	@test -n "$(f)" || { echo "Usage: make mongo-restore f=backups/<file>" >&2; exit 1; }
	scripts/mongo-restore.sh "$(f)"

mongo-migrate: ## Run a migration script against the local Mongo (f=scripts/migrations/<file>.js, DRY_RUN=1 to only count)
	@test -n "$(f)" || { echo "Usage: make mongo-migrate f=scripts/migrations/<file>.js" >&2; exit 1; }
	DRY_RUN="$(DRY_RUN)" scripts/mongo-migrate.sh "$(f)"

mongo-migrate-pending: ## Run the migrations not recorded in rmu-platform.migrations, in order (DRY_RUN=1 to only list)
	DRY_RUN="$(DRY_RUN)" scripts/mongo-migrate-pending.sh

mongo-migrate-baseline: ## Record migrations as applied without running them (f="a.js b.js", default every one)
	scripts/mongo-migrate-pending.sh --baseline $(f)

mongo-reassign-users: ## Reassign every user's data to one user (TARGET_SUB=<keycloak id> TARGET_NAME=<nick>, DRY_RUN=1)
	DRY_RUN="$(DRY_RUN)" TARGET_SUB="$(TARGET_SUB)" TARGET_NAME="$(TARGET_NAME)" KEEP_SUBS="$(KEEP_SUBS)" scripts/mongo-reassign-users.sh

catalog-export: ## Export the book catalog of the local Mongo into backups/catalog-*.archive.gz (spec 103, D10)
	scripts/catalog-sync/export.sh

keycloak-init: ## Create/update the local Keycloak realm with terraform, no prompt (needs terraform.tfvars)
	terraform -chdir=$(TF_KEYCLOAK) init -input=false
	terraform -chdir=$(TF_KEYCLOAK) apply -input=false -auto-approve

keycloak-default-group: ## Add rmu-user to the existing users of the realm (skip="<guest username>", DRY_RUN=1 to list)
	DRY_RUN="$(DRY_RUN)" scripts/keycloak-add-default-group.sh $(skip)

mfes-dev: ## Start the MFEs from source in gnome-terminal tabs (BASE_DIR=<workspace> optional)
	@command -v gnome-terminal >/dev/null || { echo "gnome-terminal not found. Run 'pnpm run start:live' in each MFE of $(BASE_DIR)." >&2; exit 1; }
	@for mfe in $(MFES); do \
		if [ -d "$(BASE_DIR)/$$mfe" ]; then \
			gnome-terminal --tab --title="$$mfe" -- bash -c "cd '$(BASE_DIR)/$$mfe' && pnpm run start:live; exec bash"; \
		else \
			echo "Skipping $$mfe: not checked out" >&2; \
		fi; \
	done
	@gnome-terminal --tab --title=rmu-mfe-assets -- bash -c "cd '$(BASE_DIR)/rmu-mfe-assets' && python3 local-start.py; exec bash"

mfe-dev: .env ## Stop the container of one MFE (s=shell|core|strategic|tactical|npcs|items|spells|wiki|assets) so the gateway uses its dev server
	@test -n "$(s)" || { echo "Usage: make mfe-dev s=<name>" >&2; exit 1; }
	docker compose stop rmu-mfe-$(s)
	@echo "rmu-mfe-$(s) stopped. Start its dev server (F5 in VS Code, or 'make start' in rmu-mfe-$(s)) and open http://localhost/"

mfe-container: .env ## Serve one MFE (s=<name>) from its container again
	@test -n "$(s)" || { echo "Usage: make mfe-container s=<name>" >&2; exit 1; }
	docker compose up -d rmu-mfe-$(s)

e2e: ## Responsive smoke test of the web against the running stack (needs RMU_E2E_USER and RMU_E2E_PASSWORD)
	cd e2e && npm ci --ignore-scripts && npx playwright test

e2e-combat: ## Combat flow test (spec 005) on the first tactical game: it changes the game (needs RMU_E2E_USER and RMU_E2E_PASSWORD)
	cd e2e && npm ci --ignore-scripts && RMU_E2E_COMBAT=1 npx playwright test --project=combat

diagrams: ## Render docs/diagrams/*.plantuml to SVG (PlantUML in Docker; f=<file> for one)
	docs/diagrams/render.sh $(f)

# --- Production (workspace spec 103) ------------------------------------------------------------------------
# The production override on top of compose.yaml, with its own env file (never .env). The Mongo scripts read
# their credentials from it through ENV_FILE. See docs/operations/production.adoc.
PROD_ENV_FILE ?= .env.production
PROD_COMPOSE  := docker compose --env-file $(PROD_ENV_FILE) -f compose.yaml -f compose/production.yaml
PROD_SCRIPT_ENV := ENV_FILE="$(abspath $(PROD_ENV_FILE))"

.PHONY: prod-env prod-config prod-pull prod-up prod-down prod-ps prod-logs prod-backup prod-restore \
	prod-migrate-pending prod-reassign-users prod-catalog-import \
	prod-backup-init prod-backup-nightly prod-backup-snapshots prod-backup-restore

# backups/metrics is created here so it is not a root-owned directory made by Docker when rmu-alloy mounts it.
prod-env:
	@test -f "$(PROD_ENV_FILE)" || { echo "Missing $(PROD_ENV_FILE). Create it from .env.production.example" >&2; exit 1; }
	@mkdir -p backups/metrics

prod-config: prod-env ## Production: validate the compose files and check that only the gateway publishes ports
	$(PROD_COMPOSE) config -q
	scripts/check-production-ports.sh "$(PROD_ENV_FILE)"

prod-pull: prod-env ## Production: pull the images of the versions in the env file
	$(PROD_COMPOSE) pull --ignore-buildable

prod-up: prod-config ## Production: start the profiles of the env file (s="<services>" for some)
	$(PROD_COMPOSE) up -d --remove-orphans $(s)
	$(PROD_COMPOSE) ps

prod-down: prod-env ## Production: stop the stack (volumes are kept)
	$(PROD_COMPOSE) --profile '*' down

prod-ps: prod-env ## Production: list the services
	$(PROD_COMPOSE) --profile '*' ps

prod-logs: prod-env ## Production: follow logs (all services, or one with s=<service>)
	$(PROD_COMPOSE) --profile '*' logs -f --tail=200 $(s)

prod-backup: prod-env ## Production: dump Mongo into backups/ (quick copy before a change; the nightly one is prod-backup-nightly)
	$(PROD_SCRIPT_ENV) scripts/mongo-backup.sh

prod-restore: prod-env ## Production: restore a Mongo dump (f=<archive>, drops the restored collections)
	@test -n "$(f)" || { echo "Usage: make prod-restore f=backups/<file>" >&2; exit 1; }
	$(PROD_SCRIPT_ENV) scripts/mongo-restore.sh "$(f)"

prod-migrate-pending: prod-env ## Production: run the pending migrations (DRY_RUN=1 to only list)
	$(PROD_SCRIPT_ENV) DRY_RUN="$(DRY_RUN)" scripts/mongo-migrate-pending.sh

prod-reassign-users: prod-env ## Production: reassign every user's data to one user (TARGET_SUB=, TARGET_NAME=, DRY_RUN=1)
	$(PROD_SCRIPT_ENV) DRY_RUN="$(DRY_RUN)" TARGET_SUB="$(TARGET_SUB)" TARGET_NAME="$(TARGET_NAME)" KEEP_SUBS="$(KEEP_SUBS)" \
		scripts/mongo-reassign-users.sh

prod-catalog-import: prod-env ## Production: import a catalog package (f=<package>, CATALOG_OWNER_SUB=<admin id>, DRY_RUN=1, PRUNE=1)
	@test -n "$(f)" || { echo "Usage: make prod-catalog-import f=backups/catalog-<...>.archive.gz CATALOG_OWNER_SUB=<id>" >&2; exit 1; }
	$(PROD_SCRIPT_ENV) DRY_RUN="$(DRY_RUN)" PRUNE="$(PRUNE)" CATALOG_OWNER_SUB="$(CATALOG_OWNER_SUB)" \
		scripts/catalog-sync/import.sh "$(f)"

prod-backup-init: prod-env ## Production: create the restic repository of the backups (once)
	$(PROD_SCRIPT_ENV) scripts/prod-backup.sh --init

prod-backup-nightly: prod-env ## Production: Mongo, Postgres and S3 into restic (R2), with retention (cron runs it)
	$(PROD_SCRIPT_ENV) scripts/prod-backup.sh

prod-backup-snapshots: prod-env ## Production: list the restic snapshots
	$(PROD_SCRIPT_ENV) scripts/prod-restore.sh --list

prod-backup-restore: prod-env ## Production: restore a snapshot (id=<snapshot>, default latest; ONLY="mongo postgres s3"; DOWNLOAD_ONLY=1)
	$(PROD_SCRIPT_ENV) ONLY="$(ONLY)" DOWNLOAD_ONLY="$(DOWNLOAD_ONLY)" scripts/prod-restore.sh $(id)
