// =========================================================================
// SYNTHETIC DEMO DATA GENERATOR (PURE FUNCTIONS)
// 100% synthetic fictitious entities. All dates relative to today. isDemo = true
// =========================================================================

function relativeDate(daysAgo = 0) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}

function getDemoSeedData() {
  const vendors = [
    { id: 'v_madina', name: 'Al-Madina Wholesale Traders', phone: '0300-5550101', city: 'Lahore', taxId: 'NTN-8812041', type: 'vendor', terms: 'Net 15', isDemo: true },
    { id: 'v_lahore_flour', name: 'Lahore Grain & Flour Mills', phone: '0321-5550102', city: 'Lahore', taxId: 'NTN-8812042', type: 'vendor', terms: 'Net 30', isDemo: true },
    { id: 'v_kisan_oil', name: 'Kisan Edible Oil Traders', phone: '0333-5550103', city: 'Faisalabad', taxId: 'NTN-8812043', type: 'vendor', terms: 'Cash on Delivery', isDemo: true },
    { id: 'v_it_supplies', name: 'Al-Rehman Office & Paper Mart', phone: '0302-5550104', city: 'Rawalpindi', taxId: 'NTN-8812044', type: 'vendor', terms: 'Net 15', isDemo: true },
    { id: 'v_spice_king', name: 'Bismillah Spices & Herbs', phone: '0345-5550105', city: 'Multan', taxId: 'NTN-8812045', type: 'vendor', terms: 'Net 7', isDemo: true },
    { id: 'v_dairy_farm', name: 'Pak Punjab Dairy Supplies', phone: '0312-5550106', city: 'Sahiwal', taxId: 'NTN-8812046', type: 'vendor', terms: 'Weekly', isDemo: true },
    { id: 'v_clean_chem', name: 'National Chemical & Detergents', phone: '0301-5550107', city: 'Karachi', taxId: 'NTN-8812047', type: 'vendor', terms: 'Net 30', isDemo: true },
    { id: 'v_packaging', name: 'Modern Box & Shopper Center', phone: '0322-5550108', city: 'Gujranwala', taxId: 'NTN-8812048', type: 'vendor', terms: 'Net 15', isDemo: true }
  ];

  const customers = [
    { id: 'c_khan', name: 'Khan General Store', phone: '0300-7770201', city: 'Lahore', type: 'customer', address: 'Bazar #4, Badami Bagh', isDemo: true },
    { id: 'c_bismillah', name: 'Bismillah Mart & Bakers', phone: '0321-7770202', city: 'Lahore', type: 'customer', address: 'G.T. Road, Shahdara', isDemo: true },
    { id: 'c_tariq', name: 'Tariq Cash & Carry', phone: '0333-7770203', city: 'Kasur', type: 'customer', address: 'Railway Road', isDemo: true },
    { id: 'c_city_hotel', name: 'City Palace Hotel & Cafe', phone: '0345-7770204', city: 'Lahore', type: 'customer', address: 'Mall Road', isDemo: true },
    { id: 'c_super_store', name: 'Shaheen Super Market', phone: '0312-7770205', city: 'Sheikhupura', type: 'customer', address: 'Main Chowk', isDemo: true },
    { id: 'c_zulfiqar', name: 'Zulfiqar Tea Stall & Canteen', phone: '0301-7770206', city: 'Lahore', type: 'customer', address: 'Anarkali', isDemo: true }
  ];

  const items = [
    { id: 'it_sugar', name: 'Fine White Sugar (چینی)', urduName: 'چینی', unit: 'kg', reorderLevelMilli: 50000, baseCostMinor: 14000, purchasePriceMinor: 14000, basePriceMinor: 15000, salePriceMinor: 15000, currentStockMilli: 65000, defaultVendor: 'Al-Madina Wholesale Traders', isDemo: true },
    { id: 'it_flour', name: 'Whole Wheat Flour (آٹا)', urduName: 'آٹا', unit: 'kg', reorderLevelMilli: 100000, baseCostMinor: 110000, purchasePriceMinor: 110000, basePriceMinor: 120000, salePriceMinor: 120000, currentStockMilli: 120000, defaultVendor: 'Lahore Grain & Flour Mills', isDemo: true },
    { id: 'it_oil', name: 'Cooking Oil 5L Tin (تیل)', urduName: 'کوکنگ آئل', unit: 'pcs', reorderLevelMilli: 20000, baseCostMinor: 240000, purchasePriceMinor: 240000, basePriceMinor: 265000, salePriceMinor: 265000, currentStockMilli: 35000, defaultVendor: 'Kisan Edible Oil Traders', isDemo: true },
    { id: 'it_ghee', name: 'Banaspati Ghee 1kg (گھی)', urduName: 'گھی', unit: 'pcs', reorderLevelMilli: 25000, baseCostMinor: 48000, purchasePriceMinor: 48000, basePriceMinor: 54000, salePriceMinor: 54000, currentStockMilli: 40000, defaultVendor: 'Kisan Edible Oil Traders', isDemo: true },
    { id: 'it_rice', name: 'Super Basmati Rice (چاول)', urduName: 'باسمتی چاول', unit: 'kg', reorderLevelMilli: 40000, baseCostMinor: 28000, purchasePriceMinor: 28000, basePriceMinor: 32000, salePriceMinor: 32000, currentStockMilli: 55000, defaultVendor: 'Lahore Grain & Flour Mills', isDemo: true },
    { id: 'it_dal_chana', name: 'Dal Chana (دال چنا)', urduName: 'دال چنا', unit: 'kg', reorderLevelMilli: 20000, baseCostMinor: 22000, purchasePriceMinor: 22000, basePriceMinor: 26000, salePriceMinor: 26000, currentStockMilli: 28000, defaultVendor: 'Al-Madina Wholesale Traders', isDemo: true },
    { id: 'it_dal_moong', name: 'Dal Moong (دال مونگ)', urduName: 'دال مونگ', unit: 'kg', reorderLevelMilli: 15000, baseCostMinor: 26000, purchasePriceMinor: 26000, basePriceMinor: 30000, salePriceMinor: 30000, currentStockMilli: 22000, defaultVendor: 'Al-Madina Wholesale Traders', isDemo: true },
    { id: 'it_tea', name: 'Black CTC Tea (کالی پتی)', urduName: 'چائے کی پتی', unit: 'kg', reorderLevelMilli: 10000, baseCostMinor: 120000, purchasePriceMinor: 120000, basePriceMinor: 140000, salePriceMinor: 140000, currentStockMilli: 18000, defaultVendor: 'Bismillah Spices & Herbs', isDemo: true },
    { id: 'it_chilli', name: 'Red Chilli Powder (لال مرچ)', urduName: 'لال مرچ', unit: 'kg', reorderLevelMilli: 8000, baseCostMinor: 75000, purchasePriceMinor: 75000, basePriceMinor: 90000, salePriceMinor: 90000, currentStockMilli: 14000, defaultVendor: 'Bismillah Spices & Herbs', isDemo: true },
    { id: 'it_turmeric', name: 'Haldi Powder (ہلدی پاؤڈر)', urduName: 'ہلدی', unit: 'kg', reorderLevelMilli: 5000, baseCostMinor: 40000, purchasePriceMinor: 40000, basePriceMinor: 50000, salePriceMinor: 50000, currentStockMilli: 9000, defaultVendor: 'Bismillah Spices & Herbs', isDemo: true },
    { id: 'it_milk_powder', name: 'Full Cream Milk Powder 1kg', urduName: 'سوکھا دودھ', unit: 'pcs', reorderLevelMilli: 15000, baseCostMinor: 140000, purchasePriceMinor: 140000, basePriceMinor: 160000, salePriceMinor: 160000, currentStockMilli: 24000, defaultVendor: 'Pak Punjab Dairy Supplies', isDemo: true },
    { id: 'it_surf', name: 'Washing Powder 1kg (سرف)', urduName: 'سرف', unit: 'pcs', reorderLevelMilli: 30000, baseCostMinor: 42000, purchasePriceMinor: 42000, basePriceMinor: 50000, salePriceMinor: 50000, currentStockMilli: 45000, defaultVendor: 'National Chemical & Detergents', isDemo: true },
    { id: 'it_dishwash', name: 'Dishwash Soap Bar (برتن صابن)', urduName: 'صابن', unit: 'pcs', reorderLevelMilli: 50000, baseCostMinor: 8000, purchasePriceMinor: 8000, basePriceMinor: 10000, salePriceMinor: 10000, currentStockMilli: 80000, defaultVendor: 'National Chemical & Detergents', isDemo: true },
    { id: 'it_shoppers', name: 'White Plastic Bags 1kg Roll', urduName: 'شاپنگ بیگ', unit: 'pack', reorderLevelMilli: 20000, baseCostMinor: 28000, purchasePriceMinor: 28000, basePriceMinor: 35000, salePriceMinor: 35000, currentStockMilli: 32000, defaultVendor: 'Modern Box & Shopper Center', isDemo: true },
    { id: 'it_tape', name: 'Packaging Tape 2-inch (ٹیپ)', urduName: 'ٹیپ', unit: 'pcs', reorderLevelMilli: 12000, baseCostMinor: 12000, purchasePriceMinor: 12000, basePriceMinor: 16000, salePriceMinor: 16000, currentStockMilli: 20000, defaultVendor: 'Al-Rehman Office & Paper Mart', isDemo: true }
  ];

  const accounts = [
    { id: 'acc_cash', name: 'Main Shop Cash Drawer', type: 'cash', balanceMinor: 8500000, isDemo: true },
    { id: 'acc_bank', name: 'Meezan Islamic Current A/C', type: 'bank', balanceMinor: 35000000, isDemo: true },
    { id: 'acc_wallet', name: 'Easypaisa Business Wallet', type: 'wallet', balanceMinor: 4500000, isDemo: true }
  ];

  return { vendors, customers, items, accounts };
}

function generate50DemoTransactions() {
  const seed = getDemoSeedData();
  const records = [];
  let seq = 1;

  function nextId(prefix) {
    return `demo_${prefix}_${String(seq++).padStart(3, '0')}`;
  }

  // 1. Group 1: 8 Clean Purchase Bills
  for (let i = 0; i < 8; i++) {
    const v = seed.vendors[i % seed.vendors.length];
    const item1 = seed.items[i % seed.items.length];
    const item2 = seed.items[(i + 3) % seed.items.length];
    const qty1 = 10;
    const qty2 = 5;
    const lTot1 = qty1 * item1.baseCostMinor;
    const lTot2 = qty2 * item2.baseCostMinor;
    const subtotal = lTot1 + lTot2;

    records.push({
      id: nextId('bill'),
      demoCategory: 'clean_purchase',
      type: 'bill',
      billNumber: `INV-2026-${1000 + i}`,
      partyId: v.id,
      partyName: v.name,
      vendorName: v.name,
      date: relativeDate(35 - i * 3),
      currency: 'PKR',
      subtotalMinor: subtotal,
      taxMinor: 0,
      totalMinor: subtotal,
      amountMinor: subtotal,
      status: 'confirmed',
      isDemo: true,
      lines: [
        { id: `dl_ln_${seq}_1`, nameRaw: item1.name, qty: qty1, qtyBilled: qty1, qtyMilli: qty1 * 1000, unit: item1.unit, unitPriceMinor: item1.baseCostMinor, lineTotalMinor: lTot1, printedLineTotalMinor: lTot1, isDemo: true },
        { id: `dl_ln_${seq}_2`, nameRaw: item2.name, qty: qty2, qtyBilled: qty2, qtyMilli: qty2 * 1000, unit: item2.unit, unitPriceMinor: item2.baseCostMinor, lineTotalMinor: lTot2, printedLineTotalMinor: lTot2, isDemo: true }
      ]
    });
  }

  // 2. Group 2: 4 Math Discrepancy Bills
  for (let i = 1; i <= 4; i++) {
    const v = seed.vendors[i];
    const it = seed.items[i];
    const qty = 10;
    const realTotal = qty * it.baseCostMinor;
    const wrongTotal = realTotal + 50000; // vendor overcharged Rs 500

    records.push({
      id: nextId('bill'),
      demoCategory: 'math_error',
      type: 'bill',
      billNumber: `MATH-ERR-00${i}`,
      partyId: v.id,
      partyName: v.name,
      vendorName: v.name,
      date: relativeDate(28 - i * 4),
      currency: 'PKR',
      subtotalMinor: wrongTotal,
      taxMinor: 0,
      totalMinor: wrongTotal,
      amountMinor: wrongTotal,
      status: 'draft',
      isDemo: true,
      auditDiscrepancy: { type: 'row_math', differenceMinor: 50000, expectedMinor: realTotal },
      findings: [
        {
          code: 'MATH_ROW_MISMATCH',
          severity: 'error',
          lineId: `dl_ln_${seq}_1`,
          expected: realTotal,
          actual: wrongTotal,
          diff: -50000,
          suggestedFixes: [{ id: 'fix_total', type: 'SET_TOTAL', value: realTotal, label: 'Fix Total' }],
          message: `Printed: Rs. ${(wrongTotal / 100).toFixed(2)} | Calculated: Rs. ${(realTotal / 100).toFixed(2)} | Overcharge: Rs. 500.00`
        }
      ],
      lines: [
        { id: `dl_ln_${seq}_1`, nameRaw: it.name, qty: qty, qtyBilled: qty, qtyMilli: qty * 1000, unit: it.unit, unitPriceMinor: it.baseCostMinor, lineTotalMinor: wrongTotal, printedLineTotalMinor: wrongTotal, isDemo: true }
      ]
    });
  }

  // 3. Group 3: 4 Price Hike Bills
  for (let i = 1; i <= 4; i++) {
    const v = seed.vendors[i];
    const it = seed.items[i + 2];
    const qty = 20;
    const hikeRate = Math.round(it.baseCostMinor * 1.15); // +15% hike
    const total = qty * hikeRate;

    records.push({
      id: nextId('bill'),
      demoCategory: 'price_hike',
      type: 'bill',
      billNumber: `HIKE-2026-00${i}`,
      partyId: v.id,
      partyName: v.name,
      vendorName: v.name,
      date: relativeDate(22 - i * 3),
      currency: 'PKR',
      subtotalMinor: total,
      taxMinor: 0,
      totalMinor: total,
      amountMinor: total,
      status: 'draft',
      isDemo: true,
      findings: [
        {
          code: 'PRICE_HIKE',
          severity: 'warning',
          lineId: `dl_ln_${seq}_1`,
          message: `Price Spike: Rate Rs. ${(hikeRate / 100).toFixed(2)} is +15% above historical cost Rs. ${(it.baseCostMinor / 100).toFixed(2)}.`
        }
      ],
      lines: [
        { id: `dl_ln_${seq}_1`, nameRaw: it.name, qty: qty, qtyBilled: qty, qtyMilli: qty * 1000, unit: it.unit, unitPriceMinor: hikeRate, lineTotalMinor: total, printedLineTotalMinor: total, isDemo: true }
      ]
    });
  }

  // 4. Group 4: 3 Duplicate Invoice Bills
  for (let i = 1; i <= 3; i++) {
    const v = seed.vendors[0];
    const total = 4500000;
    records.push({
      id: nextId('bill'),
      demoCategory: 'duplicate_bill',
      type: 'bill',
      billNumber: 'INV-2026-DUP-01',
      partyId: v.id,
      partyName: v.name,
      vendorName: v.name,
      date: relativeDate(15 - i * 2),
      currency: 'PKR',
      subtotalMinor: total,
      taxMinor: 0,
      totalMinor: total,
      amountMinor: total,
      status: 'draft',
      isDemo: true,
      findings: (i === 1) ? [] : [
        {
          code: 'DUPLICATE_LAYER3',
          severity: 'error',
          message: `Duplicate Invoice Detected: Same vendor, bill number (INV-2026-DUP-01) and amount already exists.`
        }
      ],
      lines: [
        { id: `dl_ln_${seq}_1`, nameRaw: seed.items[0].name, qty: 30, qtyBilled: 30, qtyMilli: 30000, unit: 'kg', unitPriceMinor: 15000, lineTotalMinor: total, printedLineTotalMinor: total, isDemo: true }
      ]
    });
  }

  // 5. Group 5: 3 Short Delivery & Debit Note Bills
  for (let i = 1; i <= 3; i++) {
    const v = seed.vendors[i + 1];
    const it = seed.items[i + 4];
    const billedQty = 50;
    const receivedQty = 45; // 5 short
    const unitPrice = it.baseCostMinor;
    const totalBilled = billedQty * unitPrice;
    const shortageMinor = (billedQty - receivedQty) * unitPrice;

    records.push({
      id: nextId('bill'),
      demoCategory: 'short_delivery',
      type: 'bill',
      billNumber: `SHORT-2026-00${i}`,
      partyId: v.id,
      partyName: v.name,
      vendorName: v.name,
      date: relativeDate(18 - i * 3),
      currency: 'PKR',
      subtotalMinor: totalBilled,
      taxMinor: 0,
      totalMinor: totalBilled,
      amountMinor: totalBilled,
      status: 'confirmed',
      isDemo: true,
      lines: [
        { id: `dl_ln_${seq}_1`, nameRaw: it.name, qty: billedQty, qtyBilled: billedQty, qtyReceived: receivedQty, qtyMilli: billedQty * 1000, unit: it.unit, unitPriceMinor: unitPrice, lineTotalMinor: totalBilled, printedLineTotalMinor: totalBilled, isDemo: true }
      ],
      debitNote: {
        noteNumber: `DN-2026-00${i}`,
        shortageMinor: shortageMinor
      }
    });
  }

  // 6. Group 6: 6 General Operational Expenses (Current Month active spending)
  const expCategories = ['Utilities', 'Rent', 'Staff Meal', 'Fuel & Logistics', 'Packaging Material', 'Store Maintenance'];
  const curMonthStr = new Date().toISOString().slice(0, 7);
  const curDayNum = new Date().getDate();
  for (let i = 0; i < 6; i++) {
    const amt = [1850000, 4500000, 420000, 1250000, 680000, 950000][i];
    const day = String(Math.max(1, curDayNum - (i % Math.max(1, curDayNum)))).padStart(2, '0');
    records.push({
      id: nextId('expense'),
      demoCategory: 'operating_expense',
      type: 'expense',
      category: expCategories[i],
      description: `Monthly payment for ${expCategories[i]}`,
      date: `${curMonthStr}-${day}`,
      currency: 'PKR',
      totalMinor: amt,
      amountMinor: amt,
      status: 'confirmed',
      isDemo: true
    });
  }

  // 7. Group 7: 6 Vendor Payments & Customer Receipts
  for (let i = 0; i < 3; i++) {
    const v = seed.vendors[i];
    const amt = 5000000 + i * 2000000;
    records.push({
      id: nextId('payment'),
      demoCategory: 'vendor_payment',
      type: 'payment',
      partyId: v.id,
      partyName: v.name,
      date: relativeDate(20 - i * 4),
      currency: 'PKR',
      totalMinor: amt,
      amountMinor: amt,
      method: 'bank',
      status: 'confirmed',
      isDemo: true
    });
  }
  // 7. Group 7: 3 Customer Receipts (settling cash sales while leaving credit/udhaar unpaid)
  const receiptAmounts = [4000000, 2000000, 1500000]; // Rs. 40k, 20k, 15k
  for (let i = 0; i < 3; i++) {
    const c = seed.customers[(i + 2) % seed.customers.length];
    const amt = receiptAmounts[i];
    records.push({
      id: nextId('receipt'),
      demoCategory: 'customer_receipt',
      type: 'receipt',
      partyId: c.id,
      partyName: c.name,
      customerName: c.name,
      date: relativeDate(16 - i * 3),
      currency: 'PKR',
      totalMinor: amt,
      amountMinor: amt,
      method: 'cash',
      status: 'confirmed',
      isDemo: true
    });
  }

  // 8. Group 8: POS Counter Sales & Outstanding Credit (ادھار) Invoices
  // 8A. Unpaid Credit Sales (Udhaar - 80,000 PKR total receivables)
  const creditSale1 = 4800000; // Rs. 48,000 for Khan General Store
  records.push({
    id: nextId('sale'),
    demoCategory: 'credit_sale',
    type: 'sale',
    paymentMode: 'credit',
    invoiceNumber: 'INV-CR-2026-001',
    partyId: seed.customers[0].id,
    partyName: seed.customers[0].name,
    customerName: seed.customers[0].name,
    date: relativeDate(7),
    currency: 'PKR',
    subtotalMinor: creditSale1,
    taxMinor: 0,
    totalMinor: creditSale1,
    amountMinor: creditSale1,
    grandTotalMinor: creditSale1,
    printedGrandTotalMinor: creditSale1,
    status: 'confirmed',
    isDemo: true,
    lines: [
      { id: `dl_ln_${seq}_1`, nameRaw: seed.items[0].name, qty: 32, qtyBilled: 32, qtyMilli: 32000, unit: seed.items[0].unit, unitPriceMinor: 15000, lineTotalMinor: creditSale1, isDemo: true }
    ]
  });

  const creditSale2 = 3200000; // Rs. 32,000 for Bismillah Mart
  records.push({
    id: nextId('sale'),
    demoCategory: 'credit_sale',
    type: 'sale',
    paymentMode: 'credit',
    invoiceNumber: 'INV-CR-2026-002',
    partyId: seed.customers[1].id,
    partyName: seed.customers[1].name,
    customerName: seed.customers[1].name,
    date: relativeDate(4),
    currency: 'PKR',
    subtotalMinor: creditSale2,
    taxMinor: 0,
    totalMinor: creditSale2,
    amountMinor: creditSale2,
    grandTotalMinor: creditSale2,
    printedGrandTotalMinor: creditSale2,
    status: 'confirmed',
    isDemo: true,
    lines: [
      { id: `dl_ln_${seq}_1`, nameRaw: seed.items[1].name, qty: 26, qtyBilled: 26, qtyMilli: 26000, unit: seed.items[1].unit, unitPriceMinor: 12000, lineTotalMinor: creditSale2, isDemo: true }
    ]
  });

  // 8B. 8 POS Cash Sales (settled cash counter)
  for (let i = 0; i < 8; i++) {
    const c = seed.customers[i % seed.customers.length];
    const it = seed.items[i % seed.items.length];
    const qty = 5 + (i % 4) * 2;
    const saleRate = it.basePriceMinor;
    const rev = qty * saleRate;

    records.push({
      id: nextId('sale'),
      demoCategory: 'pos_sale',
      type: 'sale',
      paymentMode: 'cash',
      invoiceNumber: `POS-2026-${2000 + i}`,
      partyId: c.id,
      partyName: c.name,
      customerName: c.name,
      date: relativeDate(14 - Math.floor(i * 1.2)),
      currency: 'PKR',
      subtotalMinor: rev,
      taxMinor: 0,
      totalMinor: rev,
      amountMinor: rev,
      status: 'confirmed',
      isDemo: true,
      lines: [
        { id: `dl_ln_${seq}_1`, nameRaw: it.name, qty: qty, qtyMilli: qty * 1000, unit: it.unit, unitPriceMinor: saleRate, lineTotalMinor: rev, isDemo: true }
      ]
    });
  }

  // 9. Group 9: 6 Recurring Household / Khata & Split Bills
  const splits = ['Lahore Office Lunch', 'Monthly Tea & Milk', 'Cleaning Supplies', 'Warehouse Stationery', 'Staff Dinner', 'Van Fuel'];
  for (let i = 0; i < 6; i++) {
    const amt = 240000 + i * 120000;
    records.push({
      id: nextId('expense'),
      demoCategory: 'split_khata',
      type: 'expense',
      category: 'Khata Split',
      description: splits[i],
      date: relativeDate(10 - i),
      currency: 'PKR',
      totalMinor: amt,
      amountMinor: amt,
      status: 'confirmed',
      isDemo: true
    });
  }

  for (const r of records) {
    const g = r.grandTotalMinor ?? r.totalMinor ?? r.amountMinor ?? r.subtotalMinor ?? 0;
    r.grandTotalMinor = g;
    r.printedGrandTotalMinor = g;
    r.subtotalMinor = r.subtotalMinor ?? g;
    if (!r.lines || r.lines.length === 0) {
      r.lines = [
        {
          id: `dl_ln_${r.id}_1`,
          transactionId: r.id,
          nameRaw: r.description || r.category || 'Expense Voucher',
          qty: 1,
          qtyBilled: 1,
          unit: 'voucher',
          unitPriceMinor: g,
          lineTotalMinor: g,
          printedLineTotalMinor: g,
          isDemo: true
        }
      ];
    }
    r.lineCount = r.lines.length;
    for (const l of r.lines) {
      l.qtyBilled = l.qtyBilled ?? l.qty ?? 1;
      l.qtyMilli = l.qtyMilli ?? Math.round((l.qty ?? 1) * 1000);
      l.unitPriceMinor = l.unitPriceMinor ?? 0;
      l.lineTotalMinor = l.lineTotalMinor ?? 0;
      l.printedLineTotalMinor = l.printedLineTotalMinor ?? l.lineTotalMinor ?? 0;
    }
  }

  return records;
}

const DemoData = {
  relativeDate,
  getDemoSeedData,
  generateDemoSupportingData: getDemoSeedData,
  generate50DemoTransactions,
  generate50CategorizedDemoRecords: generate50DemoTransactions
};

if (typeof window !== 'undefined') {
  window.DemoData = DemoData;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DemoData;
}
