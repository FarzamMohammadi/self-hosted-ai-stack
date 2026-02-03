-- Add receipt-level total columns to store totals extracted by the VLM

ALTER TABLE receipts ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
ALTER TABLE receipts ADD COLUMN receipt_type VARCHAR(50);
ALTER TABLE receipts ADD COLUMN tax_format VARCHAR(20);
ALTER TABLE receipts ADD COLUMN receipt_subtotal DECIMAL(12,2);
ALTER TABLE receipts ADD COLUMN receipt_total_tax_amount DECIMAL(12,2);
ALTER TABLE receipts ADD COLUMN receipt_total_tax_percentage DECIMAL(5,2);
ALTER TABLE receipts ADD COLUMN receipt_total DECIMAL(12,2);

-- Add comments for documentation
COMMENT ON COLUMN receipts.currency IS 'Currency code (USD, EUR, CHF, etc.)';
COMMENT ON COLUMN receipts.receipt_type IS 'Type of receipt: grocery, restaurant, retail, service, unknown';
COMMENT ON COLUMN receipts.tax_format IS 'Tax format: added (US), inclusive (EU), none';
COMMENT ON COLUMN receipts.receipt_subtotal IS 'Subtotal before tax';
COMMENT ON COLUMN receipts.receipt_total_tax_amount IS 'Total tax amount';
COMMENT ON COLUMN receipts.receipt_total_tax_percentage IS 'Tax rate percentage';
COMMENT ON COLUMN receipts.receipt_total IS 'Final total amount';
