# Receipt Manager

AI-powered receipt processing system that extracts item-level data from receipt images using Vision Language Models (VLM).

**Part 3** of the [AI Infrastructure Blog Series](https://github.com/FarzamMohammadi/self-hosted-ai-stack) - demonstrating practical VLM usage for business automation.

## Quick Start

```bash
# 1. Clone and configure
git clone <repository-url>
cd receipt-manager
cp .env.example .env

# 2. Pull your VLM model
ollama pull qwen3-vl:8b-thinking-q8_0

# 3. Configure .env (REQUIRED)
#    - Set OLLAMA_VLM_MODEL=qwen3-vl:8b-thinking-q8_0
#    - N8N_API_KEY will be set after step 5

# 4. Start services
docker-compose up -d

# 5. Get your N8N API Key
#    - Open http://localhost:5678
#    - Settings → n8n API → Create an API Key
#    - Add to .env: N8N_API_KEY=your_key_here

# 6. Import workflows
python scripts/setup-n8n.py

# 7. Restart n8n to register webhooks
docker compose restart n8n
```

**Access Points:**
- **Web Interface:** http://localhost:8080
- **N8N Workflows:** http://localhost:5678
- **pgAdmin:** http://localhost:5050 (admin@local.dev / admin)

## Features

- Upload receipts (images) via web interface
- Automated VLM processing using Ollama
- Item-level extraction: name, price, tax, confidence scores
- Queue-based processing with automatic retries
- PostgreSQL database for structured storage
- CSV export of all processed data
- Simple web interface (vanilla JS, no frameworks)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│    N8N      │────▶│  PostgreSQL │
│  (Web UI)   │     │ (Workflows) │     │  (Storage)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Ollama    │
                   │    (VLM)    │
                   └─────────────┘
```

**Data Flow:**
1. Upload receipt via web interface
2. N8N creates job in queue
3. Queue monitor (30s interval) picks up pending jobs
4. VLM processor extracts items from receipt image
5. Items stored in database with confidence scores
6. View/export via web interface

**Stack:**
- **Database:** PostgreSQL 15
- **Orchestration:** N8N (6 workflows)
- **VLM:** Ollama (configurable model via OLLAMA_VLM_MODEL)
- **Web:** Nginx + Vanilla JavaScript
- **Containerization:** Docker Compose

## Prerequisites

1. **Docker & Docker Compose** installed
2. **Ollama** running on host machine with any vision-capable model:
   ```bash
   # Recommended (best reasoning + vision capabilities)
   ollama pull qwen3-vl:8b-thinking-q8_0
   ```
   Any Ollama model with vision capabilities will work. See [Ollama Vision Models](https://ollama.com/search?c=vision) for options.

## Configuration

**Required settings in `.env`:**

| Variable | Description |
|----------|-------------|
| `N8N_API_KEY` | API key from n8n (Settings → n8n API) |
| `OLLAMA_VLM_MODEL` | Any Ollama vision model (recommended: `qwen3-vl:8b-thinking-q8_0`) |

**Optional settings (have sensible defaults):**

| Variable | Default | Description |
|----------|---------|-------------|
| `VLM_API_URL` | `http://host.docker.internal:11434` | Ollama API endpoint |
| `WEB_PORT` | `8080` | Web interface port |
| `N8N_PORT` | `5678` | N8N port |
| `POSTGRES_*` | (see .env.example) | Database credentials |

## Project Structure

```
receipt-manager/
├── db/
│   ├── migrations/            # SQL migrations
│   ├── migrate.py             # Migration runner
│   └── Dockerfile
├── n8n/
│   └── workflows/             # N8N workflow JSON files
├── pgadmin/
│   ├── servers.json           # Auto-configured PostgreSQL
│   └── entrypoint.sh
├── web/
│   ├── index.html             # Upload page
│   ├── receipts.html          # Review & export page
│   ├── css/
│   └── js/
├── volumes/                   # Persistent data (gitignored)
├── docker-compose.yml
├── nginx.conf
└── .env.example
```

## Database Schema

**Tables:**
1. **receipts** - Uploaded files with metadata and extracted items (JSONB)
2. **receipt_processing_jobs** - VLM processing queue

**Key Design:**
- Items stored as JSONB array in receipts table for atomic updates
- Cascade delete from receipts to jobs
- Indexes on status, dates, and JSONB for fast queries

## Useful Commands

### Database

```bash
# Connect to PostgreSQL
docker exec -it receipt-postgres psql -U receipt_user -d receipt_manager

# View receipts
SELECT id, filename, processing_status, items_count FROM receipts;

# View processing jobs
SELECT id, status, retry_count, created_at FROM receipt_processing_jobs;
```

### Docker

```bash
# View logs
docker-compose logs -f n8n
docker-compose logs -f postgres

# Restart services
docker-compose restart n8n

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

### Backup

```bash
# Backup database
docker exec receipt-postgres pg_dump -U receipt_user receipt_manager > backup.sql

# Restore database
cat backup.sql | docker exec -i receipt-postgres psql -U receipt_user -d receipt_manager
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Verify .env file exists and has required values
cat .env | grep -E "(N8N_API_KEY|OLLAMA_VLM_MODEL)"

# Check port conflicts
lsof -i :5432 -i :5678 -i :8080
```

### Migrations fail

```bash
# Check db-migrator logs
docker-compose logs db-migrator

# Manually run migrations
docker-compose run --rm db-migrator
```

### VLM processing fails

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Check your model is available
ollama list

# Test VLM endpoint (replace with your model)
curl http://localhost:11434/api/generate -d '{"model": "qwen3-vl:8b-thinking-q8_0", "prompt": "test"}'
```

## Documentation

- [API Endpoints](API_ENDPOINTS.md) - Complete webhook reference
- [Testing Guide](TESTING.md) - Workflow testing instructions

## License

MIT
