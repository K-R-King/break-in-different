FROM python:3.11-alpine
WORKDIR /app
ENV PYTHONUNBUFFERED=1 SHARED_FIXTURES=/app/shared/fixtures
COPY agent/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY shared/fixtures/skill-aliases.json shared/fixtures/skill-aliases.json
COPY agent/scorer.py agent/main.py ./
USER nobody
CMD ["python", "main.py"]
