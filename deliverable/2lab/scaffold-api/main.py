"""ЛР №2: только техническая проверка подготовленного окружения."""
from fastapi import FastAPI

app = FastAPI(title='Проверка окружения ЛР №2')


@app.get('/api/health')
def health():
    return {'status': 'ok', 'lab': 2, 'stage': 'environment-ready'}
