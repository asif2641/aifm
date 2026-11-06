// =========================================================================
// SYNTHETIC BILL IMAGE GENERATOR & OFFLINE DEMO SCAN (CANVAS-BASED)
// Generates thermal receipts, A4 GST invoices & Urdu parchi. Zero AI API calls.
// =========================================================================

function generateBillCanvas(billType = 'thermal', options = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (billType === 'thermal') {
    // Thermal receipt (400 x 650)
    canvas.width = 400;
    canvas.height = 650;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1E201E';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('AL-MADINA WHOLESALE', 200, 40);
    ctx.font = '12px monospace';
    ctx.fillText('Main Bazar, Lahore • Tel: 0300-5550101', 200, 60);
    ctx.fillText('NTN: 8812041-3', 200, 78);

    ctx.textAlign = 'left';
    ctx.fillText('----------------------------------------', 20, 100);
    ctx.fillText(`Bill #: ${options.billNo || 'INV-1001'}`, 20, 120);
    ctx.fillText(`Date: ${options.date || new Date().toISOString().slice(0, 10)}`, 20, 140);
    ctx.fillText('Cashier: Counter 1 (Shift A)', 20, 160);
    ctx.fillText('----------------------------------------', 20, 180);

    ctx.font = 'bold 12px monospace';
    ctx.fillText('Item Description       Qty  Rate   Total', 20, 205);
    ctx.font = '12px monospace';
    ctx.fillText('----------------------------------------', 20, 220);

    const items = options.items || [
      { name: 'Fine White Sugar', qty: '10 kg', rate: '150.00', tot: '1,500.00' },
      { name: 'Wheat Flour 10kg', qty: '2 pcs', rate: '1,200.00', tot: '2,400.00' },
      { name: 'Cooking Oil 5L', qty: '1 tin', rate: '2,650.00', tot: '2,650.00' }
    ];

    let y = 245;
    items.forEach(it => {
      ctx.fillText(it.name.padEnd(20) + it.qty.padEnd(6) + it.rate.padEnd(8) + it.tot, 20, y);
      y += 24;
    });

    ctx.fillText('----------------------------------------', 20, y + 10);
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`SUBTOTAL:                      ${options.subtotal || 'Rs 6,550.00'}`, 20, y + 36);
    ctx.fillText(`SALES TAX (0%):                     Rs 0.00`, 20, y + 60);
    ctx.fillText(`GRAND TOTAL:                   ${options.total || 'Rs 6,550.00'}`, 20, y + 86);
    ctx.font = '11px monospace';
    ctx.fillText('----------------------------------------', 20, y + 105);
    ctx.textAlign = 'center';
    ctx.fillText('Thank you for shopping with Al-Madina!', 200, y + 128);
    ctx.fillText('* Powered by Smart Bill Auditor *', 200, y + 148);

  } else if (billType === 'gst-a4' || billType === 'a4_gst') {
    // A4 Standard Corporate GST Bill (700 x 950)
    canvas.width = 700;
    canvas.height = 950;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#1E201E';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

    ctx.fillStyle = '#2F5D50';
    ctx.fillRect(20, 20, canvas.width - 40, 80);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px -apple-system, sans-serif';
    ctx.fillText('LAHORE GRAIN & FLOUR MILLS', 40, 60);
    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillText('Industrial Area, Kot Lakhpat, Lahore | STRN: 3277876123456 | NTN: 8812042-7', 40, 82);

    ctx.fillStyle = '#1E201E';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillText('SALES TAX INVOICE', 40, 135);

    ctx.font = '13px -apple-system, sans-serif';
    ctx.fillText(`Invoice No: ${options.billNo || 'INV-GST-9042'}`, 40, 165);
    ctx.fillText(`Date of Issue: ${options.date || new Date().toISOString().slice(0, 10)}`, 40, 185);
    ctx.fillText('Payment Terms: Net 30 Days', 40, 205);

    ctx.fillText('Buyer Name: Smart Auditor Client', 420, 165);
    ctx.fillText('Buyer NTN: 9918231-1', 420, 185);
    ctx.fillText('Delivery Address: Lahore City Branch', 420, 205);

    // Table Header
    ctx.fillStyle = '#F3EFEA';
    ctx.fillRect(40, 230, 620, 30);
    ctx.fillStyle = '#1E201E';
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillText('Sr', 50, 250);
    ctx.fillText('Item Description', 90, 250);
    ctx.fillText('Qty', 320, 250);
    ctx.fillText('Unit Rate', 390, 250);
    ctx.fillText('Excl. Tax', 480, 250);
    ctx.fillText('Total PKR', 580, 250);

    ctx.font = '12px -apple-system, sans-serif';
    const lines = [
      { sr: '1', desc: 'Whole Wheat Flour 20kg Bag', qty: '50 bags', rate: '2,200', excl: '110,000', tot: '110,000' },
      { sr: '2', desc: 'Super Basmati Rice 25kg', qty: '30 bags', rate: '7,000', excl: '210,000', tot: '210,000' }
    ];

    let rowY = 285;
    lines.forEach(l => {
      ctx.fillText(l.sr, 50, rowY);
      ctx.fillText(l.desc, 90, rowY);
      ctx.fillText(l.qty, 320, rowY);
      ctx.fillText(l.rate, 390, rowY);
      ctx.fillText(l.excl, 480, rowY);
      ctx.fillText(l.tot, 580, rowY);
      rowY += 30;
    });

    ctx.strokeRect(40, 230, 620, 180);

    ctx.font = 'bold 13px -apple-system, sans-serif';
    ctx.fillText('Subtotal Excl. Tax:', 440, 450);
    ctx.fillText('Rs 320,000.00', 570, 450);
    ctx.fillText('Sales Tax (18% GST):', 440, 475);
    ctx.fillText('Rs 57,600.00', 570, 475);
    ctx.fillText('Total Payable Incl. GST:', 440, 505);
    ctx.fillText('Rs 377,600.00', 570, 505);

  } else if (billType === 'urdu-parchi' || billType === 'urdu_parchi') {
    // Urdu Handwritten Parchi (380 x 550)
    canvas.width = 380;
    canvas.height = 550;
    ctx.fillStyle = '#FFFDF8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1E201E';
    ctx.font = 'bold 22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('بسم اللہ الرحمن الرحیم', 190, 40);
    ctx.font = 'bold 18px serif';
    ctx.fillText('بسم اللہ جنرل اسٹور اینڈ کریانہ', 190, 70);
    ctx.font = '12px sans-serif';
    ctx.fillText('نزد جامع مسجد، غلہ منڈی • فون: 0321-7770202', 190, 92);

    ctx.textAlign = 'right';
    ctx.font = '14px serif';
    ctx.fillText('تاریخ: ' + (options.date || new Date().toISOString().slice(0, 10)), 340, 125);
    ctx.fillText('بل نمبر: ' + (options.billNo || '042'), 340, 145);

    ctx.beginPath();
    ctx.moveTo(30, 160);
    ctx.lineTo(350, 160);
    ctx.stroke();

    const urduLines = [
      { name: 'چینی 10 کلو', rate: '150', total: '1500' },
      { name: 'گھی 5 پیکٹ', rate: '540', total: '2700' },
      { name: 'دال چنا 2 کلو', rate: '260', total: '520' }
    ];

    let y = 195;
    urduLines.forEach(l => {
      ctx.fillText(l.name, 340, y);
      ctx.textAlign = 'left';
      ctx.fillText(`${l.rate} x = Rs ${l.total}`, 40, y);
      ctx.textAlign = 'right';
      y += 32;
    });

    ctx.beginPath();
    ctx.moveTo(30, y + 10);
    ctx.lineTo(350, y + 10);
    ctx.stroke();

    ctx.font = 'bold 16px serif';
    ctx.fillText('کل میزان: Rs 4,720', 340, y + 42);

  } else if (billType === 'blurred' || billType === 'blurred_skewed') {
    // Blurred / degraded canvas to trigger Quality Gate warning
    canvas.width = 300;
    canvas.height = 400;
    ctx.fillStyle = '#CCCCCC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#666666';
    ctx.font = '14px monospace';
    ctx.filter = 'blur(8px)';
    ctx.fillText('RECEIPT BLURRED TEST', 30, 50);
    ctx.fillText('Item 1 .............. Rs 100', 30, 90);
    ctx.fillText('Item 2 .............. Rs 200', 30, 130);
    ctx.filter = 'none';
  }

  return canvas;
}

function getMockExtraction(billType = 'thermal') {
  if (billType === 'gst-a4' || billType === 'a4_gst') {
    return {
      vendor: {
        name: 'Lahore Grain & Flour Mills',
        taxId: 'STRN-3277876123456',
        phone: '0321-5550102'
      },
      billNumber: 'INV-GST-9042',
      date: new Date().toISOString().slice(0, 10),
      currency: 'PKR',
      subtotalMinor: 32000000,
      taxMinor: 5760000,
      totalMinor: 37760000,
      confidence: 96,
      lines: [
        {
          id: 'mock_gst_1',
          nameRaw: 'Whole Wheat Flour 20kg Bag',
          qty: 50,
          qtyMilli: 50000,
          unit: 'bag',
          unitPriceMinor: 220000,
          lineTotalMinor: 11000000,
          confidence: 97
        },
        {
          id: 'mock_gst_2',
          nameRaw: 'Super Basmati Rice 25kg',
          qty: 30,
          qtyMilli: 30000,
          unit: 'bag',
          unitPriceMinor: 700000,
          lineTotalMinor: 21000000,
          confidence: 95
        }
      ]
    };
  }

  if (billType === 'urdu-parchi' || billType === 'urdu_parchi') {
    return {
      vendor: {
        name: 'Bismillah General Store & Karyana',
        phone: '0321-7770202'
      },
      billNumber: 'PARCHI-042',
      date: new Date().toISOString().slice(0, 10),
      currency: 'PKR',
      subtotalMinor: 472000,
      taxMinor: 0,
      totalMinor: 472000,
      confidence: 91,
      lines: [
        { id: 'mock_u_1', nameRaw: 'Fine White Sugar (چینی)', qty: 10, qtyMilli: 10000, unit: 'kg', unitPriceMinor: 15000, lineTotalMinor: 150000, confidence: 92 },
        { id: 'mock_u_2', nameRaw: 'Banaspati Ghee 1kg (گھی)', qty: 5, qtyMilli: 5000, unit: 'pcs', unitPriceMinor: 54000, lineTotalMinor: 270000, confidence: 90 },
        { id: 'mock_u_3', nameRaw: 'Dal Chana (دال چنا)', qty: 2, qtyMilli: 2000, unit: 'kg', unitPriceMinor: 26000, lineTotalMinor: 52000, confidence: 91 }
      ]
    };
  }

  // Default Thermal
  return {
    vendor: {
      name: 'Al-Madina Wholesale Traders',
      phone: '0300-5550101',
      taxId: 'NTN-8812041-3'
    },
    billNumber: 'INV-1001',
    date: new Date().toISOString().slice(0, 10),
    currency: 'PKR',
    subtotalMinor: 655000,
    taxMinor: 0,
    totalMinor: 655000,
    confidence: 98,
    lines: [
      { id: 'mock_th_1', nameRaw: 'Fine White Sugar (چینی)', qty: 10, qtyMilli: 10000, unit: 'kg', unitPriceMinor: 15000, lineTotalMinor: 150000, confidence: 99 },
      { id: 'mock_th_2', nameRaw: 'Whole Wheat Flour (آٹا)', qty: 2, qtyMilli: 2000, unit: 'pcs', unitPriceMinor: 120000, lineTotalMinor: 240000, confidence: 98 },
      { id: 'mock_th_3', nameRaw: 'Cooking Oil 5L Tin (تیل)', qty: 1, qtyMilli: 1000, unit: 'pcs', unitPriceMinor: 265000, lineTotalMinor: 265000, confidence: 97 }
    ]
  };
}

const SyntheticBills = {
  generateBillCanvas,
  renderSyntheticBillCanvas: generateBillCanvas,
  getMockExtraction,
  getCannedDemoExtraction: getMockExtraction
};

if (typeof window !== 'undefined') {
  window.SyntheticBills = SyntheticBills;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyntheticBills;
}
