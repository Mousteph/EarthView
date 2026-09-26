FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

RUN groupadd --system --gid 10001 earthview \
    && useradd --system --uid 10001 --gid earthview --create-home earthview \
    && mkdir -p /app/backend/.cache \
    && chown -R earthview:earthview /app/backend

COPY --chown=earthview:earthview app ./app

USER earthview

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
