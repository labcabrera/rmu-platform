# 001 — Platform repository reorganization: plan

- **Spec:** [spec.md](spec.md)

Each phase is an independent PR. Phases 1–7 cover the local platform and the documentation. Phase 8 covers AWS and starts later.

## Phases

### 1. Cleanup and security

- [ ] Rotate the `rmu-client` secret committed in `docker-compose/docker-compose-apis.yaml`. It stays in git history, so treat it as leaked. Pending: it has to be done in the Keycloak instance that uses it (realm `rmu-local`).
- [x] Delete `docker-compose/`. Keep a copy of the nginx `default.conf` for phase 4.
- [x] Move the scripts to `scripts/` and the dumps to `backups/`.
- [x] Update `.gitignore`:
  - Add `backups/`.
  - Decide whether to version `.terraform.lock.hcl` (recommended: yes). Versioned.

### 2. Split `compose.yaml`

- [x] Create `compose/{infrastructure,tools,apis}.yaml` and reduce the root `compose.yaml` to `include:` only.
- [x] Add `x-api-common` anchors in `apis.yaml`.
- [x] Fix the known bugs:
  - [x] `rmu-apu-items` → `rmu-api-items` (tactical).
  - [x] items port `3004` → `3006` (npcs).
  - [x] `RMU_IAM_JWKS_URI` in users: confirm with the `rmu-api-users` repo which name it expects. It expects `RMU_IAM_JWKS_URI`, so it stays.
  - [x] Found while checking: tactical requires `RMU_API_ATTACK_URI` (it failed Joi validation without it) and reads `RMU_API_NPC_URI`; it never read `RMU_API_ATTACK_TABLES_URI`.
  - [x] Hardcoded `RMU_KAFKA_BROKERS` in npcs → `${KAFKA_BROKERS}`.
- [x] Add `rmu-api-attack` (port 8000).
- [x] Parameterize image versions (`${RMU_API_<X>_VERSION:-latest}`).

### 3. Makefile and scripts

- [x] Makefile targets:
  - `up`, `up-infra`, `up-apis`, `down`, `ps`, `logs s=<svc>`
  - `mongo-backup`, `mongo-restore f=<file>`
  - `tf-keycloak-plan`, `tf-keycloak-apply`
  - `mfes-dev`
- [x] `scripts/mongo-backup.sh` and `scripts/mongo-restore.sh`, parameterized and using `mongodump`/`mongorestore` inside the `rmu-mongo` container.
- [x] `scripts/start-mfes-dev.sh` with `BASE_DIR` from an environment variable or argument.

### 4. Frontends and gateway

- [ ] `compose/mfes.yaml` (profile `mfes`). The file exists but defines no services: no MFE publishes a static image yet (only `rmu-mfe-shell` has an image on Docker Hub, and its Dockerfile runs the webpack dev server). The image contract is in `docs/architecture/frontends.adoc`.
- [x] `compose/gateway.yaml` (profile `gateway`) with the config in `compose/config/nginx/`.
- [x] Align the gateway paths with the future ALB rules.
- [ ] This phase needs each MFE repo to publish a static image. Where one does not exist yet, open a TODO in that repo. Pending for every MFE.

### 5. Observability

- [x] `compose/observability.yaml` with `grafana/otel-lgtm` (profile `observability`).
- [x] Document the OTLP endpoint for the APIs.

### 6. Keycloak Terraform

- [x] Move to `terraform/modules/keycloak` + `terraform/stacks/keycloak-local`.
- [x] Move the existing local state to the new stack directory without recreating resources. The addresses are unchanged (`module.keycloak.*`). The "no changes" plan is still to be confirmed against a Keycloak that has the realm.
- [x] Move the LAN IPs out of the variable defaults and into `terraform.tfvars`.

### 7. English documentation

- [x] Create `docs/` following the tree in the spec.
- [x] Reduce `README.adoc` to a landing page.
- [x] Move the module tables to `docs/architecture/services.adoc`.
- [x] Move `diagrams/` to `docs/architecture/diagrams/`.
- [x] Write the first ADR (`0001-polyrepo-platform`).
- [x] Update `AGENTS.md` and the workspace `CLAUDE.md`.

### 8. AWS (future)

- [ ] `docs/deployment/aws.adoc` + ADR, before any code. `deploy/ec2/` also belongs to this phase.
- [ ] Then the stacks, in this order:
  1. `aws-bootstrap`
  2. `aws-platform`
  3. `aws-frontends`
  4. `keycloak-aws`

## Affected files (phases 1–7)

- **Deleted or moved:**
  - `docker-compose/`
  - `local-start-micro-front-ends.sh`
  - `mongodb/`
  - `diagrams/`
  - the root `terraform/*.tf`
- **Created:** `compose/*`, `scripts/*`, `Makefile`, `docs/**`, `terraform/stacks/keycloak-local/*`.
- **Rewritten:** `compose.yaml`, `.env.example`, `README.adoc`, `AGENTS.md`, `.gitignore`.

## Verification

- **Compose:**
  - `docker compose config` succeeds for every profile combination.
  - `docker compose --profile infrastructure --profile apis up -d` brings every container up and healthy.
  - `curl localhost:3001/v1/...` with a Keycloak token returns data.
  - Diffing `docker compose config` before and after phase 2 shows only the bug fixes.
- **Gateway:** `curl localhost/core/v1/...` and `curl localhost/sso/realms/rmu/.well-known/openid-configuration` both respond.
- **Frontends:** OIDC login works in the shell served by Compose, and every remote loads.
- **Observability:** Grafana responds with its datasources provisioned.
- **Terraform:**
  - `terraform fmt -check -recursive && terraform validate` pass in every stack.
  - In `keycloak-local`, `terraform plan` shows **no changes** after the state move.
- **Docs:** no links point to paths that no longer exist. Grep for `docker-compose/`, `minikube` and `k8s`.
