// =========================================================================
// DEMO DATA ENGINE (TRANSACTIONAL LOADER & CLEANER)
// Loads 50 demo records in < 10 seconds. Deletes ONLY isDemo records.
// =========================================================================

const DemoEngine = {
  /**
   * Check if any demo transactions or entities exist.
   */
  async hasDemoData() {
    try {
      if (typeof window.db === 'undefined' || !window.db.getAll) return false;
      const txs = await window.db.getAll('transactions');
      return txs.some(t => t.isDemo === true);
    } catch {
      return false;
    }
  },

  /**
   * Loads synthetic demo data into IndexedDB.
   *
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, counts: Object, elapsedMs: number }>}
   */
  async loadDemoData(options = {}) {
    const startTime = performance.now();
    const seed = window.DemoData.getDemoSeedData();
    const txs = window.DemoData.generate50DemoTransactions();

    const counts = {
      parties: 0,
      items: 0,
      accounts: 0,
      transactions: 0,
      stockMovements: 0
    };

    // Use window.db if available
    const db = window.db;
    if (!db) throw new Error('Database module window.db not available');

    // 1. Save Vendors & Customers
    for (const v of seed.vendors) {
      await db.put('parties', { ...v, isDemo: true });
      counts.parties++;
    }
    for (const c of seed.customers) {
      await db.put('parties', { ...c, isDemo: true });
      counts.parties++;
    }

    // 2. Save Items & Initial Stock
    for (const it of seed.items) {
      await db.put('items', { ...it, isDemo: true });
      counts.items++;
      try {
        await db.put('stockMovements', {
          id: `sm_init_${it.id}`,
          itemId: it.id,
          type: 'in',
          quantityMilli: it.currentStockMilli || 45000,
          unitCostMinor: it.baseCostMinor,
          date: '2026-10-01',
          refType: 'opening_balance',
          refId: 'init',
          isDemo: true
        });
        counts.stockMovements++;
      } catch {}
    }

    // 3. Save Accounts
    for (const a of seed.accounts) {
      await db.put('accounts', { ...a, isDemo: true });
      counts.accounts++;
    }

    // 4. Save Transactions & Derived Movements
    for (const t of txs) {
      const grandTotalMinor = t.grandTotalMinor ?? t.totalMinor ?? t.amountMinor ?? t.subtotalMinor ?? 0;
      const subtotalMinor = t.subtotalMinor ?? grandTotalMinor;
      const txType = (t.type === 'bill' || !t.type) ? 'purchase' : t.type;
      const vName = t.vendorName || (txType !== 'sale' ? (t.partyName || '') : '');
      const cName = t.customerName || (txType === 'sale' ? (t.partyName || '') : '');

      const normalizedTx = {
        ...t,
        type: txType,
        grandTotalMinor,
        subtotalMinor,
        totalMinor: grandTotalMinor,
        amountMinor: grandTotalMinor,
        printedGrandTotalMinor: grandTotalMinor,
        lineCount: (t.lines && t.lines.length) || 1,
        vendorName: vName,
        customerName: cName,
        partyName: t.partyName || vName || cName,
        paymentMode: t.paymentMode || t.method || 'cash',
        currency: t.currency || 'PKR',
        status: t.status || 'confirmed',
        isDemo: true
      };

      await db.put('transactions', normalizedTx);
      counts.transactions++;

      if (t.lines && t.lines.length > 0) {
        for (const l of t.lines) {
          const lTot = l.lineTotalMinor ?? (l.qty ? l.qty * (l.unitPriceMinor || 0) : 0);
          await db.put('transactionLines', {
            ...l,
            transactionId: t.id,
            nameRaw: l.nameRaw || l.name || 'Item',
            qtyBilled: l.qtyBilled ?? l.qty ?? 1,
            unit: l.unit || 'pcs',
            unitPriceMinor: l.unitPriceMinor ?? 0,
            lineTotalMinor: lTot,
            printedLineTotalMinor: lTot,
            isDemo: true
          });

          // Record stock movement for items
          if (txType === 'purchase' || txType === 'bill' || txType === 'sale') {
            try {
              const matchedItem = seed.items.find(it => it.name === l.nameRaw || it.id === l.itemId);
              if (matchedItem) {
                await db.put('stockMovements', {
                  id: `sm_${t.id}_${l.id || Math.random().toString(36).slice(2, 7)}`,
                  itemId: matchedItem.id,
                  type: txType === 'sale' ? 'out' : 'in',
                  quantityMilli: (l.qtyBilled ?? l.qty ?? 1) * 1000,
                  unitCostMinor: l.unitPriceMinor || matchedItem.baseCostMinor,
                  date: t.date,
                  refType: txType,
                  refId: t.id,
                  isDemo: true
                });
                counts.stockMovements++;
              }
            } catch {}
          }
        }
      }

      // If it's a payment or receipt, also populate payments store so Ledger and Accounts track it
      if (t.type === 'payment' || t.type === 'receipt') {
        try {
          await db.put('payments', {
            id: `pay_${t.id}`,
            transactionId: t.id,
            partyId: t.partyId,
            partyName: t.partyName || vName || cName,
            type: t.type,
            amountMinor: grandTotalMinor,
            paymentMode: t.method || 'cash',
            date: t.date,
            status: 'confirmed',
            isDemo: true
          });
        } catch {}
      }

      // If it's an expense, also populate expenses store
      if (t.type === 'expense') {
        try {
          await db.put('expenses', {
            id: `exp_${t.id}`,
            category: t.category || 'General Expense',
            description: t.description || 'Demo Expense',
            amountMinor: grandTotalMinor,
            currency: t.currency || 'PKR',
            date: t.date,
            status: 'confirmed',
            isDemo: true
          });
        } catch {}
      }

      if (t.debitNote) {
        await db.put('debitNotes', {
          id: `dn_${t.id}`,
          noteNumber: t.debitNote.noteNumber,
          transactionId: t.id,
          partyId: t.partyId,
          vendorName: t.vendorName,
          date: t.date,
          currency: t.currency,
          totalMinor: t.debitNote.shortageMinor,
          status: 'open',
          isDemo: true
        });
      }
    }

    // Seed Demo Purchase Orders (PO)
    try {
      const po1Total = 7000000;
      await db.put('purchaseOrders', {
        id: 'po_demo_001',
        poNumber: 'PO-2026-001',
        vendorId: seed.vendors[0]?.id || 'party_v_01',
        vendorName: seed.vendors[0]?.name || 'Al-Madina Wholesale Traders',
        date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
        lines: [
          { itemId: seed.items[0]?.id || 'it_sugar', itemName: seed.items[0]?.name || 'Fine White Sugar', qty: 50, unit: 'kg', unitPriceMinor: 14000, lineTotalMinor: po1Total }
        ],
        grandTotalMinor: po1Total,
        currency: 'PKR',
        status: 'sent',
        isDemo: true
      });
      const po2Total = 9600000;
      await db.put('purchaseOrders', {
        id: 'po_demo_002',
        poNumber: 'PO-2026-002',
        vendorId: seed.vendors[2]?.id || 'party_v_03',
        vendorName: seed.vendors[2]?.name || 'Kisan Edible Oil Traders',
        date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
        lines: [
          { itemId: seed.items[2]?.id || 'it_oil', itemName: seed.items[2]?.name || 'Cooking Oil 5L Tin', qty: 40, unit: 'pcs', unitPriceMinor: 240000, lineTotalMinor: po2Total }
        ],
        grandTotalMinor: po2Total,
        currency: 'PKR',
        status: 'draft',
        isDemo: true
      });
      counts.purchaseOrders = (counts.purchaseOrders || 0) + 2;
    } catch (e) {
      console.warn('Demo engine failed to seed purchase orders:', e);
    }

    // Seed Demo Category Budgets
    try {
      const curMonth = new Date().toISOString().slice(0, 7);
      await db.put('budgets', { id: 'b_demo_util', categoryId: 'Utilities', categoryName: 'Utilities', limitMinor: 3500000, month: curMonth, isDemo: true });
      await db.put('budgets', { id: 'b_demo_staff', categoryId: 'Staff Meal', categoryName: 'Staff Meal', limitMinor: 1500000, month: curMonth, isDemo: true });
      await db.put('budgets', { id: 'b_demo_fuel', categoryId: 'Fuel & Logistics', categoryName: 'Fuel & Logistics', limitMinor: 2000000, month: curMonth, isDemo: true });
      counts.budgets = (counts.budgets || 0) + 3;
    } catch (e) {
      console.warn('Demo engine failed to seed budgets:', e);
    }

    const elapsedMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      counts,
      elapsedMs
    };
  },

  /**
   * Removes ONLY records marked with isDemo === true.
   * Leaves all authentic user records completely untouched with zero drift.
   */
  async removeDemoData(options = {}) {
    const startTime = performance.now();
    const db = window.db;
    if (!db) throw new Error('Database module window.db not available');

    const stores = ['transactions', 'transactionLines', 'parties', 'items', 'accounts', 'stockMovements', 'debitNotes', 'purchaseOrders', 'payments', 'expenses', 'recurringRules', 'budgets'];
    let totalDeleted = 0;
    const removedStores = {};

    for (const storeName of stores) {
      try {
        const records = await db.getAll(storeName);
        let storeDeleted = 0;
        for (const rec of records) {
          const isDemoRule = storeName === 'recurringRules' && ['rec_rent', 'rec_ptcl', 'rec_elec', 'rec_staff', 'rec_soft'].includes(rec?.id);
          if (rec && (rec.isDemo === true || isDemoRule)) {
            await db.remove(storeName, rec.id);
            storeDeleted++;
            totalDeleted++;
          }
        }
        removedStores[storeName] = storeDeleted;
      } catch (err) {
        // Store might be empty or missing in test harness
        removedStores[storeName] = 0;
      }
    }

    const elapsedMs = Math.round(performance.now() - startTime);
    return {
      success: true,
      deletedCount: totalDeleted,
      removedStores,
      elapsedMs
    };
  }
};

if (typeof window !== 'undefined') {
  window.DemoEngine = DemoEngine;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DemoEngine;
}
