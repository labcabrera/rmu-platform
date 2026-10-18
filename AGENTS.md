# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

`rmu-platform` is the umbrella/ops repo for **RMU Engine**, an online assistant for playing Rolemaster Unified. It contains no application code: each API and micro-frontend lives in its own `labcabrera/rmu-*` repository and is consumed here by image and version. This repo holds:

- `compose.yaml`: only `include:`s the files under `compose/`, one per layer. Every service belongs to a profile:
  - `compose/infrastructure.yaml` (`infrastructure`): mongo, postgres, keycloak, kafka, and the volumes.
  - `compose/apis.yaml` (`apis`): every API, with `x-api-common`/`x-iam-env`/`x-kafka-env`/`x-log-env` anchors.
  - `compose/mfes.yaml` (`mfes`): shell and core as static nginx images, no host ports, runtime config through an `x-mfe-env` anchor.
  - `compose/tools.yaml` (`tools`): rmu-kafka-ui, rmu-mongo-express.
  - `compose/gateway.yaml` (`gateway`): Caddy, with its routes in `compose/config/caddy/Caddyfile`. Shell at `/`, remotes at `/mfe/<name>/`, APIs at `/api/<name>/`, Keycloak at `/sso/`.
  - `compose/observability.yaml` (`observability`): `grafana/otel-lgtm`.

  `.env.example` enables `infrastructure,apis,mfes,gateway,tools` by default.
- `Makefile`: the entry point. Run `make help` to list the targets.
- `scripts/`: `mongo-backup.sh`, `mongo-restore.sh`, `mongo-migrate.sh` (runs `scripts/migrations/*.js`) and `start-mfes-dev.sh`.
- `terraform/`: Keycloak realm/clients/groups/users via the `mrparkers/keycloak` provider. It holds `modules/keycloak` plus one state per stack in `stacks/<name>/`. Only `keycloak-local` exists for now.
- `docs/`: AsciiDoc documentation (`index.adoc` is the map), including `architecture/diagrams/c4-context.plantuml`, the authoritative map of which MFE/API talks to what.
- `specs/`: numbered change specs (`NNN-<objective>/{spec.md,plan.md}`).

There is no build, lint, or test tooling here. Changes are validated by running Compose or Terraform.

## Commands

```bash
make up                         # docker compose up -d with COMPOSE_PROFILES from .env (copy from .env.example)
make up-infra / make up-apis    # infrastructure only / infrastructure + apis
make config                     # docker compose config -q + list active services
make down / ps / logs s=<svc>   # act on every profile (--profile '*'); down keeps volumes
make mongo-backup               # -> backups/mongo-<date>.archive.gz (gitignored)
make mongo-restore f=<file>     # drops and restores the collections in the archive; asks first
make mongo-migrate f=<script>   # run a scripts/migrations/*.js file with mongosh (DRY_RUN=1 to only count)
make keycloak-init              # terraform apply -auto-approve of terraform/stacks/keycloak-local, needs terraform.tfvars
make mfe-dev s=core             # stop rmu-mfe-core: the gateway falls back to its dev server on the host
make mfe-container s=core       # serve it from the container again
make mfes-dev [BASE_DIR=...]    # gnome-terminal tab per rmu-mfe-* checkout running npm run start:live

docker compose --profile infrastructure --profile tools up -d   # --profile replaces COMPOSE_PROFILES
terraform fmt -check -recursive terraform && terraform -chdir=terraform/stacks/keycloak-local validate
```

Validate Compose changes for every profile combination, not just the default. `COMPOSE_PROFILES=<list> docker compose config -q` is enough for each one. Compare `docker compose config` output before and after a refactor.

Local endpoints: Keycloak `http://localhost:8090`, Kafka UI `:8091`, Mongo Express `:8092`, Mongo `localhost:27017`, Kafka from the host `localhost:9093` (in-network `rmu-kafka-broker:9092`), gateway `:80`, Grafana `:3000`.

## Architecture

- **Frontend**: React MFEs using Webpack Module Federation. `rmu-mfe-shell` handles OIDC login against Keycloak and composes the domain MFEs (core, strategic, tactical, items, npcs, spells). Static assets come from `rmu-mfe-assets`. Contract and env vars are in `docs/architecture/frontends.adoc`.
- **APIs**: mostly NestJS, plus Attack (Python, port 8000) and Attack Tables / NPC Names (Node.js). Each domain API owns its own Mongo database (`rmu-core`, `rmu-strategic`, ...) on a shared Mongo instance. APIs call each other over HTTP at `http://rmu-api-<name>:<port>/v1` and exchange Kafka events on `internal.<service>.<entity>.<event>.v1` topics (auto-created, 1 partition locally).
- **Ports**: core 3001, strategic 3002, tactical 3003, attack-tables 3005, items 3006, npc-names 3007, npcs 3008, spells 3009, users 3010, media 3011, attack 8000. The full catalog is in `docs/architecture/services.adoc`.
- **Auth**: Keycloak realm `rmu` (Postgres-backed). Terraform creates two clients:
  - `rmu-client`: confidential, used by the APIs for JWT validation (JWKS) and service-to-service tokens. Its service account has `realm-admin`, which `rmu-api-users` relies on to manage users.
  - `rmu-client-front`: public PKCE S256 client for the SPA.

  A `groups` client scope puts group membership into tokens as the `groups` claim (non-full-path). The groups (`rmu-admin`, `rmu-core-law`, `rmu-spell-law`, `rmu-treasure-law`, `rmu-creature-law-i`) gate access to rulebook content.
- **Env convention** (`docs/architecture/configuration.adoc`): `RMU_` prefix, `_URI` suffix for every URL, `RMU_API_<NAME>_URI`, `RMU_MONGO_<NAME>_URI`, `RMU_IAM_*`, `RMU_KAFKA_*`, `RMU_<NAME>_<SETTING>`; same names in APIs, MFEs and compose. The platform `.env` passes shared values under the name the services read (`RMU_IAM_CLIENT_ID`, `RMU_KAFKA_BROKERS`, `RMU_MEDIA_S3_*`), builds Mongo URIs from `MONGO_USER`/`MONGO_PASSWORD`, and keeps browser values as `RMU_MFE_*`. `compose/apis.yaml` still sets a few `legacy` names for older images. Images are `labcabrera/rmu-api-<name>:${RMU_API_<NAME>_VERSION:-latest}`. A new service needs `compose/apis.yaml`, the gateway route, `docs/architecture/services.adoc`, and the C4 diagram.
- **Media**: `rmu-api-media` stores images in S3, using the `RMU_MEDIA_S3_*` values from `.env`.

## Gotchas

- Before wiring an env var, check what the API actually reads (its `.env.example`, or the Joi schema in `app.module.ts`). Known exceptions:
  - users also reads `RMU_IAM_ADMIN_URI` (Keycloak admin REST base, `.../admin/realms/<realm>`).
  - tactical requires `RMU_API_ATTACK_TABLES_URI` and `RMU_API_NPCS_URI`. Since the combat plugin refactor (workspace spec 003) it computes attacks itself and no longer calls rmu-api-attack; older images still read `RMU_API_ATTACK_URI` (kept in compose as legacy).
  - attack (Python) reads `RMU_MONGO_ATTACK_URI`, `RMU_MONGO_ATTACK_DATABASE`, and `RMU_API_ATTACK_TABLES_URI`.
  - npcs (not checked out) still reads `RMU_IAM_BASE_URL` and `RMU_KAFKA_PARTITION_COUNT`.
  - Published images of users, tactical, attack and media still read older names; `compose/apis.yaml` sets them as `legacy` until those APIs release (`docs/architecture/configuration.adoc`).
- The `apis` and `tools` profiles must always be enabled together with `infrastructure`. They `depends_on` mongo/kafka, so without it Compose fails with `depends on undefined service`.
- Relative paths in `compose/*.yaml` (bind mounts) resolve against `compose/`, not the repo root. Variable interpolation still uses the root `.env`.
- The gateway (Caddy) resolves upstreams per request, so it starts with any subset of services running. Each MFE route lists the container first and `host.docker.internal:<dev port>` second with `lb_policy first`: a stopped container falls back to the dev server. Keep that pattern and the `handle /mfe/*` 404, which stops unknown remotes from getting the shell's `index.html`.
- MFE images take their URLs at runtime (`env-config.js` from the container environment). The shell's config is the one in effect in the browser, so it carries every remote and API URL, as gateway-relative paths.
- The default network is named `rmu-network` (declared in the root `compose.yaml`), so containers started outside Compose (`make docker-run` in an API repo) can join it. If it was created by hand with `docker network create`, Compose rejects it: run `docker compose --profile '*' down && docker network rm rmu-network` once.
- Kafka from the host must use `localhost:9093` (`PLAINTEXT_HOST`). Connecting to `localhost:9092` bootstraps but then receives `rmu-kafka-broker:9092` as the advertised address, which the host cannot resolve.
- Terraform state is local and per stack (`terraform/stacks/<stack>/terraform.tfstate`). `.terraform.lock.hcl` is versioned. After `down -v`, `plan` shows the Keycloak resources as deleted outside Terraform, and `apply` recreates them.
- `.env`, `terraform.tfvars`, Terraform state, and `backups/` are gitignored. Keep real secrets out of `.env.example` and `terraform.tfvars.example`.
- Licensing: don't commit copyrighted Rolemaster/ICE content (tables, rule text, seed data, Mongo dumps). Some init data is deliberately kept out of the public repo.
