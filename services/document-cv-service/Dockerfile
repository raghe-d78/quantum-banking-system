FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Tesseract OCR (English + French traineddata) and the shared libs OpenCV needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-fra libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser

COPY services/document-cv-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/document-cv-service/src ./src
RUN mkdir -p /data/documents && chown -R appuser:appuser /app /data
USER appuser

ENV PORT=3008 DOCUMENT_STORE_DIR=/data/documents
EXPOSE 3008
CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "3008", "--workers", "1"]
