/**
 * app/(tabs)/history.tsx
 *
 * Enhanced history screen:
 *  - Shows ALL event types: SALE, PURCHASE, REFUND, DEBT_CREATED, DEBT_PAYMENT
 *  - Swipe-left or long-press on a SALE/DEBT_CREATED to refund
 *  - Tap any entry → see full details + "Generate PDF" button
 *  - Header: export history CSV + filter by type
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { useInventory, HistoryEntry, TransactionType } from '@/contexts/InventoryContext';
import { generateBillPDF } from '@/lib/generateBillPDF';

// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<TransactionType, string> = {
  SALE: '#2563eb',
  PURCHASE: '#16a34a',
  REFUND: '#dc2626',
  DEBT_CREATED: '#d97706',
  DEBT_PAYMENT: '#7c3aed',
  MANUAL_ADJUST: '#64748b',
};

const TYPE_LABELS_EN: Record<TransactionType, string> = {
  SALE: 'Sale',
  PURCHASE: 'Purchase',
  REFUND: 'Refund',
  DEBT_CREATED: 'On Credit',
  DEBT_PAYMENT: 'Payment',
  MANUAL_ADJUST: 'Adjustment',
};

const TYPE_LABELS_AR: Record<TransactionType, string> = {
  SALE: 'بيع',
  PURCHASE: 'شراء',
  REFUND: 'استرداد',
  DEBT_CREATED: 'دين',
  DEBT_PAYMENT: 'دفعة',
  MANUAL_ADJUST: 'تعديل',
};

// ─────────────────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { history, refundBill, exportCSV, lang } = useInventory();
  const isRTL = lang === 'ar';
  const typeLabels = isRTL ? TYPE_LABELS_AR : TYPE_LABELS_EN;

  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [filter, setFilter] = useState<TransactionType | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const labels = {
    en: {
      title: 'History',
      export: 'Export CSV',
      all: 'All',
      noEntries: 'No entries yet',
      detail: 'Transaction Details',
      items: 'Items',
      total: 'Total',
      paid: 'Paid',
      owed: 'Owed',
      customer: 'Customer',
      refund: 'Refund This Bill',
      pdf: 'Generate PDF',
      close: 'Close',
      refundConfirm: 'Refund this bill? Stock will be restored.',
      refundOk: 'Yes, Refund',
      cancel: 'Cancel',
      search: 'Search customer or item...',
      note: 'Note',
      paymentAmount: 'Payment Amount',
    },
    ar: {
      title: 'السجل',
      export: 'تصدير CSV',
      all: 'الكل',
      noEntries: 'لا توجد سجلات بعد',
      detail: 'تفاصيل المعاملة',
      items: 'الأصناف',
      total: 'الإجمالي',
      paid: 'المدفوع',
      owed: 'المتبقي',
      customer: 'العميل',
      refund: 'استرداد هذه الفاتورة',
      pdf: 'إنشاء PDF',
      close: 'إغلاق',
      refundConfirm: 'استرداد هذه الفاتورة؟ سيتم استعادة المخزون.',
      refundOk: 'نعم، استرداد',
      cancel: 'إلغاء',
      search: 'ابحث عن عميل أو صنف...',
      note: 'ملاحظة',
      paymentAmount: 'مبلغ الدفعة',
    },
  }[lang];

  const filtered = useMemo(() => {
    let items = history;
    if (filter !== 'ALL') items = items.filter((h) => h.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (h) =>
          h.customerName?.toLowerCase().includes(q) ||
          h.items?.some((i) => i.name.toLowerCase().includes(q) || i.arabicName?.includes(q)) ||
          h.note?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [history, filter, search]);

  const handleRefund = useCallback(
    (entry: HistoryEntry) => {
      Alert.alert(labels.refundConfirm, '', [
        { text: labels.cancel, style: 'cancel' },
        {
          text: labels.refundOk,
          style: 'destructive',
          onPress: async () => {
            try {
              await refundBill(entry.id);
              setSelectedEntry(null);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]);
    },
    [refundBill, labels]
  );

  const canRefund = (entry: HistoryEntry) =>
    (entry.type === 'SALE' || entry.type === 'DEBT_CREATED') &&
    !entry.note?.startsWith('[REFUNDED]');

  const renderEntry = useCallback(
    ({ item }: { item: HistoryEntry }) => {
      const color = TYPE_COLORS[item.type];
      const label = typeLabels[item.type];
      const refunded = item.note?.startsWith('[REFUNDED]');

      return (
        <TouchableOpacity
          style={[styles.card, refunded && styles.refundedCard]}
          onPress={() => setSelectedEntry(item)}
          activeOpacity={0.75}
        >
          <View style={[styles.typeTag, { backgroundColor: color }]}>
            <Text style={styles.typeTagText}>{label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.entryDate, isRTL && styles.rtl]}>
              {new Date(item.timestamp).toLocaleString()}
            </Text>
            {item.customerName ? (
              <Text style={[styles.customerText, isRTL && styles.rtl]}>
                {item.customerName}
              </Text>
            ) : null}
            {item.items && item.items.length > 0 ? (
              <Text style={[styles.itemSummary, isRTL && styles.rtl]} numberOfLines={1}>
                {item.items.map((i) => `${isRTL && i.arabicName ? i.arabicName : i.name} ×${i.quantity}`).join(', ')}
              </Text>
            ) : null}
            {item.paymentAmount !== undefined ? (
              <Text style={[styles.itemSummary, isRTL && styles.rtl]}>
                {labels.paymentAmount}: {item.paymentAmount.toFixed(2)}
              </Text>
            ) : null}
          </View>
          <View style={styles.amountCol}>
            {item.totalAmount !== undefined ? (
              <Text style={[styles.amount, { color }]}>
                {item.totalAmount.toFixed(2)}
              </Text>
            ) : item.paymentAmount !== undefined ? (
              <Text style={[styles.amount, { color }]}>
                {item.paymentAmount.toFixed(2)}
              </Text>
            ) : null}
            {refunded ? (
              <Text style={styles.refundedTag}>↩</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [lang, typeLabels, labels, isRTL]
  );

  // Filter tabs
  const filterTypes: Array<TransactionType | 'ALL'> = [
    'ALL', 'SALE', 'PURCHASE', 'REFUND', 'DEBT_CREATED', 'DEBT_PAYMENT',
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{labels.title}</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={() => exportCSV('history')}>
          <Text style={styles.exportBtnText}>{labels.export}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={labels.search}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 8 }}
      >
        {filterTypes.map((ft) => (
          <TouchableOpacity
            key={ft}
            style={[
              styles.filterChip,
              filter === ft && {
                backgroundColor:
                  ft === 'ALL' ? '#1a1a1a' : TYPE_COLORS[ft as TransactionType],
              },
            ]}
            onPress={() => setFilter(ft)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === ft && styles.filterChipTextActive,
              ]}
            >
              {ft === 'ALL' ? labels.all : typeLabels[ft as TransactionType]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderEntry}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>{labels.noEntries}</Text>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={!!selectedEntry}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedEntry(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView>
              <Text style={styles.modalTitle}>{labels.detail}</Text>
              {selectedEntry && (
                <>
                  <View
                    style={[
                      styles.typeTag,
                      { backgroundColor: TYPE_COLORS[selectedEntry.type], alignSelf: 'flex-start', marginBottom: 12 },
                    ]}
                  >
                    <Text style={styles.typeTagText}>
                      {typeLabels[selectedEntry.type]}
                    </Text>
                  </View>
                  <Text style={styles.detailRow}>
                    {new Date(selectedEntry.timestamp).toLocaleString()}
                  </Text>
                  {selectedEntry.customerName ? (
                    <Text style={styles.detailRow}>
                      {labels.customer}: {selectedEntry.customerName}
                    </Text>
                  ) : null}
                  {selectedEntry.note ? (
                    <Text style={[styles.detailRow, { color: '#888' }]}>
                      {labels.note}: {selectedEntry.note}
                    </Text>
                  ) : null}

                  {/* Items */}
                  {selectedEntry.items && selectedEntry.items.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>{labels.items}</Text>
                      {selectedEntry.items.map((item, idx) => (
                        <View key={idx} style={styles.itemRow}>
                          <Text style={styles.itemName}>
                            {isRTL && item.arabicName ? item.arabicName : item.name}
                          </Text>
                          <Text style={styles.itemQty}>×{item.quantity}</Text>
                          <Text style={styles.itemPrice}>
                            {(item.quantity * item.unitPrice).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                      <View style={styles.divider} />
                    </>
                  )}

                  {/* Totals */}
                  {selectedEntry.totalAmount !== undefined ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{labels.total}</Text>
                      <Text style={styles.totalValue}>
                        {selectedEntry.totalAmount.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}
                  {selectedEntry.amountPaid !== undefined &&
                    selectedEntry.amountPaid !== selectedEntry.totalAmount ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{labels.paid}</Text>
                      <Text style={[styles.totalValue, { color: '#16a34a' }]}>
                        {selectedEntry.amountPaid.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}
                  {(selectedEntry.amountOwed ?? 0) > 0 ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{labels.owed}</Text>
                      <Text style={[styles.totalValue, { color: '#dc2626' }]}>
                        {selectedEntry.amountOwed!.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}
                  {selectedEntry.paymentAmount !== undefined ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{labels.paymentAmount}</Text>
                      <Text style={[styles.totalValue, { color: '#7c3aed' }]}>
                        {selectedEntry.paymentAmount.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={styles.modalActions}>
              {selectedEntry && canRefund(selectedEntry) && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                  onPress={() => handleRefund(selectedEntry)}
                >
                  <Text style={styles.actionBtnText}>↩ {labels.refund}</Text>
                </TouchableOpacity>
              )}
              {selectedEntry &&
                (selectedEntry.type === 'SALE' ||
                  selectedEntry.type === 'DEBT_CREATED' ||
                  selectedEntry.type === 'PURCHASE') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#2563eb' }]}
                    onPress={() => generateBillPDF(selectedEntry, lang)}
                  >
                    <Text style={styles.actionBtnText}>📄 {labels.pdf}</Text>
                  </TouchableOpacity>
                )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#555' }]}
                onPress={() => setSelectedEntry(null)}
              >
                <Text style={styles.actionBtnText}>{labels.close}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: { fontSize: 18, fontWeight: '700' },
  exportBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  exportBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  searchRow: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: '#fff' },
  searchInput: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
  },
  filterScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  filterChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  refundedCard: { opacity: 0.6 },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  typeTagText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  entryDate: { fontSize: 11, color: '#888' },
  customerText: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', marginTop: 2 },
  itemSummary: { fontSize: 12, color: '#666', marginTop: 2 },
  amountCol: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '700' },
  refundedTag: { fontSize: 18, color: '#dc2626' },
  emptyText: { textAlign: 'center', color: '#aaa', paddingVertical: 40 },
  rtl: { textAlign: 'right' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  detailRow: { fontSize: 13, color: '#555', marginBottom: 6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  itemName: { flex: 1, fontSize: 13, color: '#1a1a1a' },
  itemQty: { fontSize: 13, color: '#555' },
  itemPrice: { fontSize: 13, fontWeight: '600', color: '#1a1a1a', minWidth: 60, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  totalLabel: { fontSize: 13, color: '#555' },
  totalValue: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  modalActions: { flexDirection: 'column', gap: 8, marginTop: 16 },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
