// =========================================================================
// PAYMENT VOUCHER / PAY ORDER (PURE FUNCTIONS)
// Formal Payment Voucher with Indian/Western words, references & signatures
// =========================================================================

import { amountInWords, formatMoney } from '../../core/money.js';

/**
 * Creates a normalized Payment Voucher / Pay Order entity.
 *
 * @param {Object} data - Voucher parameters
 * @returns {Object} Complete Payment Voucher object
 */
export function createPaymentVoucher(data) {
  const {
    voucherNumber,
    partyId,
    payeeName,
    amountMinor,
    date = new Date().toISOString().slice(0, 10),
    paymentMode = 'cash', // 'cash' | 'bank' | 'cheque' | 'online'
    chequeNumber = '',
    bankName = '',
    referenceBills = [], // Array of bill numbers or IDs
    currency = 'PKR',
    system = 'indian', // 'indian' | 'western'
    notes = '',
    preparedBy = 'Staff',
    authorizedBy = 'Admin'
  } = data;

  const words = amountInWords(amountMinor, currency, { system });

  return {
    id: 'pv_' + Math.random().toString(36).slice(2, 9),
    voucherNumber,
    type: 'payment_voucher',
    partyId,
    payeeName,
    amountMinor,
    currency,
    words,
    system,
    date,
    paymentMode,
    chequeNumber,
    bankName,
    referenceBills,
    notes,
    status: 'approved',
    signatures: {
      preparedBy,
      checkedBy: '',
      authorizedBy,
      receivedBy: ''
    },
    createdAt: new Date().toISOString()
  };
}

/**
 * Generates printable HTML for a Payment Voucher.
 *
 * @param {Object} voucher - Payment voucher entity
 * @param {Object} business - Business header data
 * @returns {string} Renderable HTML
 */
export function renderPaymentVoucherPrintHTML(voucher, business = {}) {
  const bizName = business.name || 'Company Name';
  const bizAddress = business.address || '';
  const bizPhone = business.phone || '';

  return `
    <div style="max-width:760px; margin:0 auto; padding:24px; font-family:sans-serif; color:#1E201E; background:#fff; border:1px solid #E4DFD7;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #2F5D50; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <h2 style="margin:0 0 4px 0; color:#2F5D50; font-size:20px;">${bizName}</h2>
          <div style="font-size:12px; color:#686D68;">${bizAddress} ${bizPhone ? '• Tel: ' + bizPhone : ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:16px; font-weight:bold; color:#2F5D50;">PAYMENT VOUCHER</div>
          <div style="font-size:12px; font-family:monospace; margin-top:4px;"># ${voucher.voucherNumber}</div>
          <div style="font-size:12px; color:#686D68;">Date: ${voucher.date}</div>
        </div>
      </div>

      <!-- Payee and Details -->
      <div style="margin-bottom:16px; font-size:13px; line-height:1.6;">
        <div style="display:flex; margin-bottom:8px;">
          <strong style="width:130px;">Paid To (Payee):</strong>
          <span style="border-bottom:1px dotted #1E201E; flex:1; font-weight:600;">${voucher.payeeName}</span>
        </div>
        <div style="display:flex; margin-bottom:8px;">
          <strong style="width:130px;">Amount in Figures:</strong>
          <span style="font-size:15px; font-weight:bold; color:#2F5D50; border-bottom:1px dotted #1E201E; flex:1;">
            ${formatMoney(voucher.amountMinor, voucher.currency)}
          </span>
        </div>
        <div style="display:flex; margin-bottom:8px;">
          <strong style="width:130px;">Amount in Words:</strong>
          <span style="border-bottom:1px dotted #1E201E; flex:1; font-style:italic; font-weight:600;">
            ${voucher.words}
          </span>
        </div>
        <div style="display:flex; margin-bottom:8px;">
          <strong style="width:130px;">Payment Mode:</strong>
          <span style="border-bottom:1px dotted #1E201E; flex:1;">
            ${voucher.paymentMode.toUpperCase()} 
            ${voucher.chequeNumber ? '• Cheque #: ' + voucher.chequeNumber : ''}
            ${voucher.bankName ? '• Bank: ' + voucher.bankName : ''}
          </span>
        </div>
        ${voucher.referenceBills && voucher.referenceBills.length > 0 ? `
          <div style="display:flex; margin-bottom:8px;">
            <strong style="width:130px;">Ref Bills/Invoices:</strong>
            <span style="border-bottom:1px dotted #1E201E; flex:1;">${voucher.referenceBills.join(', ')}</span>
          </div>
        ` : ''}
        ${voucher.notes ? `
          <div style="display:flex; margin-bottom:8px;">
            <strong style="width:130px;">Remarks / Notes:</strong>
            <span style="border-bottom:1px dotted #1E201E; flex:1;">${voucher.notes}</span>
          </div>
        ` : ''}
      </div>

      <!-- Signatures Grid -->
      <div style="margin-top:40px; display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; text-align:center; font-size:11px;">
        <div>
          <div style="border-bottom:1px solid #1E201E; height:32px; margin-bottom:4px;"></div>
          <strong>Prepared By</strong>
          <div style="color:#686D68;">${voucher.signatures.preparedBy || '-'}</div>
        </div>
        <div>
          <div style="border-bottom:1px solid #1E201E; height:32px; margin-bottom:4px;"></div>
          <strong>Checked By</strong>
          <div style="color:#686D68;">-</div>
        </div>
        <div>
          <div style="border-bottom:1px solid #1E201E; height:32px; margin-bottom:4px;"></div>
          <strong>Authorized By</strong>
          <div style="color:#686D68;">${voucher.signatures.authorizedBy || '-'}</div>
        </div>
        <div>
          <div style="border-bottom:1px solid #1E201E; height:32px; margin-bottom:4px;"></div>
          <strong>Receiver's Sign</strong>
          <div style="color:#686D68;">-</div>
        </div>
      </div>
    </div>
  `;
}
