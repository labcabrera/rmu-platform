TF_KEYCLOAK ?= terraform/stacks/keycloak-local

.DEFAULT_GOAL := help
.PHONY: help config up up-infra up-apis down ps logs mongo-backup mongo-restore \
	tf-keycloak-plan tf-keycloak-apply mfes-dev

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

mongo-backup: ## Dump the local Mongo into backups/
	scripts/mongo-backup.sh

mongo-restore: ## Restore a dump into the local Mongo (f=<archive>, drops the restored collections)
	@test -n "$(f)" || { echo "Usage: make mongo-restore f=backups/<file>" >&2; exit 1; }
	scripts/mongo-restore.sh "$(f)"

tf-keycloak-plan: ## terraform plan for the local Keycloak (needs terraform.tfvars)
	terraform -chdir=$(TF_KEYCLOAK) init -input=false
	terraform -chdir=$(TF_KEYCLOAK) plan

tf-keycloak-apply: ## terraform apply for the local Keycloak (needs terraform.tfvars)
	terraform -chdir=$(TF_KEYCLOAK) init -input=false
	terraform -chdir=$(TF_KEYCLOAK) apply

mfes-dev: ## Start the MFEs from source in gnome-terminal tabs (BASE_DIR=<workspace> optional)
	scripts/start-mfes-dev.sh $(BASE_DIR)
