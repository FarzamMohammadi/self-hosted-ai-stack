-- Receipts table for uploaded receipt files with VLM processing metadata
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL, -- Relative path in uploads volume: receipts/YYYY/MM/DD/uuid-filename
  file_size INTEGER NOT NULL, -- File size in bytes
  mime_type VARCHAR(100), -- MIME type of uploaded file (image/jpeg, image/png, application/pdf)
  file_hash VARCHAR(64), -- SHA256 hash for duplicate detection
  items JSONB DEFAULT '[]'::jsonb, -- Extracted items array stored as JSONB
  items_count INTEGER DEFAULT 0, -- Total items extracted from receipt (cached count)
  total_confidence_score DECIMAL(3,2), -- Average confidence across all items (0.00-1.00)
  processing_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_receipts_status ON receipts(processing_status);
CREATE INDEX idx_receipts_created_at ON receipts(created_at DESC);
CREATE INDEX idx_receipts_file_hash ON receipts(file_hash);
CREATE INDEX idx_receipts_filename ON receipts(filename);
CREATE INDEX idx_receipts_items ON receipts USING GIN (items); -- GIN index for JSONB queries

-- Trigger to automatically update updated_at on row changes
CREATE OR REPLACE FUNCTION update_receipts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_receipts_updated_at
    BEFORE UPDATE ON receipts
    FOR EACH ROW
    EXECUTE PROCEDURE update_receipts_updated_at();

-- Comment for items JSONB structure
COMMENT ON COLUMN receipts.items IS 'JSONB array of extracted items. Structure: [{"item_name": "string", "item_base_price": number, "item_tax_price": number|null, "item_tax_percentage": number|null, "item_total_price": number, "item_sequence": number, "confidence_score": number, "item_metadata": {}}]';
