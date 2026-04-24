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

gateway:
	docker compose -f $(COMPOSE_FILE) up api-gateway

identity:
	docker compose -f $(COMPOSE_FILE) up identity-service
test-identity:
	docker compose exec identity npm test

account:
	docker compose -f $(COMPOSE_FILE) up account-service

quantum:
	docker compose -f $(COMPOSE_FILE) up quantum-service

qkd:
	docker compose -f $(COMPOSE_FILE) up qkd-kms

infra:
	docker compose -f $(COMPOSE_FILE) up redis kafka zookeeper prometheus grafana nginx

test-quantum:
	cd services/quantum-service && pip install -r requirements.txt -q && pytest -q

test-qkd:
	cd services/qkd-kms && pip install -r requirements.txt -q && pytest -q