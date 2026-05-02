/**
 * components/CheckoutModal.tsx
 *
 * Drop-in checkout modal that handles both:
 *   (A) Full payment  → calls commitSale()
 *   (B) Partial / credit → calls addSaleWithDebt()
 *
 * Usage:
 *   <CheckoutModal
 *     visible={showCheckout}
 *     items={scanQueue}
 *     onClose={() => setShowCheckout(false)}
 *     onDone={() => { setShowCheckout(false); clearQueue(); }}
 *   />
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useInventory, TransactionItem } from '@/contexts/InventoryContext';

interface Props {
  visible: boolean;
  items: TransactionItem[];
  onClose: () => void;
  onDone: () => void;
}

type PayMode = 'full' | 'partial' | 'credit';

export function CheckoutModal({ visible, items, onClose, onDone }: Props) {
  const { commitSale, addSaleWithDebt, lang } = useInventory();
  const isRTL = lang === 'ar';

  const [mode, setMode] = useState<PayMode>('full');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [amountPaidStr, setAmountPaidStr] = useState('');
  const [loading, setLoading] = useState(false);

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const labels = {
    en: {
      title: 'Checkout',
      total: 'Total',
      fullPay: 'Paid in Full',
      partial: 'Partial Payment',
      fullCredit: 'Full Credit (No Payment)',
      customerName: 'Customer Name *',
      customerPhone: 'Phone (optional)',
      amountPaid: 'Amount Paid',
      confirm: 'Confirm Sale',
      cancel: 'Cancel',
      errorName: 'Customer name is required for credit sales.',
      errorAmount: 'Enter a valid amount (0 – total).',
      summary: 'n items',
    },
    ar: {
      title: 'الدفع',
      total: 'الإجمالي',
      fullPay: 'دفع كامل',
      partial: 'دفع جزئي',
      fullCredit: 'دين كامل (بدون دفع)',
      customerName: 'اسم العميل *',
      customerPhone: 'الهاتف (اختياري)',
      amountPaid: 'المبلغ المدفوع',
      confirm: 'تأكيد البيع',
      cancel: 'إلغاء',
      errorName: 'اسم العميل مطلوب للمبيعات الآجلة.',
      errorAmount: 'أدخل مبلغاً صحيحاً (0 – الإجمالي).',
      summary: 'أصناف',
    },
  }[lang];

  const reset = () => {
    setMode('full');
    setCustomerName('');
    setCustomerPhone('');
    setAmountPaidStr('');
  };

  const handleConfirm = useCallback(async () => {
    if (mode === 'full') {
      setLoading(true);
      try {
        await commitSale(items);
        reset();
        onDone();
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Credit or partial
    if (!customerName.trim()) {
      Alert.alert('', labels.errorName);
      return;
    }

    const amountPaid =
      mode === 'full credit' || mode === 'credit'
        ? 0
        : parseFloat(amountPaidStr);

    if (mode === 'partial' && (isNaN(amountPaid) || amountPaid < 0 || amountPaid > total)) {
      Alert.alert('', labels.errorAmount);
      return;
    }

    setLoading(true);
    try {
      await addSaleWithDebt(
        items,
        mode === 'credit' ? 0 : amountPaid,
        { name: customerName.trim(), phone: customerPhone.trim() || undefined }
      );
      reset();
      onDone();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [mode, items, customerName, customerPhone, amountPaidStr, total, commitSale, addSaleWithDebt, labels, onDone]);

  const owed =
    mode === 'credit'
      ? total
      : mode === 'partial'
      ? Math.max(0, total - (parseFloat(amountPaidStr) || 0))
      : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.box}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{labels.title}</Text>

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{labels.total}</Text>
              <Text style={styles.totalValue}>{total.toFixed(2)}</Text>
            </View>
            <Text style={styles.itemCount}>
              {items.length} {labels.summary}
            </Text>

            {/* Mode selector */}
            <View style={styles.modeRow}>
              {(['full', 'partial', 'credit'] as PayMode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                  onPress={() => setMode(m)}
                >
                  <Text
                    style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}
                  >
                    {m === 'full'
                      ? labels.fullPay
                      : m === 'partial'
                      ? labels.partial
                      : labels.fullCredit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Credit / partial fields */}
            {(mode === 'partial' || mode === 'credit') && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={labels.customerName}
                  value={customerName}
                  onChangeText={setCustomerName}
                />
                <TextInput
                  style={styles.input}
                  placeholder={labels.customerPhone}
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  keyboardType="phone-pad"
                />
                {mode === 'partial' && (
                  <TextInput
                    style={styles.input}
                    placeholder={labels.amountPaid}
                    value={amountPaidStr}
                    onChangeText={setAmountPaidStr}
                    keyboardType="decimal-pad"
                  />
                )}
                {owed > 0 && (
                  <View style={styles.owedRow}>
                    <Text style={styles.owedLabel}>
                      {isRTL ? 'المتبقي:' : 'Amount owed:'}
                    </Text>
                    <Text style={styles.owedValue}>{owed.toFixed(2)}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.cancelText}>{labels.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, loading && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={loading}
            >
              <Text style={styles.confirmText}>{labels.confirm}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  box: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '85%',
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  totalLabel: { fontSize: 15, color: '#555' },
  totalValue: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  itemCount: { fontSize: 12, color: '#aaa', marginBottom: 20 },
  modeRow: { gap: 8, marginBottom: 20 },
  modeBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: '#1a1a1a' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },
  modeBtnTextActive: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  owedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  owedLabel: { fontSize: 13, color: '#dc2626' },
  owedValue: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelText: { fontWeight: '600', color: '#444', fontSize: 14 },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
  },
  confirmText: { fontWeight: '700', color: '#fff', fontSize: 15 },
});
