

## Fix: Stock warnings during Marcha Blanca (Inventory Freeze Mode)

### Root Cause
The `auto_redeem_sale_token` and `redeem_pickup_token` DB functions call `is_inventory_frozen(v_token_record.venue_id)`. If `venue_id` on the `pickup_tokens` record is NULL, the function returns `false` and the pre-flight stock check runs, showing "Stock insuficiente" even though freeze mode is active.

Additionally, there may be a data gap: the toggle may not have persisted the flag value due to earlier permission errors.

### Plan

**1. Database migration — two fixes**

- **Fix `auto_redeem_sale_token`**: Add a COALESCE fallback for venue_id resolution. Before calling `is_inventory_frozen`, resolve venue_id from the sale's venue_id or the pilot venue as fallback:
  ```
  v_frozen := is_inventory_frozen(
    COALESCE(v_token_record.venue_id, 
      (SELECT venue_id FROM sales WHERE id = p_sale_id),
      '4e128e76-980d-4233-a438-92aa02cfb50b')
  );
  ```

- **Fix `redeem_pickup_token`**: Same COALESCE pattern for `v_venue_id` before calling `is_inventory_frozen`.

- **Ensure data**: Upsert `venue_feature_flags` for the pilot venue with `inventory_freeze_mode = true` to guarantee it's active.

**2. Files to change**
- `supabase/migrations/<new>.sql` — recreate both functions with venue_id fallback + data upsert

No frontend changes needed — the toggle and banner already work correctly. The issue is purely in the DB function's venue_id resolution.

### Technical Details
- Both functions already have freeze-aware branches (skip stock check + skip deduction when frozen). The only gap is that `venue_id` can be NULL, bypassing the freeze check.
- The migration will use `CREATE OR REPLACE FUNCTION` for both RPCs.
- The data upsert ensures the flag is active regardless of prior toggle failures.

