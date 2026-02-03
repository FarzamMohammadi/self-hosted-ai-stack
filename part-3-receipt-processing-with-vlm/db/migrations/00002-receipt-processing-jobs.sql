-- Receipt Processing Jobs - Queue for VLM extraction from uploaded receipts
CREATE TABLE receipt_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 5, -- 1 (high) to 10 (low)
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  processing_duration_ms INTEGER, -- Processing time in milliseconds
  worker_id VARCHAR(100), -- N8N workflow instance identifier
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  vlm_model_used VARCHAR(100), -- Model used for extraction (e.g., 'llava:13b')
  extraction_metadata JSONB DEFAULT '{}', -- VLM response metadata, processing details
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for queue management and performance
CREATE INDEX idx_receipt_jobs_queue ON receipt_processing_jobs(status, priority, created_at);
CREATE INDEX idx_receipt_jobs_receipt_id ON receipt_processing_jobs(receipt_id);
CREATE INDEX idx_receipt_jobs_worker ON receipt_processing_jobs(worker_id, status);
CREATE INDEX idx_receipt_jobs_status ON receipt_processing_jobs(status);
