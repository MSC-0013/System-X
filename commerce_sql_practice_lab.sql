-- ============================================================================
-- COMMERCE SQL PRACTICE LAB DATABASE
-- Project: E-Commerce Order, Inventory, and Payment Management System
-- Database: sql_commerce_lab
-- Purpose: Complete Practice Lab for Intermediate to Master SQL Engineering
-- ============================================================================

CREATE DATABASE IF NOT EXISTS sql_commerce_lab;
USE sql_commerce_lab;

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS customers;

-- ----------------------------------------------------------------------------
-- 1. CUSTOMERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_customer_email (email)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. CATEGORIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. PRODUCTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NULL,
    sku VARCHAR(50) NOT NULL UNIQUE,
    product_name VARCHAR(200) NOT NULL,
    current_price DECIMAL(10, 2) NOT NULL CHECK (current_price >= 0),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (category_id) ON DELETE SET NULL,
    INDEX idx_products_category (category_id),
    INDEX idx_products_active_price (is_active, current_price)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. INVENTORY TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE inventory (
    product_id INT PRIMARY KEY,
    quantity_on_hand INT NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved INT NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    version INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products (product_id) ON DELETE CASCADE,
    CONSTRAINT chk_inventory_reserved_lte_onhand CHECK (quantity_reserved <= quantity_on_hand)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. ORDERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_status ENUM('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    shipping_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (shipping_fee >= 0),
    grand_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (grand_total >= 0),
    idempotency_key VARCHAR(64) NULL UNIQUE,
    ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (customer_id) ON DELETE RESTRICT,
    INDEX idx_orders_customer_date (customer_id, ordered_at DESC),
    INDEX idx_orders_status (order_status),
    INDEX idx_orders_date (ordered_at DESC)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. ORDER_ITEMS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_at_purchase DECIMAL(10, 2) NOT NULL CHECK (unit_price_at_purchase >= 0),
    line_total DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price_at_purchase) STORED,
    CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (product_id) ON DELETE RESTRICT,
    UNIQUE KEY uk_order_product (order_id, product_id),
    INDEX idx_order_items_product (product_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. PAYMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    provider ENUM('stripe', 'razorpay', 'paypal', 'apple_pay') NOT NULL,
    provider_transaction_id VARCHAR(100) NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    payment_status ENUM('initiated', 'captured', 'failed', 'refunded') NOT NULL,
    attempt_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (order_id) ON DELETE RESTRICT,
    INDEX idx_payments_order_status (order_id, payment_status)
) ENGINE=InnoDB;

-- ============================================================================
-- SEED DATA INSERTION (With Deliberate Edge Cases)
-- ============================================================================

-- 1. Insert 8 Customers (Edge case: Customer 7 & 8 have 0 orders)
INSERT INTO customers (customer_id, full_name, email, phone, created_at) VALUES
(1, 'Alice Smith', 'alice.smith@example.com', '+1-555-0101', '2026-01-10 09:30:00'),
(2, 'Bob Johnson', 'bob.johnson@example.com', '+1-555-0102', '2026-01-15 11:20:00'),
(3, 'Charlie Brown', 'charlie.brown@example.com', '+1-555-0103', '2026-02-01 14:15:00'),
(4, 'Diana Prince', 'diana.prince@example.com', '+1-555-0104', '2026-02-12 16:45:00'),
(5, 'Evan Wright', 'evan.wright@example.com', '+1-555-0105', '2026-03-05 10:00:00'),
(6, 'Fiona Gallagher', 'fiona.g@example.com', '+1-555-0106', '2026-03-20 13:10:00'),
(7, 'George Clark', 'george.clark@example.com', '+1-555-0107', '2026-04-01 15:30:00'), -- Zero orders
(8, 'Hannah Abbott', 'hannah.abbott@example.com', '+1-555-0108', '2026-04-10 18:00:00'); -- Zero orders

-- 2. Insert 6 Categories (Edge case: Category 6 'Gaming' has zero products)
INSERT INTO categories (category_id, category_name, description) VALUES
(1, 'Laptops & Computers', 'High performance workstations, laptops and ultrabooks'),
(2, 'Smartphones & Audio', 'Flagship mobile devices and noise-cancelling headphones'),
(3, 'Accessories & Cables', 'USB-C docks, keyboards, mice, and power adapters'),
(4, 'Storage & Networking', 'NVMe SSDs, external hard drives, Wi-Fi 7 routers'),
(5, 'Home Office & Desk', 'Standing desks, ergonomic chairs, desk pads'),
(6, 'Gaming & VR', 'VR headsets, gamepads, consoles'); -- No products

-- 3. Insert 12 Products (Edge case: Product 11 & 12 never purchased, Product 12 inactive)
INSERT INTO products (product_id, category_id, sku, product_name, current_price, is_active) VALUES
(1, 1, 'LAP-MBP-14', 'ProBook M3 Max 14-inch', 1999.00, TRUE),
(2, 1, 'LAP-THK-X1', 'ThinkStation Carbon Gen 12', 1450.00, TRUE),
(3, 2, 'PHN-PXL-9P', 'Pixel 9 Pro 256GB', 999.00, TRUE),
(4, 2, 'AUD-SNY-XM5', 'Sony WH-1000XM5 Wireless Headphones', 348.00, TRUE),
(5, 3, 'ACC-LOG-MX3', 'Logitech MX Master 3S Mouse', 99.00, TRUE),
(6, 3, 'ACC-KBD-MECH', 'Keychron Q1 Pro Mechanical Keyboard', 199.00, TRUE),
(7, 4, 'STR-SAM-990', 'Samsung 990 Pro 2TB NVMe SSD', 179.00, TRUE),
(8, 4, 'NET-ASU-AX6', 'Asus RT-AX88U Pro Wi-Fi 6 Router', 249.00, TRUE),
(9, 5, 'DSK-AUT-STD', 'Autonomous SmartDesk Pro', 699.00, TRUE),
(10, 5, 'CHR-HRM-AER', 'Herman Miller Aeron Ergonomic Chair', 1295.00, TRUE),
(11, 3, 'ACC-CAL-DOK', 'CalDigit TS4 Thunderbolt 4 Dock', 399.00, TRUE), -- Never ordered
(12, 4, 'STR-WDC-RED', 'WD Red Plus 12TB NAS HDD', 269.00, FALSE); -- Inactive, never ordered

-- 4. Insert Inventory for Products 1 to 12
INSERT INTO inventory (product_id, quantity_on_hand, quantity_reserved, version) VALUES
(1, 15, 2, 1),
(2, 8, 1, 1),
(3, 25, 3, 1),
(4, 40, 5, 1),
(5, 100, 10, 1),
(6, 35, 4, 1),
(7, 50, 0, 1),
(8, 20, 2, 1),
(9, 10, 1, 1),
(10, 5, 1, 1),
(11, 30, 0, 1),
(12, 0, 0, 1);

-- 5. Insert 12 Orders
INSERT INTO orders (order_id, customer_id, order_status, subtotal, discount_amount, shipping_fee, grand_total, idempotency_key, ordered_at) VALUES
(1, 1, 'delivered', 2098.00, 50.00, 0.00, 2048.00, 'idem_ord_001_a9f1', '2026-01-12 10:15:00'),
(2, 2, 'delivered', 1450.00, 0.00, 25.00, 1475.00, 'idem_ord_002_b8e2', '2026-01-18 14:30:00'),
(3, 3, 'delivered', 447.00, 20.00, 15.00, 442.00, 'idem_ord_003_c7d3', '2026-02-05 16:20:00'),
(4, 1, 'delivered', 179.00, 0.00, 10.00, 189.00, 'idem_ord_004_d6c4', '2026-02-14 09:45:00'),
(5, 4, 'shipped', 999.00, 50.00, 0.00, 949.00, 'idem_ord_005_e5b5', '2026-02-25 11:10:00'),
(6, 5, 'delivered', 1994.00, 100.00, 0.00, 1894.00, 'idem_ord_006_f4a6', '2026-03-08 13:50:00'),
(7, 2, 'delivered', 298.00, 0.00, 15.00, 313.00, 'idem_ord_007_g397', '2026-03-15 15:05:00'),
(8, 6, 'paid', 249.00, 0.00, 15.00, 264.00, 'idem_ord_008_h288', '2026-03-22 17:30:00'),
(9, 3, 'cancelled', 1999.00, 100.00, 0.00, 1899.00, 'idem_ord_009_i179', '2026-03-28 10:00:00'),
(10, 4, 'delivered', 1295.00, 50.00, 0.00, 1245.00, 'idem_ord_010_j060', '2026-04-02 12:40:00'),
(11, 1, 'pending', 447.00, 0.00, 15.00, 462.00, 'idem_ord_011_k951', '2026-04-08 14:15:00'),
(12, 5, 'refunded', 348.00, 0.00, 15.00, 363.00, 'idem_ord_012_l842', '2026-04-12 16:50:00');

-- 6. Insert 22 Order Items (Matches subtotal exactly for each order)
INSERT INTO order_items (order_id, product_id, quantity, unit_price_at_purchase) VALUES
-- Order 1: 1x ProBook (1999) + 1x Logitech Mouse (99) = 2098.00
(1, 1, 1, 1999.00),
(1, 5, 1, 99.00),
-- Order 2: 1x ThinkStation (1450) = 1450.00
(2, 2, 1, 1450.00),
-- Order 3: 1x Sony Headphones (348) + 1x Logitech Mouse (99) = 447.00
(3, 4, 1, 348.00),
(3, 5, 1, 99.00),
-- Order 4: 1x Samsung NVMe SSD (179) = 179.00
(4, 7, 1, 179.00),
-- Order 5: 1x Pixel 9 Pro (999) = 999.00
(5, 3, 1, 999.00),
-- Order 6: 1x Autonomous Desk (699) + 1x Herman Miller (1295) = 1994.00
(6, 9, 1, 699.00),
(6, 10, 1, 1295.00),
-- Order 7: 1x Keychron Keyboard (199) + 1x Logitech Mouse (99) = 298.00
(7, 6, 1, 199.00),
(7, 5, 1, 99.00),
-- Order 8: 1x Asus Router (249) = 249.00
(8, 8, 1, 249.00),
-- Order 9: 1x ProBook (1999) = 1999.00 (Cancelled)
(9, 1, 1, 1999.00),
-- Order 10: 1x Herman Miller (1295) = 1295.00
(10, 10, 1, 1295.00),
-- Order 11: 1x Sony Headphones (348) + 1x Logitech Mouse (99) = 447.00
(11, 4, 1, 348.00),
(11, 5, 1, 99.00),
-- Order 12: 1x Sony Headphones (348) = 348.00 (Refunded)
(12, 4, 1, 348.00);

-- 7. Insert 13 Payment Records
-- Deliberate Edge Cases:
-- Order 1: Captured via Stripe
-- Order 2: Captured via Razorpay
-- Order 3: Attempt 1 Failed, Attempt 2 Captured via Stripe (Multiple attempts!)
-- Order 5: Captured via Apple Pay
-- Order 6: Captured via Stripe
-- Order 7: Captured via PayPal
-- Order 8: Captured via Razorpay
-- Order 9: Failed via Stripe (Cancelled order)
-- Order 10: Captured via Stripe
-- Order 11: Initiated (No capture yet, pending checkout)
-- Order 12: Attempt 1 Captured, Attempt 2 Refunded
INSERT INTO payments (payment_id, order_id, provider, provider_transaction_id, amount, payment_status, attempt_number, created_at) VALUES
(1, 1, 'stripe', 'txn_str_001_success', 2048.00, 'captured', 1, '2026-01-12 10:16:00'),
(2, 2, 'razorpay', 'pay_rzp_002_success', 1475.00, 'captured', 1, '2026-01-18 14:31:00'),
(3, 3, 'stripe', 'txn_str_003_failed', 442.00, 'failed', 1, '2026-02-05 16:21:00'),
(4, 3, 'stripe', 'txn_str_003_retry_success', 442.00, 'captured', 2, '2026-02-05 16:25:00'), -- Retry succeeded
(5, 4, 'paypal', 'pp_txn_004_success', 189.00, 'captured', 1, '2026-02-14 09:46:00'),
(6, 5, 'apple_pay', 'ap_txn_005_success', 949.00, 'captured', 1, '2026-02-25 11:12:00'),
(7, 6, 'stripe', 'txn_str_006_success', 1894.00, 'captured', 1, '2026-03-08 13:52:00'),
(8, 7, 'paypal', 'pp_txn_007_success', 313.00, 'captured', 1, '2026-03-15 15:07:00'),
(9, 8, 'razorpay', 'pay_rzp_008_success', 264.00, 'captured', 1, '2026-03-22 17:32:00'),
(10, 9, 'stripe', 'txn_str_009_declined', 1899.00, 'failed', 1, '2026-03-28 10:02:00'),
(11, 10, 'stripe', 'txn_str_010_success', 1245.00, 'captured', 1, '2026-04-02 12:42:00'),
(12, 11, 'stripe', 'txn_str_011_pending', 462.00, 'initiated', 1, '2026-04-08 14:16:00'),
(13, 12, 'razorpay', 'pay_rzp_012_refunded', 363.00, 'refunded', 1, '2026-04-12 17:05:00');

-- End of setup script
