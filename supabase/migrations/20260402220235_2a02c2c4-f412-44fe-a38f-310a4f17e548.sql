
-- Actualizar Mixer Tradicional: stock y costo según inventario 31/03/2026
UPDATE products 
SET current_stock = 2534, cost_per_unit = 391.08 
WHERE id = 'a7d99675-cfe4-4dd1-8b80-d7bc9f898a26';

-- Actualizar stock_balances por ubicación
INSERT INTO stock_balances (product_id, location_id, quantity, venue_id) VALUES
('a7d99675-cfe4-4dd1-8b80-d7bc9f898a26', 'a1000000-0000-0000-0000-000000000005', 1402, '4e128e76-980d-4233-a438-92aa02cfb50b'),
('a7d99675-cfe4-4dd1-8b80-d7bc9f898a26', 'd89d6a6a-173e-47df-a160-349e1bfd077b', 315, '4e128e76-980d-4233-a438-92aa02cfb50b'),
('a7d99675-cfe4-4dd1-8b80-d7bc9f898a26', 'a1000000-0000-0000-0000-000000000003', 240, '4e128e76-980d-4233-a438-92aa02cfb50b'),
('a7d99675-cfe4-4dd1-8b80-d7bc9f898a26', 'a1000000-0000-0000-0000-000000000004', 188, '4e128e76-980d-4233-a438-92aa02cfb50b'),
('a7d99675-cfe4-4dd1-8b80-d7bc9f898a26', 'a1000000-0000-0000-0000-000000000001', 203, '4e128e76-980d-4233-a438-92aa02cfb50b'),
('a7d99675-cfe4-4dd1-8b80-d7bc9f898a26', 'a1000000-0000-0000-0000-000000000002', 186, '4e128e76-980d-4233-a438-92aa02cfb50b')
ON CONFLICT (product_id, location_id) DO UPDATE SET quantity = EXCLUDED.quantity;
