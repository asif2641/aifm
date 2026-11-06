# Smart Bill Auditor & Expense Suite — Guided Tour & Marketing Script

## Executive Overview
Smart Bill Auditor & Expense Suite is an enterprise-grade, privacy-first, zero-cloud bill auditing, expense tracking, and business reconciliation system. Engineered under the **Editorial Flat Luxury** design paradigm, it executes entirely client-side using standard Web APIs, IndexedDB, and BigInt-based integer money arithmetic.

This document details the step-by-step interactive onboarding tour and companion presenter script for live sales demos, client pitches, and stakeholder walk-throughs.

---

## 9-Step Interactive Tour Specification

### Step 1: 360° Financial Dashboard
- **Target Selector**: `#nav-dashboard` / `header.main-header`
- **Headline**: Total Control Over Your Financial Health
- **On-Screen Copy**: 
  Experience real-time financial situational awareness. View monthly inflow, gross expenses, outstanding payables, and net operating profit computed live from immutable records with zero floating-point rounding errors.
- **Presenter Script**:
  > "Welcome to the Smart Bill Auditor. What you are looking at is not a static dashboard—it is a live, high-precision window into your enterprise finances. Every single rupee shown here is backed by an exact transaction stored in your browser's private database. No remote server tracks your numbers, and no cloud service holds your ledger. You have total sovereign control over your balance sheet."

---

### Step 2: Instant Scan & Quality Gate
- **Target Selector**: `#nav-scan`
- **Headline**: High-Throughput Bill Digestion
- **On-Screen Copy**:
  Upload receipts, thermal slips, or invoices. The on-device Quality Gate instantly analyzes focus, blur, and lighting using Laplacian variance and histogram clipping—protecting you from bad scans before extraction.
- **Presenter Script**:
  > "Notice how quickly we can process incoming bills. Whether you drop a smartphone photograph of a crumpled thermal receipt or a clean multi-page PDF invoice, our client-side Quality Gate checks readability on-device in under 50 milliseconds. We never waste API tokens or time on unreadable images."

---

### Step 3: Split-Screen Visual Verification
- **Target Selector**: `#view-editor`
- **Headline**: Side-by-Side Image & Data Verification
- **On-Screen Copy**:
  Compare extracted bill lines directly against original image scans. Zoom, pan, rotate, and verify quantities and unit rates with automatic line total re-calculation.
- **Presenter Script**:
  > "Auditing is about trust and evidence. Our split-screen editor places the physical bill right next to the structured data. If an item rate looks unusual, one click on the line jumps directly to its corresponding page on the receipt. You never have to switch tabs or guess whether a digit was misread."

---

### Step 4: Fraud & Discrepancy Engine (Audit Room)
- **Target Selector**: `#nav-audit`
- **Headline**: Automated Forensic Math & Price Protection
- **On-Screen Copy**:
  Our 5-layer audit engine detects arithmetic errors, supplier overcharges, duplicate invoice numbers, missing taxes, and price hikes against your historical Item Master.
- **Presenter Script**:
  > "Here is where the software pays for itself on day one. Vendors make math mistakes, and suppliers silently bump prices. The Audit Engine calculates item math, compares historical prices, and flags duplicate bill submissions. With our one-click fixes, correcting supplier billing errors takes less than two seconds."

---

### Step 5: Party 360 & Aging Ledger
- **Target Selector**: `#nav-vendors` / `#/ledger`
- **Headline**: Comprehensive Vendor & Customer Relationships
- **On-Screen Copy**:
  Inspect complete transaction histories, running balances, and FIFO aging buckets (0-30, 31-60, 61-90, 90+ days). Generate professional WhatsApp reminders with one click.
- **Presenter Script**:
  > "Never lose track of who owes what. Our Running Ledger classifies every payable and receivable into precise aging buckets. With our instant WhatsApp statement generator, reconciling balances with suppliers or reminding customers of overdue invoices is friction-free and transparent."

---

### Step 6: Real-Time Stock & WAC Valuation
- **Target Selector**: `#nav-inventory`
- **Headline**: Derived Inventory & Automatic Reordering
- **On-Screen Copy**:
  Track stock counts calculated dynamically from inventory movements. Review Weighted Average Cost (WAC) and generate Purchase Orders for low-stock items in seconds.
- **Presenter Script**:
  > "Inventory in this suite is never manually hacked—it is mathematically derived from your purchases and sales. As prices fluctuate, Weighted Average Cost adjusts automatically. When an item runs below minimum safe levels, the system drafts a Purchase Order for your supplier automatically."

---

### Step 7: Sales POS with Live Margin Tracking
- **Target Selector**: `#nav-sales`
- **Headline**: High-Speed Counter Sales & Profit Protection
- **On-Screen Copy**:
  Issue customer invoices with barcode scanner support, instant change calculation, and live profit margin percentages calculated before checkout.
- **Presenter Script**:
  > "At the sales counter, speed and margin protection are everything. Our POS supports keyboard shortcuts, barcode scanners, and custom discounts, all while warning the cashier if a discount drops profit margins below your enterprise safety threshold."

---

### Step 8: Category Budgets & Recurring Subscriptions
- **Target Selector**: `#nav-budgets` / `#/budgets`
- **Headline**: Expense Caps & Active Cash Flow Control
- **On-Screen Copy**:
  Track monthly category spending caps with live progress bars and monitor recurring bill commitments before overspending.
- **Presenter Script**:
  > "Keep total control over overheads. Set category budget caps linked live to monthly expenses and manage recurring business subscriptions in one place."

---

### Step 9: Sovereign Privacy & Complete Data Portability
- **Target Selector**: `#nav-settings`
- **Headline**: 100% Offline, Zero Cloud Leaks, Total Ownership
- **On-Screen Copy**:
  Your database lives securely inside your device. Export encrypted JSON backups, import bank CSVs, and reset or wipe data at will with zero cloud dependency.
- **Presenter Script**:
  > "Finally, let's talk about privacy and longevity. Most modern software locks your data behind monthly subscriptions and cloud servers. Smart Bill Auditor is 100% self-contained. It runs offline, opens in any modern browser, and can be backed up to your USB drive or Google Drive in seconds. Your financial data belongs to you—forever."

---

## Technical Tour Configuration
The tour is implemented via `js/demo/tour.js` and wired into `app.standalone.js`. It features:
1. Non-destructive spotlight highlights with smooth CSS transitions.
2. Complete keyboard navigation (`Escape` to dismiss, `ArrowRight` for next, `ArrowLeft` for previous).
3. Mobile-responsive touch card positioning with auto-scrolling into view.
4. Automatic persistence of completed status in `localStorage.setItem('tour_completed', 'true')`.
