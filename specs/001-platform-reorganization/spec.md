# 001 — Platform repository reorganization

- **Status:** In progress (phases 1–7 implemented except where [plan.md](plan.md) says otherwise; phase 8 pending)
- **Date:** 2026-10-17
- **Plan:** [plan.md](plan.md)

## Context

`rmu-platform` is the umbrella repository of RMU Engine, a collection of microservices (NestJS, Python, Node.js) and micro-frontends (Webpack Module Federation). Each one lives in its own `labcabrera/rmu-*` repository. There is no monorepo, and none is wanted.

Today the repository mixes current and legacy pieces:

- **Current stack:** the root `compose.yaml` (~400 lines) has the `infrastructure` and `apis` profiles. The `frontend` profile is declared but has no services.
- **Legacy compose files:** `docker-compose/` holds `docker-compose-apis.yaml`, `-kc.yaml` and `-nginx.yaml`. They are duplicated and out of date (realm `rmu-local`, different ports, Keycloak on 8080). One of them contains a **committed, hardcoded client secret**.
- **Nginx gateway:** `docker-compose/nginx/conf.d/default.conf` exists, but the current compose does not use it.
- **Loose scripts:**
  - `local-start-micro-front-ends.sh` has a `BASE_DIR` from another machine and a broken shebang (`!/bin/bash`).
  - `mongodb/mongo-backup.sh` keeps the dumps in the same folder as the script.
- **Keycloak:** `terraform/` with the `modules/keycloak` module works, but the variable defaults include LAN IPs (`192.168.1.107`).
- **Documentation:** `README.adoc` is partly obsolete (it mentions `minikube/`, `argocd/` and `k8s/`). The C4 diagram is in `diagrams/`.
- **Known bugs in `compose.yaml`:**
  - tactical points to the host `rmu-apu-items` (typo).
  - npcs points to items on port 3004 instead of 3006.
  - users uses `RMU_IAM_JWKS_URI` where the other APIs use `RMU_IAM_JWK_URI`.
  - There is no `rmu-api-attack` service.
  - There are no MFE services.

## Goal

Make `rmu-platform` the single source of truth for **how the application is run and deployed**:

1. Local development Docker Compose, split into layers: infrastructure, tools, APIs, MFEs, observability and gateway.
2. Project documentation in English.
3. Terraform for Keycloak configuration (already exists).
4. In the future, Terraform for AWS: one EC2 instance running the APIs with Docker Compose behind an ALB, and the MFEs on S3 + CloudFront.

Service repositories keep owning their code, Dockerfile and image. `rmu-platform` only **consumes them by image and version**.

## Non-goals

- Moving application code into this repository.
- Kubernetes, Argo CD or Minikube.
- Changing how individual services are built or released.

## Principles

- **Polyrepo + platform repo:** this repository holds no application code. Each service publishes `labcabrera/rmu-<x>:<version>`. The platform pins versions in a single place (`.env`) instead of relying on `:latest`.
- **One definition per service:** local development and the EC2 deployment use the same service files, with environment differences in overrides. No more divergent copies like the ones in `docker-compose/`.
- **Local development separate from deployment:** `compose/` is for the laptop and `deploy/` is for AWS. Both share the same base definitions.
- **Separate Terraform state per stack:** local Keycloak, AWS network/compute and AWS frontends each have their own state, so applying one part never touches the others.
- **English documentation under `docs/`:** the README becomes a short landing page.

## Target structure

```
rmu-platform/
├── README.adoc                  # short landing page: what it is, quickstart, links to docs/
├── AGENTS.md / CLAUDE.md        # agent guidance, updated to the new layout
├── Makefile                     # single entry point: make up / down / logs / tf-* / mongo-*
├── .env.example                 # shared variables + image versions (RMU_API_CORE_VERSION=...)
│
├── compose.yaml                 # root: ONLY `include:` of the files in compose/ (Compose >= 2.20)
├── compose/
│   ├── infrastructure.yaml      # mongo, postgres, keycloak, kafka              (profile infrastructure)
│   ├── tools.yaml               # kafka-ui, mongo-express                       (profile tools, optional)
│   ├── apis.yaml                # all APIs, x-api-common anchors for IAM/Kafka  (profile apis)
│   ├── mfes.yaml                # shell + MFEs as static nginx images           (profile mfes)
│   ├── gateway.yaml             # nginx mirroring the ALB path routing          (profile gateway)
│   ├── observability.yaml       # grafana/otel-lgtm                             (profile observability)
│   └── config/
│       ├── nginx/               # gateway config (from docker-compose/nginx)
│       ├── otel/                # OTel collector config
│       └── grafana/             # provisioned datasources and dashboards
│
├── deploy/
│   └── ec2/
│       ├── compose.prod.yaml    # EC2 override: no public ports except the ALB target,
│       │                        # restart: unless-stopped, no kafka-ui, memory limits, logging driver
│       ├── .env.prod.example
│       └── cloud-init/          # user-data: install docker, fetch this repo, docker compose up
│
├── terraform/
│   ├── modules/
│   │   ├── keycloak/            # existing, moved as is
│   │   ├── network/             # VPC, subnets, security groups               (future)
│   │   ├── compose-host/        # EC2 + IAM role + EBS + cloud-init           (future)
│   │   ├── alb/                 # ALB, HTTPS listeners, path target groups    (future)
│   │   └── static-site/         # S3 + CloudFront + OAC for MFEs and assets   (future)
│   └── stacks/
│       ├── keycloak-local/      # today's root terraform/ (provider -> localhost:8090)
│       ├── keycloak-aws/        # same module against the AWS Keycloak        (future)
│       ├── aws-bootstrap/       # S3 bucket + DynamoDB lock for remote state  (future, once)
│       ├── aws-platform/        # network + compose-host + alb + route53/acm  (future)
│       └── aws-frontends/       # static-site for the MFEs                    (future)
│
├── scripts/
│   ├── mongo-backup.sh          # parameterized (URI, target backups/)
│   ├── mongo-restore.sh         # docker exec -i rmu-mongo mongorestore --archive --gzip --drop --nsExclude 'admin.*'
│   └── start-mfes-dev.sh        # replaces local-start-micro-front-ends.sh; BASE_DIR from env/argument
│
├── backups/                     # gitignored (Mongo dumps)
│
├── specs/                       # numbered specs: NNN-<objective>/{spec.md,plan.md}
│
└── docs/
    ├── index.adoc               # documentation map
    ├── architecture/
    │   ├── overview.adoc        # C4 view, call flow, Kafka events
    │   ├── services.adoc        # catalog: repo, port, database, dependencies, image
    │   ├── frontends.adoc       # Module Federation contract, remotes, env vars
    │   ├── auth.adoc            # realm, clients, groups, claims
    │   └── diagrams/            # c4-context.plantuml (+ rendered png)
    ├── local-development.adoc   # profiles, common combinations, running an API from source
    ├── operations/
    │   ├── mongo-backup-restore.adoc
    │   └── keycloak-terraform.adoc
    ├── deployment/
    │   └── aws.adoc             # target architecture: EC2 + ALB + CloudFront
    └── adr/                     # architecture decision records
```

## Key decisions

### Compose `include:` instead of multiple `-f` flags

- `docker compose up` keeps working from the repository root.
- Profiles (`COMPOSE_PROFILES`) still select what starts.
- Each file is small and covers one topic.
- `apis.yaml` defines an `x-api-common` block (`depends_on`, `LOG_LEVEL`, IAM, Kafka) that each API merges with `<<:`.

### The `apis` profile needs the infrastructure

The APIs depend on Mongo and Kafka, which are in the `infrastructure` profile, so starting `apis` alone fails. The docs must say so, and the Makefile adds the infrastructure automatically (`make up-apis` runs `infrastructure,apis`).

### Frontends in Compose

- **Default:** each MFE runs from the static nginx image published by its own repo.
- **Developing an MFE:** keep using `npm run start:live` through `scripts/start-mfes-dev.sh`.
- **MFE locations:** the shell's `RMU_MFE_*_PUBLIC_PATH` variables point at either the compose services or the dev servers, as documented in `docs/architecture/frontends.adoc`.
- **Profile name:** the profile is `mfes` (file `compose/mfes.yaml`), not `frontends`. The default `COMPOSE_PROFILES` is `infrastructure,apis,mfes,tools`.

### Local gateway mirrors the AWS ALB

The nginx gateway uses the same path prefixes the ALB will use (`/core/`, `/strategic/`, `/sso/`, ...). Whatever works locally works behind the ALB.

### Observability

- **First step:** a single `grafana/otel-lgtm` image (Grafana, Loki, Tempo, Prometheus and an OTel Collector).
- **Next step:** the APIs export OTLP to `rmu-otel:4317`. This needs work in each API repository; this repository only defines the endpoint.

### AWS target (design only, no code yet)

- **EC2:** a single instance runs `compose/infrastructure.yaml` + `compose/apis.yaml` + `deploy/ec2/compose.prod.yaml`.
- **ALB:** terminates TLS (ACM) and routes by path to the gateway port.
- **MFEs:** S3 buckets + CloudFront with OAC.
- **Media assets:** already on S3 (`rmu-static-assets-pro`).
- **Terraform remote state:** S3 + DynamoDB lock.

### Image versioning

`.env.example` declares `RMU_API_CORE_VERSION=latest` and similar variables, and the compose files use `image: labcabrera/rmu-api-core:${RMU_API_CORE_VERSION:-latest}`. Deployments to AWS pin explicit versions.

## Open questions

- **Keycloak, Mongo and Kafka on AWS:**
  - **Simple (recommended to start):** run them on the same EC2 instance.
  - **Managed alternative:** MongoDB Atlas and MSK. MSK is expensive.
- **Documentation format:** ~~AsciiDoc or Markdown~~. Resolved: AsciiDoc, like the README.
- **CloudFront layout for MFEs:** one distribution per MFE, or a single one with path prefixes (`/core/`, `/strategic/`, ...). A single distribution is recommended: fewer certificates and less CORS.
- **Observability timing:** instrument the APIs with OpenTelemetry now, or leave it for a later phase.
