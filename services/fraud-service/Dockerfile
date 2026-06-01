FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY services/fraud-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/fraud-service/src    ./src
COPY services/fraud-service/models ./models

ENV PORT=3007
EXPOSE 3007

# app.py boots Flask AND the Kafka consumer thread; gunicorn with a single
# worker keeps consumer state singleton-safe.
CMD ["gunicorn", "--bind", "0.0.0.0:3007", "--workers", "1", "--threads", "4", "--timeout", "120", "src.app:app"]
