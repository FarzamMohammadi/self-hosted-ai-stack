# Part 3: Receipt Processing with VLM

AI-powered receipt processing using Vision Language Models. Upload receipt images, get structured JSON with line items, taxes, and confidence scores.

## Quick Start

```bash
# 1. Pull VLM model
ollama pull qwen3-vl:8b-thinking-q8_0

# 2. Configure
cp .env.example .env
# Edit .env: set OLLAMA_VLM_MODEL=qwen3-vl:8b-thinking-q8_0

# 3. Start services
docker-compose up -d

# 4. Get n8n API key
# Open http://localhost:5678 → Settings → n8n API → Create API Key
# Add to .env: N8N_API_KEY=your_key_here

# 5. Import workflows
python scripts/setup-n8n.py
docker compose restart n8n
```

**Access:**
- Web Interface: http://localhost:8080
- n8n Workflows: http://localhost:5678
- pgAdmin: http://localhost:5050 (admin@local.dev / admin)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│    n8n      │────▶│  PostgreSQL │
│  (Web UI)   │     │ (Workflows) │     │  (Storage)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Ollama    │
                   │    (VLM)    │
                   └─────────────┘
```

1. Upload receipt via web interface
2. n8n creates processing job
3. Queue monitor triggers VLM processor (30s interval)
4. VLM extracts items → stored in PostgreSQL
5. View/export via web interface

## Configuration

**Required in `.env`:**

| Variable | Description |
|----------|-------------|
| `N8N_API_KEY` | From n8n Settings → n8n API |
| `OLLAMA_VLM_MODEL` | Vision model (e.g., `qwen3-vl:8b-thinking-q8_0`) |

See `.env.example` for optional settings.

## Project Structure

```
part-3-receipt-processing-with-vlm/
├── db/migrations/        # SQL schema
├── n8n/workflows/        # 6 n8n workflow JSONs
├── prompts/ocr/          # VLM prompt iterations (v1-v9)
├── scripts/              # Setup automation
├── web/                  # Upload & review interface
├── docker-compose.yml
└── .env.example
```

## Documentation

- [API Endpoints](API_ENDPOINTS.md) - Webhook reference
