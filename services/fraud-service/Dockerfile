FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 1. Fixed the space in --no-install-recommends and switched to native python3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 2. Fixed typos (changed '1n' and 'In' to 'ln') and pointed symlinks to python3
RUN ln -sf /usr/bin/python3 /usr/bin/python && \
    ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /app

COPY requirements.txt .

# 3. Fixed the space in --no-cache-dir
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 3007
CMD ["python", "-m", "src.server"]