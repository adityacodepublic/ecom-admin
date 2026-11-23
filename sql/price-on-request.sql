-- "Price on request" products: Product.price may be empty (NULL). Such a product is bought through a quote: the order
-- waits at the reserved status "Quote" until the seller sends the prices and the customer accepts (lib/orders/quote.ts).
-- Run once on Neon BEFORE deploying the matching code (admin first, then the store). Safe to run twice.
-- Rollback (only while no product has an empty price): ALTER TABLE "Product" ALTER COLUMN "price" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "price" DROP NOT NULL;
