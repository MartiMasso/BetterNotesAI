# app-api

## Docker (macOS)

1) Start Docker Desktop::

```bash
open -a Docker
```

2) Build the image:

```bash
docker build -t betternotes-api .
```

3) Run the container:

```bash
docker run --rm -p 4000:4000 betternotes-api
```

Optional: if you need AI endpoints, pass your key:

```bash
docker run --rm -p 4000:4000 -e OPENAI_API_KEY=YOUR_KEY betternotes-api
```

## Docker Compose

From `app-api/`:

```bash
docker compose up --build
```
