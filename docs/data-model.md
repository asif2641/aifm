# Smart Bill Auditor & Expense Suite — Complete Data Model

This document defines the schema, stores, fields, indexes, and relations for the entire application, implemented in `js/core/db.js`.

---

## 1. Architectural Principles

1. **IndexedDB is Single Source of Truth:**
   All operational data resides in IndexedDB. No caching of mutable business data in `localStorage` or memory globals.
2. **Integer Arithmetic Standard:**
   - Money values are stored as **integer minor units** (e.g., PKR 150.75 -> `15075`, USD 10.00 -> `1000`). No floating-point values are ever persisted for financial figures.
   - Quantities are stored as **integer milli-units** (e.g., 2.5 kg -> `2500`, 1 unit -> `1000`).
   - Tax and discount rates are stored as **basis points (bp)** (e.g., 15.00% -> `1500`, 5.5% -> `550`).
3. **Common Record Fields (Auto-Stamped on Write):**
   Every mutable entity record includes:
   - `id`: string (UUID v4)
   - `createdAt`: ISO 8601 string (`YYYY-MM-DDTHH:mm:ss.sssZ`)
   - `updatedAt`: ISO 8601 string
   - `createdBy`: string (User ID)
   - `updatedBy`: string (User ID)
   - `shiftId`: string (Shift ID or 'none')
   - `isDemo`: boolean (`true` for synthetic demo records, `false` for real records)
   - `schemaVersion`: integer (currently `1`)

---

## 2. Store Definitions & Schemas

### 2.1 `meta`
System metadata and environment indicators.
* **Key:** `key` (string)
* **Fields:** `key`, `value`, `updatedAt`

### 2.2 `settings`
Application configuration (general, features, security, AI, scan quality).
* **Key:** `key` (string)
* **Fields:** `key`, `value`, `updatedAt`

### 2.3 `users`
Local authentication and role-based permissions.
* **Key:** `id` (UUID v4)
* **Indexes:** `role`, `active`
* **Fields:**
  - `role`: `'admin' | 'staff' | 'viewer'`
  - `name`: string
  - `pinHash`: string (Hex string of PBKDF2 hash)
  - `pinSalt`: string (Hex string of per-user salt)
  - `active`: boolean
  - *Common fields* (`id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `shiftId`, `isDemo`, `schemaVersion`)

### 2.4 `shifts`
Point-of-work shifts for staff accounting and auditing.
* **Key:** `id` (UUID v4)
* **Indexes:** `userId`, `status`, `openedAt`, `compound_user_status` (`[userId, status]`)
* **Fields:**
  - `userId`: string (FK -> `users.id`)
  - `openedAt`: ISO 8601 string
  - `closedAt`: ISO 8601 string | null
  - `openingCashMinor`: integer
  - `closingCashMinor`: integer | null
  - `expectedCashMinor`: integer | null
  - `status`: `'open' | 'closed'`
  - `notes`: string
  - *Common fields*

### 2.5 `accounts`
Financial ledgers (Cash in hand, Bank accounts, Cards, Digital wallets).
* **Key:** `id` (UUID v4)
* **Indexes:** `type`, `archived`
* **Fields:**
  - `name`: string
  - `type`: `'cash' | 'bank' | 'card' | 'wallet'`
  - `accountNumber`: string
  - `currency`: string (e.g. `'PKR'`, `'USD'`, `'AED'`)
  - `initialBalanceMinor`: integer
  - `archived`: boolean
  - *Common fields*

### 2.6 `categories`
Income and Expense categories.
* **Key:** `id` (UUID v4)
* **Indexes:** `type`, `parentId`, `archived`
* **Fields:**
  - `name`: string
  - `nameUrdu`: string
  - `type`: `'expense' | 'income'`
  - `icon`: string
  - `color`: string
  - `parentId`: string | null
  - `archived`: boolean
  - *Common fields*

### 2.7 `parties`
Vendors, Suppliers, Customers, and Clients.
* **Key:** `id` (UUID v4)
* **Indexes:** `type`, `normalizedName`, `archived`, `taxId`
* **Fields:**
  - `type`: `'vendor' | 'customer' | 'both'`
  - `name`: string
  - `nameUrdu`: string
  - `contactPerson`: string
  - `phone`: string
  - `email`: string
  - `address`: string
  - `taxId`: string (NTN / GST / VAT)
  - `normalizedName`: string (trimmed, lowercased, stripped of common legal suffixes)
  - `archived`: boolean
  - *Common fields*

### 2.8 `items`
Item Master: Inventory items, products, and services.
* **Key:** `id` (UUID v4)
* **Indexes:** `canonicalName`, `sku`, `barcode`, `category`, `archived`
* **Fields:**
  - `canonicalName`: string
  - `nameUrdu`: string
  - `aliases`: array of strings
  - `sku`: string
  - `barcode`: string
  - `category`: string
  - `baseUnit`: string (`'kg'`, `'g'`, `'piece'`, `'liter'`, `'meter'`, etc.)
  - `unitConversions`: array of `{ fromUnit: string, toUnit: string, multiplierMilli: number }`
  - `minStockMilli`: integer
  - `reorderQtyMilli`: integer
  - `sellingPriceMinor`: integer
  - `costPriceMinor`: integer
  - `archived`: boolean
  - *Common fields*

### 2.9 `transactions`
Header records for Purchases, Sales, Expenses, Income, Transfers, Returns, Payments.
* **Key:** `id` (UUID v4)
* **Indexes:** `billDate`, `partyId`, `accountId`, `billNumber`, `type`, `status`, `compound_party_bill_date` (`[partyId, billNumber, billDate]`), `compound_createdBy_shiftId` (`[createdBy, shiftId]`)
* **Fields:**
  - `type`: `'purchase' | 'sale' | 'expense' | 'income' | 'transfer' | 'return' | 'payment'`
  - `source`: `'scan' | 'manual'`
  - `partyId`: string | null (FK -> `parties.id`)
  - `accountId`: string | null (FK -> `accounts.id`)
  - `billNumber`: string
  - `billDate`: string (`YYYY-MM-DD`)
  - `dueDate`: string | null (`YYYY-MM-DD`)
  - `paymentMode`: `'cash' | 'credit' | 'bank' | 'card' | 'wallet'`
  - `subtotalMinor`: integer
  - `discountMinor`: integer
  - `taxMinor`: integer
  - `freightMinor`: integer
  - `grandTotalMinor`: integer
  - `printedGrandTotalMinor`: integer | null
  - `status`: `'draft' | 'confirmed'`
  - `documentIds`: array of strings (FK -> `documents.id`)
  - `notes`: string
  - `tags`: array of strings
  - `findings`: array of audit findings
  - *Common fields*

### 2.10 `transactionLines`
Line items belonging to invoices, bills, and purchase orders.
* **Key:** `id` (UUID v4)
* **Indexes:** `transactionId`, `itemId`, `pageIndex`
* **Fields:**
  - `transactionId`: string (FK -> `transactions.id`)
  - `itemId`: string | null (FK -> `items.id`)
  - `nameRaw`: string
  - `nameEnglish`: string
  - `nameUrdu`: string
  - `category`: string
  - `qtyBilledMilli`: integer
  - `qtyReceivedMilli`: integer
  - `unit`: string
  - `unitPriceMinor`: integer
  - `printedLineTotalMinor`: integer | null
  - `lineTotalMinor`: integer
  - `taxRateBp`: integer
  - `taxable`: boolean
  - `confidence`: integer (0 to 100)
  - `pageIndex`: integer (0-based page index)
  - `bbox`: object | null `{ x, y, width, height }`
  - *Common fields*

### 2.11 `documents`
Image files, page scans, PDF assets, and perceptual hashes.
* **Key:** `id` (UUID v4)
* **Indexes:** `sha256`, `groupId`, `pageIndex`
* **Fields:**
  - `groupId`: string (Unique bill batch ID)
  - `pageIndex`: integer
  - `mimeType`: string
  - `blob`: Blob | string (Base64 data / ArrayBuffer)
  - `thumbnail`: string (Data URI)
  - `sha256`: string (Hex hash of original image bytes)
  - `perceptualHash`: string (dHash 64-bit hex)
  - `width`: integer
  - `height`: integer
  - `sizeBytes`: integer
  - *Common fields*

### 2.12 `stockMovements`
Immutable ledger of physical inventory movements.
* **Key:** `id` (UUID v4)
* **Indexes:** `itemId`, `transactionId`, `createdAt`, `compound_item_date` (`[itemId, createdAt]`)
* **Fields:**
  - `itemId`: string (FK -> `items.id`)
  - `transactionId`: string | null (FK -> `transactions.id`)
  - `type`: `'purchase_in' | 'sale_out' | 'adjustment' | 'return_in' | 'return_out' | 'shortage'`
  - `qtyMilli`: integer (positive or negative based on movement type)
  - `unitPriceMinor`: integer
  - `batchNumber`: string | null
  - `expiryDate`: string | null
  - `reason`: string
  - *Common fields*

### 2.13 `payments`
Ledger of payments made and received against transactions or on account.
* **Key:** `id` (UUID v4)
* **Indexes:** `partyId`, `transactionId`, `accountId`, `paymentDate`
* **Fields:**
  - `partyId`: string (FK -> `parties.id`)
  - `transactionId`: string | null (FK -> `transactions.id`)
  - `accountId`: string (FK -> `accounts.id`)
  - `type`: `'payment_out' | 'payment_in'`
  - `amountMinor`: integer
  - `paymentDate`: string (`YYYY-MM-DD`)
  - `paymentMode`: `'cash' | 'bank' | 'card' | 'wallet'`
  - `reference`: string
  - `notes`: string
  - *Common fields*

### 2.14 `recurringRules`
Rules for recurring utilities, rent, subscriptions, and periodic payments.
* **Key:** `id` (UUID v4)
* **Indexes:** `active`, `frequency`
* **Fields:**
  - `name`: string
  - `type`: `'expense' | 'income'`
  - `partyId`: string | null
  - `categoryId`: string | null
  - `accountId`: string | null
  - `amountMinor`: integer
  - `frequency`: `'daily' | 'weekly' | 'monthly' | 'yearly'`
  - `dayOfMonth`: integer (1-31)
  - `startDate`: string (`YYYY-MM-DD`)
  - `endDate`: string | null (`YYYY-MM-DD`)
  - `lastGeneratedDate`: string | null (`YYYY-MM-DD`)
  - `active`: boolean
  - *Common fields*

### 2.15 `budgets`
Monthly department/category budget targets and alert tracking.
* **Key:** `id` (UUID v4)
* **Indexes:** `categoryId`, `period`, `compound_category_period` (`[categoryId, period]`)
* **Fields:**
  - `categoryId`: string (FK -> `categories.id`)
  - `period`: string (`YYYY-MM`)
  - `limitMinor`: integer
  - `alertThresholdBp`: integer (e.g. `8000` = 80%)
  - `notified80At`: string | null
  - `notified100At`: string | null
  - *Common fields*

### 2.16 `apiUsage`
Tracking of Gemini API calls, token counts, and cost estimates.
* **Key:** `id` (UUID v4)
* **Indexes:** `month`, `date`, `provider`
* **Fields:**
  - `provider`: string (e.g. `'gemini'`)
  - `model`: string
  - `date`: string (`YYYY-MM-DD`)
  - `month`: string (`YYYY-MM`)
  - `callCount`: integer
  - `inputTokens`: integer
  - `outputTokens`: integer
  - `estimatedCostMicroUsd`: integer
  - *Common fields*

### 2.17 `auditLog`
Append-only tamper-evident security and activity journal.
* **Key:** `id` (UUID v4)
* **Indexes:** `timestamp`, `userId`, `action`, `compound_user_timestamp` (`[userId, timestamp]`)
* **Fields:**
  - `id`: string (UUID v4)
  - `timestamp`: ISO 8601 string
  - `userId`: string
  - `shiftId`: string | null
  - `action`: string (e.g. `'LOGIN'`, `'DELETE_RECORD'`, `'SETTINGS_UPDATE'`, `'MODULE_TOGGLE'`)
  - `entity`: string (e.g. `'transactions'`, `'parties'`, `'settings'`)
  - `entityId`: string | null
  - `summary`: string (Descriptive one-liner, strictly no confidential payload or raw deleted data)
  - `outcome`: `'success' | 'failure' | 'rejected'`
  - `context`: object | null (e.g. IP/user-agent hint, reason)
