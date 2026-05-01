FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libfreetype6-dev \
      libpng-dev \
    && rm -rf /var/lib/apt/lists/*

COPY services/quantum-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/quantum-service/src ./src

ENV PORT=3005
ENV QUANTUM_BACKEND=simulator
ENV QRNG_BUFFER_BYTES=4096
EXPOSE 3005

CMD ["gunicorn", "--bind", "0.0.0.0:3005", "--workers", "2", "--threads", "2", "--timeout", "60", "src.app:app"]
