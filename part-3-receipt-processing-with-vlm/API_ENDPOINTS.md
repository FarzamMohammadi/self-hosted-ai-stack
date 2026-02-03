# Receipt Manager API Endpoints

Complete reference for all N8N webhook endpoints in the Receipt Manager system.

---

## Base URL

```
http://localhost:8080/webhook
```

---

## Endpoints Overview

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/upload-receipt` | POST | Upload receipt file and create processing job | ✅ Active |
| `/process-receipt-vlm` | POST | Process receipt with VLM (internal, triggered by queue) | ✅ Active |
| `/get-receipts` | GET | List all receipts with optional filtering | ✅ Active |
| `/get-receipt-detail` | GET | Get single receipt details with extracted items | ✅ Active |
| `/export-receipts` | GET | Export receipts and items to CSV file | ✅ Active |

---

## 1. Upload Receipt

**Endpoint**: `POST /webhook/upload-receipt`

**Purpose**: Upload a receipt image and create a processing job

**Content-Type**: `multipart/form-data`

**Request**:
```bash
curl -X POST http://localhost:8080/webhook/upload-receipt \
  -F "data=@/path/to/receipt.jpg"
```

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Receipt uploaded successfully and queued for processing",
  "receipt": {
    "filename": "receipt.jpg",
    "publicUrl": "/uploads/receipts/2025/01/20/uuid-receipt.jpg",
    "processingStatus": "pending",
    "uploadedAt": "2025-01-20T12:00:00.000Z"
  },
  "job": {
    "status": "pending",
    "priority": 5,
    "createdAt": "2025-01-20T12:00:00.000Z"
  }
}
```

**Supported File Types**:
- image/jpeg
- image/jpg
- image/png
- image/webp

**Max File Size**: 10MB

**Error Responses**:
- `400` - Invalid file type or size
- `413` - File too large
- `500` - Server error

---

## 2. Get Receipts List

**Endpoint**: `GET /webhook/get-receipts`

**Purpose**: Retrieve list of all receipts with optional filtering

**Headers**:
```
Accept: application/json
```

**Query Parameters**:

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `status` | string | Filter by processing status | `completed`, `pending`, `processing`, `failed` |
| `date_from` | string | Filter receipts from date (ISO 8601) | `2025-01-01` |
| `date_to` | string | Filter receipts until date (ISO 8601) | `2025-01-31` |
| `search` | string | Search filename (case-insensitive) | `invoice` |
| `limit` | number | Max results to return | `100` (default: 1000) |
| `offset` | number | Pagination offset | `20` (default: 0) |

**Examples**:

Get all receipts:
```bash
curl -X GET "http://localhost:8080/webhook/get-receipts" \
  -H "Accept: application/json"
```

Get completed receipts only:
```bash
curl -X GET "http://localhost:8080/webhook/get-receipts?status=completed" \
  -H "Accept: application/json"
```

Get receipts from date range:
```bash
curl -X GET "http://localhost:8080/webhook/get-receipts?date_from=2025-01-01&date_to=2025-01-31" \
  -H "Accept: application/json"
```

Search receipts by filename:
```bash
curl -X GET "http://localhost:8080/webhook/get-receipts?search=invoice" \
  -H "Accept: application/json"
```

Combined filters with pagination:
```bash
curl -X GET "http://localhost:8080/webhook/get-receipts?status=completed&limit=50&offset=0" \
  -H "Accept: application/json"
```

**Response** (200 OK):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "receipt1.jpg",
    "file_path": "/app/uploads/receipts/2025/01/20/uuid-receipt1.jpg",
    "file_size": 123456,
    "mime_type": "image/jpeg",
    "file_hash": "abc123def456",
    "items_count": 5,
    "total_confidence_score": 0.92,
    "processing_status": "completed",
    "created_at": "2025-01-20T12:00:00.000Z",
    "updated_at": "2025-01-20T12:01:00.000Z"
  },
  {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "filename": "receipt2.jpg",
    "file_path": "/app/uploads/receipts/2025/01/20/uuid-receipt2.jpg",
    "file_size": 234567,
    "mime_type": "image/jpeg",
    "file_hash": "def789ghi012",
    "items_count": 8,
    "total_confidence_score": 0.88,
    "processing_status": "completed",
    "created_at": "2025-01-20T13:30:00.000Z",
    "updated_at": "2025-01-20T13:31:00.000Z"
  }
]
```

**Empty Result**:
```json
[]
```

---

## 3. Get Receipt Detail

**Endpoint**: `GET /webhook/get-receipt-detail`

**Purpose**: Get detailed information for a single receipt including extracted items

**Headers**:
```
Accept: application/json
```

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `receipt_id` | UUID | Yes | Receipt ID to retrieve |

**Example**:
```bash
curl -X GET "http://localhost:8080/webhook/get-receipt-detail?receipt_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Accept: application/json"
```

**Response** (200 OK):
```json
{
  "receipt": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "grocery-receipt.jpg",
    "file_path": "/app/uploads/receipts/2025/01/20/uuid-grocery-receipt.jpg",
    "file_size": 123456,
    "mime_type": "image/jpeg",
    "file_hash": "abc123def456",
    "items_count": 5,
    "total_confidence_score": 0.92,
    "processing_status": "completed",
    "created_at": "2025-01-20T12:00:00.000Z",
    "updated_at": "2025-01-20T12:01:00.000Z"
  },
  "items": [
    {
      "item_name": "Organic Bananas",
      "item_base_price": 2.99,
      "item_tax_price": 0.24,
      "item_tax_percentage": 8.0,
      "item_total_price": 3.23,
      "item_sequence": 1,
      "confidence_score": 0.95,
      "item_metadata": "{\"extracted_at\":\"2025-01-20T12:01:00.000Z\",\"model\":\"qwen2.5vl:7b-q4_K_M\"}"
    },
    {
      "item_name": "Milk 2%",
      "item_base_price": 4.49,
      "item_tax_price": 0.36,
      "item_tax_percentage": 8.0,
      "item_total_price": 4.85,
      "item_sequence": 2,
      "confidence_score": 0.98,
      "item_metadata": "{\"extracted_at\":\"2025-01-20T12:01:00.000Z\",\"model\":\"qwen2.5vl:7b-q4_K_M\"}"
    },
    {
      "item_name": "Bread Whole Wheat",
      "item_base_price": 3.99,
      "item_tax_price": 0.32,
      "item_tax_percentage": 8.0,
      "item_total_price": 4.31,
      "item_sequence": 3,
      "confidence_score": 0.91,
      "item_metadata": "{\"extracted_at\":\"2025-01-20T12:01:00.000Z\",\"model\":\"qwen2.5vl:7b-q4_K_M\"}"
    }
  ]
}
```

**Error Responses**:

Missing receipt_id (400 Bad Request):
```json
{
  "status": "error",
  "message": "Missing required parameter: receipt_id"
}
```

Invalid receipt_id format (400 Bad Request):
```json
{
  "status": "error",
  "message": "Invalid receipt_id format. Expected UUID."
}
```

Receipt not found (404 Not Found):
```json
{
  "status": "error",
  "message": "Receipt not found"
}
```

---

## 4. Export Receipts to CSV

**Endpoint**: `GET /webhook/export-receipts`

**Purpose**: Export receipts and their items to CSV file for download

**Headers**:
```
Accept: text/csv
```

**Query Parameters**:

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `status` | string | Filter by processing status | `completed` |
| `date_from` | string | Filter receipts from date (ISO 8601) | - |
| `date_to` | string | Filter receipts until date (ISO 8601) | - |

**Examples**:

Export all completed receipts:
```bash
curl -X GET "http://localhost:8080/webhook/export-receipts" \
  -H "Accept: text/csv" \
  -o receipts_export.csv
```

Export with status filter:
```bash
curl -X GET "http://localhost:8080/webhook/export-receipts?status=completed" \
  -H "Accept: text/csv" \
  -o receipts_completed.csv
```

Export with date range:
```bash
curl -X GET "http://localhost:8080/webhook/export-receipts?date_from=2025-01-01&date_to=2025-01-31" \
  -H "Accept: text/csv" \
  -o receipts_january.csv
```

**Response Headers**:
```
HTTP/1.1 200 OK
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="receipts_export_2025-01-20_14-30-45.csv"
Cache-Control: no-cache, no-store, must-revalidate
```

**Response Body (CSV)**:
```csv
Receipt ID,Receipt Filename,Receipt Date,Item Name,Base Price,Tax Price,Tax Percentage,Total Price,Item Sequence,Confidence Score
550e8400-e29b-41d4-a716-446655440000,grocery-receipt.jpg,2025-01-20T12:00:00.000Z,Organic Bananas,2.99,0.24,8.00,3.23,1,0.95
550e8400-e29b-41d4-a716-446655440000,grocery-receipt.jpg,2025-01-20T12:00:00.000Z,Milk 2%,4.49,0.36,8.00,4.85,2,0.98
550e8400-e29b-41d4-a716-446655440000,grocery-receipt.jpg,2025-01-20T12:00:00.000Z,Bread Whole Wheat,3.99,0.32,8.00,4.31,3,0.91
660e8400-e29b-41d4-a716-446655440001,coffee-receipt.jpg,2025-01-20T13:30:00.000Z,Coffee Beans,12.99,1.04,8.00,14.03,1,0.92
```

**CSV Columns**:
1. Receipt ID (UUID)
2. Receipt Filename
3. Receipt Date (ISO 8601 timestamp)
4. Item Name
5. Base Price (before tax, 2 decimals)
6. Tax Price (tax amount, 2 decimals)
7. Tax Percentage (percentage, 2 decimals)
8. Total Price (including tax, 2 decimals)
9. Item Sequence (order in receipt)
10. Confidence Score (0.00-1.00)

**Notes**:
- Each row represents one item from a receipt
- Receipts with multiple items will have multiple rows
- CSV values are properly escaped (quoted if containing commas)
- Filename includes timestamp for uniqueness
- Empty export returns CSV with headers only

---

## 5. Process Receipt (Internal)

**Endpoint**: `POST /webhook/process-receipt-vlm`

**Purpose**: Process a receipt with VLM to extract items (internal use - triggered by queue monitor)

**Note**: This endpoint is typically called automatically by the queue monitor workflow every 30 seconds. Manual calling is for testing/debugging only.

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "jobId": "job-uuid",
  "receiptId": "receipt-uuid",
  "vlmModel": "qwen2.5vl:7b-q4_K_M",
  "triggeredBy": "queue-monitor",
  "processingTime": "2025-01-20T12:00:30.000Z",
  "isRetry": false,
  "retryCount": 0
}
```

**Response** (200 OK):
```json
{
  "status": "success",
  "message": "Receipt processed successfully",
  "jobId": "job-uuid",
  "receiptId": "receipt-uuid",
  "itemsExtracted": 5,
  "totalConfidence": 0.92,
  "model": "qwen2.5vl:7b-q4_K_M",
  "filename": "receipt.jpg"
}
```

---

## Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters or file |
| 404 | Not Found | Receipt not found |
| 413 | Payload Too Large | File exceeds 10MB |
| 500 | Internal Server Error | Server or processing error |

---

## Processing Status Values

| Status | Description |
|--------|-------------|
| `pending` | Receipt uploaded, waiting for processing |
| `processing` | VLM is currently extracting items |
| `completed` | Items successfully extracted |
| `failed` | Processing failed (will retry up to 3 times) |

---

## Rate Limiting

Currently no rate limiting is implemented. For production use, consider:
- Max 100 uploads per minute per IP
- Max 1000 API requests per minute per IP
- Queue processing limited to 3 concurrent jobs

---

## Error Handling

All endpoints return JSON error responses (except CSV export):

```json
{
  "status": "error",
  "message": "Descriptive error message"
}
```

Common error scenarios:
1. Missing required parameters → 400
2. Invalid UUID format → 400
3. Receipt not found → 404
4. Database connection error → 500
5. VLM API unavailable → 500

---

## Testing with curl

Quick test all endpoints:

```bash
# 1. Upload
curl -X POST http://localhost:8080/webhook/upload-receipt \
  -F "data=@./sample-receipt.jpg"

# 2. List all receipts
curl -X GET "http://localhost:8080/webhook/get-receipts" | jq

# 3. Get specific receipt (replace with actual ID)
curl -X GET "http://localhost:8080/webhook/get-receipt-detail?receipt_id=YOUR-RECEIPT-ID" | jq

# 4. Export to CSV
curl -X GET "http://localhost:8080/webhook/export-receipts" -o export.csv
```

---

## Integration with Web UI

The web interface (`receipts.html`) uses these endpoints:

| UI Feature | Endpoint | Method |
|------------|----------|--------|
| Upload page | `/upload-receipt` | POST |
| Receipts table | `/get-receipts` | GET |
| Detail modal | `/get-receipt-detail` | GET |
| Export button | `/export-receipts` | GET |

Image display uses direct nginx serving:
```
http://localhost:8080/uploads/receipts/YYYY/MM/DD/uuid-filename.jpg
```

---

## Example Workflow

Complete workflow from upload to export:

1. **Upload receipt**
   ```bash
   curl -X POST http://localhost:8080/webhook/upload-receipt \
     -F "data=@receipt.jpg"
   ```
   Response includes receipt_id

2. **Wait for processing** (30-60 seconds)
   - Queue monitor picks up job automatically
   - VLM extracts items
   - Status changes: pending → processing → completed

3. **Check if completed**
   ```bash
   curl "http://localhost:8080/webhook/get-receipts?status=completed" | jq
   ```

4. **View extracted items**
   ```bash
   curl "http://localhost:8080/webhook/get-receipt-detail?receipt_id=RECEIPT-ID" | jq
   ```

5. **Export all data**
   ```bash
   curl "http://localhost:8080/webhook/export-receipts" -o export.csv
   ```

---

**Last Updated**: 2026-02-01
**API Version**: 1.0
**Workflow Version**: 1.0
