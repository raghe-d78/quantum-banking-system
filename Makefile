COMPOSE_FILE = infrastructure/docker-compose.yml
COMPOSE_FILE_DEV = infrastructure/docker-compose.dev.yml

up:
	docker compose -f $(COMPOSE_FILE) up --build
dev:
	docker compose -f $(COMPOSE_FILE) -f $(COMPOSE_FILE_DEV) up --build


down:
	docker compose -f $(COMPOSE_FILE) down

restart:
	docker compose -f $(COMPOSE_FILE) down
	docker compose -f $(COMPOSE_FILE) up --build

logs:
	docker compose -f $(COMPOSE_FILE) logs -f

ps:
	docker compose -f $(COMPOSE_FILE) ps

build:
	docker compose -f $(COMPOSE_FILE) build

rebuild:
	docker compose -f $(COMPOSE_FILE) down
	docker compose -f $(COMPOSE_FILE) up --build

clean:
	docker compose -f $(COMPOSE_FILE) down -v

db-shell:
	docker exec -it cockroachdb ./cockroach sql --insecure

db-init:
	docker exec -i cockroachdb ./cockroach sql --insecure < scripts/init-db.sql

# Upgrade an existing cluster to the Phase 6 schema (idempotent).
db-migrate:
	for f in scripts/migrations/*.sql; do echo "applying $$f"; docker exec -i cockroachdb ./cockroach sql --insecure < $$f; done

# Run every unit suite on the host (needs node + python deps installed).
test:
	cd shared && npm test
	cd services/account-service && npm test
	cd services/identity-service && npm test
	cd services/ledger-service && npm test
	cd services/api-gateway && npm test
	cd services/fraud-service && python -m pytest tests -q
	cd services/document-cv-service && python -m pytest tests -q

# End-to-end checks against a running stack (see docs/USAGE_GUIDE.md §9).
e2e-api:
	node scripts/e2e/api-workflow.mjs

e2e-cv:
	python3 scripts/e2e/make_checks.py && node scripts/e2e/cv-workflow.mjs

e2e-ui:
	python3 scripts/e2e/make_checks.py && cd scripts/e2e && npm install --no-audit --no-fund && npx playwright install chromium && node ui-walkthrough.mjs

prod:
	docker compose -f $(COMPOSE_FILE) -f infrastructure/docker-compose.prod.yml up -d --build

gateway:
	docker compose -f $(COMPOSE_FILE) up api-gateway

identity:
	docker compose -f $(COMPOSE_FILE) up identity-service

account:
	docker compose -f $(COMPOSE_FILE) up account-service

# Phase 1.4 — concurrent-deposits load test (Node fallback; k6 variant lives next to it)
loadtest:
	@echo "Usage: ACCOUNT_ID=<uuid> make loadtest [N=100]"
	node scripts/loadtest/concurrent-deposits.js $(N)