FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi==0.135.3 uvicorn==0.44.0 starlette==1.0.0 && useradd --uid 10001 --create-home appuser
COPY main.py .
USER appuser
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
