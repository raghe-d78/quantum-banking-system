FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser

COPY services/fraud-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/fraud-service/src ./src
# Model bundles live on a named volume (see docker-compose.yml) so they survive
# container recreation; first boot trains and persists them.
RUN mkdir -p /app/models && chown -R appuser:appuser /app
USER appuser

ENV PORT=3007 FRAUD_MODELS_DIR=/app/models
EXPOSE 3007

# Single gunicorn worker keeps the Kafka consumer thread a singleton.
CMD ["gunicorn", "--bind", "0.0.0.0:3007", "--workers", "1", "--threads", "4", "--timeout", "120", "src.app:app"]
