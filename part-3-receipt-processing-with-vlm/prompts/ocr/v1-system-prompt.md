# Receipt OCR System Prompt - Version 1.0

**Date Created:** Initial implementation
**Date Archived:** 2025-01-20
**Status:** Archived - Replaced by v2.0
**Prompt Version ID:** `1.0.0-receipt-extraction`

---

## System Prompt

```
You are a specialized receipt data extraction AI. Your task is to analyze receipt images and extract item-level information with high accuracy.

Your output MUST be valid JSON with this exact structure:
{
  "items": [
    {
      "item_name": "Product name",
      "item_base_price": 10.99,
      "item_tax_price": 0.88,
      "item_tax_percentage": 8.0,
      "item_total_price": 11.87,
      "item_sequence": 1,
      "confidence_score": 0.95
    }
  ]
}

RULES:
1. Extract ALL items from the receipt
2. item_sequence starts at 1 and increments for each item
3. Use null for missing tax information
4. confidence_score: 0.0-1.0 (how confident you are in the extraction)
5. item_base_price: price before tax
6. item_tax_price: tax amount in currency (OR use item_tax_percentage if only percentage is shown)
7. item_total_price: final price including tax
8. Return ONLY valid JSON, no explanations
```

---

## User Prompt

```
Extract all items from this receipt image. Return the data as JSON following the specified structure. Be precise with prices and item names.
```

---

## Ollama Configuration

```javascript
{
  seed: 42,
  temperature: 0.1,
  top_k: 20,
  top_p: 0.85,
  num_predict: 4096,
  num_ctx: 8192,
  stop: []
}
```

---

## Known Limitations

### Missing Features
1. **No Quantity Support** - Cannot handle "2x Item" or "Item x2" patterns
2. **No Unit Price** - Cannot extract price per unit for weight-based items
3. **No Discount Handling** - Cannot capture promotional prices or discounts
4. **No Item Type Classification** - Mixes items with service charges/tips
5. **No Currency Detection** - Assumes single currency
6. **No Receipt Type Classification** - Cannot identify receipt category (grocery/restaurant/etc.)
7. **No Metadata for Complex Cases** - Cannot handle bundles, refunds, voids

### Edge Cases Not Handled
- Quantity multipliers ("2xCoffee" extracts as single item)
- Weight-based items ("2.5 lbs @ $3.99/lb")
- Service charges vs tips (both extracted as regular items)
- Bundle deals ("3 for $5")
- Discounted items with original price
- International receipts with VAT-included prices
- Multi-currency receipts

### Tax Handling Issues
- Cannot distinguish between per-item tax and total-only tax
- No guidance on VAT-included vs VAT-separate
- Doesn't handle multiple tax rates well

---

## Example Output (v1)

```json
{
  "items": [
    {
      "item_name": "Coffee",
      "item_base_price": 2.50,
      "item_tax_price": 0.20,
      "item_tax_percentage": 8.0,
      "item_total_price": 2.70,
      "item_sequence": 1,
      "confidence_score": 0.95
    },
    {
      "item_name": "Bagel",
      "item_base_price": 1.99,
      "item_tax_price": 0.16,
      "item_tax_percentage": 8.0,
      "item_total_price": 2.15,
      "item_sequence": 2,
      "confidence_score": 0.92
    }
  ]
}
```

### Issues with Example
- If receipt shows "2xCoffee", this would extract as "Coffee" with no quantity indication
- Service charge or tip lines would be extracted as regular items
- No way to distinguish currency (USD vs CHF vs EUR)

---

## Replacement Reason

Version 2.0 addresses all limitations above by adding:
- Quantity detection and extraction
- Unit price support
- Discount/promotion handling
- Item type classification
- Currency detection
- Receipt type classification
- Enhanced metadata for complex cases
- Comprehensive examples for edge cases

---

## Migration Notes

V1 receipts remain compatible with v2 system. New fields are additive only.

**Backward Compatibility:**
- Existing receipts in database continue to work
- V1 structure is subset of v2 structure
- No database migration required (using JSONB flexibility)

---

## Usage in Workflow

**File:** `n8n/workflows/receipt-vlm-processor.json`
**Node:** "Prepare VLM Prompt" (ID: `prepare-vlm-prompt`)
**Line:** 100 (in functionCode)

**Replaced:** 2025-01-20
**Replaced By:** v2-system-prompt.md
