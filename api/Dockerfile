# Recheck API. Build from the repository root (compose.yaml does this):
#   docker build -f api/Dockerfile .
# The root context is needed because the API reads ../question-bank at runtime.
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1

# Keep the repo layout: question_bank.py finds the bank at parents[3] / "question-bank",
# which is /app/question-bank when the package lives in /app/api/src/recheck.
WORKDIR /app/api

# Dependencies first so code changes don't reinstall them.
COPY api/pyproject.toml api/uv.lock api/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY question-bank /app/question-bank
COPY api/src ./src
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 recheck
USER recheck

ENV PATH="/app/api/.venv/bin:$PATH"
EXPOSE 8000

# nginx and Caddy sit in front, so trust their X-Forwarded-* headers.
CMD ["uvicorn", "recheck.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
