# Ichido intake agent for LiveKit Cloud (`lk agent create` / `lk agent deploy` build this file).
# Secrets are not baked in: LiveKit Cloud injects them at runtime (`lk agent create --secrets-file .env`).
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
RUN useradd --create-home --uid 10001 agent
WORKDIR /home/agent/app

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY app.py ./
RUN chown -R agent /home/agent
USER agent
# Model files are fetched at build time (into the runtime user's cache) so a cold start does not download them.
# app.py reads AGENT_BRIDGE_SECRET at import; a throwaway value is enough to run the downloader.
RUN AGENT_BRIDGE_SECRET=build uv run --no-sync python app.py download-files

CMD ["uv", "run", "--no-sync", "python", "app.py", "start"]
