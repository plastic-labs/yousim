# https://pythonspeed.com/articles/base-image-python-docker-images/
# https://testdriven.io/blog/docker-best-practices/
FROM python:3.11-slim-bullseye

RUN apt-get update && apt-get install -y build-essential curl

WORKDIR /app

# Set Python environment variables and default port
ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONHASHSEED=random \
    PORT=8000

# Install uv and add to PATH
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    mv /root/.local/bin/uv /usr/local/bin/ && \
    mv /root/.local/bin/uvx /usr/local/bin/

# Copy requirements and install dependencies
COPY requirements.txt .
RUN uv pip install --system -r requirements.txt

RUN addgroup --system app && adduser --system --group app
RUN chown -R app:app /app
USER app

COPY --chown=app:app api/ api/

CMD fastapi run api/app --host 0.0.0.0
