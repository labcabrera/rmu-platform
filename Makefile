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
	keycloak-init keycloak-default-group mfes-dev mfe-dev mfe-container e2e-combat

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

build-local: ## Build :local images of the rmu-api-*/rmu-mfe-* checkouts (all, or p="rmu-api-tactical rmu-mfe-tactical")
	scripts/build-local-images.sh --no-up $(p)

up-local: .env ## Build :local images (all, or p="...") and start the stack using them
	scripts/build-local-images.sh $(p)

mongo-backup: ## Dump the local Mongo into backups/
	scripts/mongo-backup.sh

mongo-restore: ## Restore a dump into the local Mongo (f=<archive>, drops the restored collections)
	@test -n "$(f)" || { echo "Usage: make mongo-restore f=backups/<file>" >&2; exit 1; }
	scripts/mongo-restore.sh "$(f)"

mongo-migrate: ## Run a migration script against the local Mongo (f=scripts/migrations/<file>.js, DRY_RUN=1 to only count)
	@test -n "$(f)" || { echo "Usage: make mongo-migrate f=scripts/migrations/<file>.js" >&2; exit 1; }
	DRY_RUN="$(DRY_RUN)" scripts/mongo-migrate.sh "$(f)"

keycloak-init: ## Create/update the local Keycloak realm with terraform, no prompt (needs terraform.tfvars)
	terraform -chdir=$(TF_KEYCLOAK) init -input=false
	terraform -chdir=$(TF_KEYCLOAK) apply -input=false -auto-approve

keycloak-default-group: ## Add rmu-user to the existing users of the realm (skip="<guest username>", DRY_RUN=1 to list)
	DRY_RUN="$(DRY_RUN)" scripts/keycloak-add-default-group.sh $(skip)

mfes-dev: ## Start the MFEs from source in gnome-terminal tabs (BASE_DIR=<workspace> optional)
	scripts/start-mfes-dev.sh $(BASE_DIR)

mfe-dev: .env ## Stop the container of one MFE (s=shell|core|strategic|tactical|npcs|items|spells|assets) so the gateway uses its dev server
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
