/**
 * lib/generateBillPDF.ts
 *
 * Generates a PDF receipt from a HistoryEntry and shares it.
 *
 * Install dependencies:
 *   pnpm --filter inventory-scanner add expo-print expo-sharing
 *
 * Usage:
 *   import { generateBillPDF } from '@/lib/generateBillPDF';
 *   await generateBillPDF(historyEntry, lang);
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { HistoryEntry } from '../contexts/InventoryContext';

function formatCurrency(amount: number) {
  return amount.toFixed(2);
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString('en-EG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildHtml(entry: HistoryEntry, lang: 'en' | 'ar'): string {
  const isRTL = lang === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';
  const align = isRTL ? 'right' : 'left';

  const labels = {
    en: {
      title: 'Receipt',
      billId: 'Bill #',
      date: 'Date',
      type: 'Type',
      customer: 'Customer',
      item: 'Item',
      qty: 'Qty',
      unit: 'Unit Price',
      subtotal: 'Subtotal',
      total: 'Total',
      paid: 'Paid',
      owed: 'Balance Owed',
      refund: 'REFUND',
      thankYou: 'Thank you!',
    },
    ar: {
      title: 'فاتورة',
      billId: 'رقم الفاتورة',
      date: 'التاريخ',
      type: 'النوع',
      customer: 'العميل',
      item: 'الصنف',
      qty: 'الكمية',
      unit: 'سعر الوحدة',
      subtotal: 'المجموع الفرعي',
      total: 'الإجمالي',
      paid: 'المدفوع',
      owed: 'المتبقي',
      refund: 'استرداد',
      thankYou: 'شكراً لك!',
    },
  }[lang];

  const typeLabel = (() => {
    switch (entry.type) {
      case 'SALE': return lang === 'ar' ? 'بيع' : 'Sale';
      case 'PURCHASE': return lang === 'ar' ? 'شراء' : 'Purchase';
      case 'REFUND': return lang === 'ar' ? 'استرداد' : 'Refund';
      case 'DEBT_CREATED': return lang === 'ar' ? 'بيع بدين' : 'Sale on Credit';
      default: return entry.type;
    }
  })();

  const itemsRows = (entry.items ?? [])
    .map((item) => {
      const sub = item.quantity * item.unitPrice;
      const name = isRTL && item.arabicName ? item.arabicName : item.name;
      return `
        <tr>
          <td>${name}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:${align}">${formatCurrency(item.unitPrice)}</td>
          <td style="text-align:${align}">${formatCurrency(sub)}</td>
        </tr>`;
    })
    .join('');

  const debtRow =
    (entry.amountOwed ?? 0) > 0
      ? `<tr style="color:#e53e3e;font-weight:bold">
           <td colspan="3" style="text-align:${align}">${labels.owed}</td>
           <td style="text-align:${align}">${formatCurrency(entry.amountOwed!)}</td>
         </tr>`
      : '';

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      padding: 24px;
      direction: ${dir};
    }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .header { margin-bottom: 16px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
    .meta { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    thead tr { background: #1a1a1a; color: white; }
    thead th { padding: 8px; text-align: ${align}; font-size: 12px; }
    tbody tr:nth-child(even) { background: #f5f5f5; }
    tbody td { padding: 7px 8px; }
    tfoot tr { font-weight: bold; font-size: 14px; }
    tfoot td { padding: 8px; border-top: 2px solid #1a1a1a; }
    .refund-badge {
      display: inline-block;
      background: #e53e3e;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-${isRTL ? 'right' : 'left'}: 8px;
    }
    .footer { margin-top: 24px; text-align: center; color: #888; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>
      ${labels.title}
      ${entry.type === 'REFUND' ? `<span class="refund-badge">${labels.refund}</span>` : ''}
    </h1>
    <div class="meta">
      <span>${labels.billId}: ${entry.id.slice(-8).toUpperCase()}</span>
      <span>${labels.date}: ${formatDate(entry.timestamp)}</span>
      <span>${labels.type}: ${typeLabel}</span>
      ${entry.customerName ? `<span>${labels.customer}: ${entry.customerName}</span>` : ''}
      ${entry.note ? `<span>${entry.note}</span>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${labels.item}</th>
        <th style="text-align:center">${labels.qty}</th>
        <th>${labels.unit}</th>
        <th>${labels.subtotal}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows || `<tr><td colspan="4" style="text-align:center;padding:16px;color:#888">—</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:${align}">${labels.total}</td>
        <td style="text-align:${align}">${formatCurrency(entry.totalAmount ?? 0)}</td>
      </tr>
      ${
        (entry.amountPaid ?? 0) > 0 && entry.amountPaid !== entry.totalAmount
          ? `<tr>
               <td colspan="3" style="text-align:${align}">${labels.paid}</td>
               <td style="text-align:${align}">${formatCurrency(entry.amountPaid!)}</td>
             </tr>`
          : ''
      }
      ${debtRow}
    </tfoot>
  </table>

  <div class="footer">${labels.thankYou}</div>
</body>
</html>`;
}

export async function generateBillPDF(
  entry: HistoryEntry,
  lang: 'en' | 'ar' = 'en'
): Promise<void> {
  const html = buildHtml(entry, lang);

  if (Platform.OS === 'web') {
    // Web: open print dialog
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
    return;
  }

  // Native: generate PDF and share
  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: `Bill ${entry.id.slice(-8).toUpperCase()}`,
    UTI: 'com.adobe.pdf',
  });
}
