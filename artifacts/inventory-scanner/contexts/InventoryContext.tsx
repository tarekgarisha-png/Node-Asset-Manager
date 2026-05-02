/**
 * contexts/InventoryContext.tsx
 *
 * Drop-in replacement for your existing InventoryContext.
 * New additions:
 *   - customers & debts state
 *   - addSaleWithDebt()       — sale where customer pays partial
 *   - recordDebtPayment()     — record a partial/full payment on a debt
 *   - refundBill()            — delete a bill and restore stock
 *   - exportCSV()             — export products | history | debts
 *   - history now tracks ALL event types
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

// ── Types ────────────────────────────────────────────────────────────────────

export type TransactionType =
  | 'SALE'
  | 'PURCHASE'
  | 'REFUND'
  | 'DEBT_CREATED'
  | 'DEBT_PAYMENT'
  | 'MANUAL_ADJUST';

export interface TransactionItem {
  barcode: string;
  name: string;
  arabicName?: string;
  quantity: number;
  unitPrice: number;
}

export interface HistoryEntry {
  id: string;
  type: TransactionType;
  timestamp: number;
  note?: string;
  items?: TransactionItem[];
  totalAmount?: number;
  customerId?: string;
  customerName?: string;
  amountPaid?: number;
  amountOwed?: number;
  paymentAmount?: number;
  debtId?: string;
  refundedEntryId?: string;
}

export interface Product {
  barcode: string;
  name: string;
  arabicName?: string;
  stock: number;
  minStock: number;
  unit?: string;
  price: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  totalDebt: number;
}

export interface DebtRecord {
  id: string;
  customerId: string;
  customerName: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: number;
  lastUpdatedAt: number;
  settled: boolean;
  relatedHistoryEntryId: string;
  payments: Array<{ amount: number; paidAt: number; note?: string }>;
}

// ── Storage Keys ─────────────────────────────────────────────────────────────

const KEYS = {
  products: 'inventory:products:v1',
  history: 'inventory:history:v1',
  lang: 'inventory:lang:v1',
  customers: 'inventory:customers:v1',
  debts: 'inventory:debts:v1',
} as const;

// ── State ────────────────────────────────────────────────────────────────────

interface State {
  products: Product[];
  history: HistoryEntry[];
  customers: Customer[];
  debts: DebtRecord[];
  lang: 'en' | 'ar';
  loading: boolean;
}

type Action =
  | { type: 'LOAD'; payload: Partial<State> }
  | { type: 'SET_LANG'; payload: 'en' | 'ar' }
  | { type: 'SET_PRODUCTS'; payload: Product[] }
  | { type: 'SET_HISTORY'; payload: HistoryEntry[] }
  | { type: 'SET_CUSTOMERS'; payload: Customer[] }
  | { type: 'SET_DEBTS'; payload: DebtRecord[] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD':
      return { ...state, ...action.payload, loading: false };
    case 'SET_LANG':
      return { ...state, lang: action.payload };
    case 'SET_PRODUCTS':
      return { ...state, products: action.payload };
    case 'SET_HISTORY':
      return { ...state, history: action.payload };
    case 'SET_CUSTOMERS':
      return { ...state, customers: action.payload };
    case 'SET_DEBTS':
      return { ...state, debts: action.payload };
    default:
      return state;
  }
}

const initialState: State = {
  products: [],
  history: [],
  customers: [],
  debts: [],
  lang: 'en',
  loading: true,
};

// ── Context ───────────────────────────────────────────────────────────────────

interface InventoryContextValue extends State {
  // Products
  upsertProduct: (p: Product) => Promise<void>;
  deleteProduct: (barcode: string) => Promise<void>;
  importProducts: (products: Product[]) => Promise<void>;

  // Transactions
  /** Simple sale — customer pays in full */
  commitSale: (
    items: TransactionItem[],
    note?: string
  ) => Promise<void>;

  /** Sale where customer pays only part — creates a debt record */
  addSaleWithDebt: (
    items: TransactionItem[],
    amountPaid: number,
    customer: { id?: string; name: string; phone?: string },
    note?: string
  ) => Promise<void>;

  /** Record a full or partial payment on an existing debt */
  recordDebtPayment: (
    debtId: string,
    amount: number,
    note?: string
  ) => Promise<void>;

  /** Delete a SALE bill from history and add stock back */
  refundBill: (historyEntryId: string, note?: string) => Promise<void>;

  /** Simple stock addition (purchase) */
  commitPurchase: (
    items: TransactionItem[],
    note?: string
  ) => Promise<void>;

  // Customers
  upsertCustomer: (c: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  // Export
  exportCSV: (dataType: 'products' | 'history' | 'debts') => Promise<void>;

  // Lang
  setLang: (l: 'en' | 'ar') => Promise<void>;
  t: (key: string, ...args: any[]) => string;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

// ── i18n (minimal — expand as needed) ────────────────────────────────────────

const translations: Record<string, Record<string, string>> = {
  en: {
    exportSuccess: 'File saved successfully.',
    exportError: 'Export failed.',
    debtNotFound: 'Debt record not found.',
    billNotFound: 'Bill not found.',
    billAlreadyRefunded: 'This bill was already refunded.',
    refundSuccess: 'Bill refunded. Stock restored.',
  },
  ar: {
    exportSuccess: 'تم حفظ الملف بنجاح.',
    exportError: 'فشل التصدير.',
    debtNotFound: 'سجل الدين غير موجود.',
    billNotFound: 'الفاتورة غير موجودة.',
    billAlreadyRefunded: 'تم استرداد هذه الفاتورة بالفعل.',
    refundSuccess: 'تم استرداد الفاتورة. تم استعادة المخزون.',
  },
};

// ── Provider ──────────────────────────────────────────────────────────────────

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Load from storage ──
  useEffect(() => {
    (async () => {
      try {
        const [rawProducts, rawHistory, rawLang, rawCustomers, rawDebts] =
          await Promise.all([
            AsyncStorage.getItem(KEYS.products),
            AsyncStorage.getItem(KEYS.history),
            AsyncStorage.getItem(KEYS.lang),
            AsyncStorage.getItem(KEYS.customers),
            AsyncStorage.getItem(KEYS.debts),
          ]);
        dispatch({
          type: 'LOAD',
          payload: {
            products: rawProducts ? JSON.parse(rawProducts) : [],
            history: rawHistory ? JSON.parse(rawHistory) : [],
            lang: (rawLang as 'en' | 'ar') ?? 'en',
            customers: rawCustomers ? JSON.parse(rawCustomers) : [],
            debts: rawDebts ? JSON.parse(rawDebts) : [],
          },
        });
      } catch (e) {
        dispatch({ type: 'LOAD', payload: {} });
      }
    })();
  }, []);

  // ── Helpers ──
  const t = useCallback(
    (key: string, ...args: any[]) => {
      const str = translations[state.lang]?.[key] ?? key;
      return args.reduce(
        (acc, arg, i) => acc.replace(`{${i}}`, String(arg)),
        str
      );
    },
    [state.lang]
  );

  const saveProducts = useCallback(async (products: Product[]) => {
    await AsyncStorage.setItem(KEYS.products, JSON.stringify(products));
    dispatch({ type: 'SET_PRODUCTS', payload: products });
  }, []);

  const saveHistory = useCallback(async (history: HistoryEntry[]) => {
    await AsyncStorage.setItem(KEYS.history, JSON.stringify(history));
    dispatch({ type: 'SET_HISTORY', payload: history });
  }, []);

  const saveCustomers = useCallback(async (customers: Customer[]) => {
    await AsyncStorage.setItem(KEYS.customers, JSON.stringify(customers));
    dispatch({ type: 'SET_CUSTOMERS', payload: customers });
  }, []);

  const saveDebts = useCallback(async (debts: DebtRecord[]) => {
    await AsyncStorage.setItem(KEYS.debts, JSON.stringify(debts));
    dispatch({ type: 'SET_DEBTS', payload: debts });
  }, []);

  const newId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // ── Product CRUD ──
  const upsertProduct = useCallback(
    async (p: Product) => {
      const updated = state.products.filter((x) => x.barcode !== p.barcode);
      await saveProducts([...updated, p]);
    },
    [state.products, saveProducts]
  );

  const deleteProduct = useCallback(
    async (barcode: string) => {
      await saveProducts(state.products.filter((p) => p.barcode !== barcode));
    },
    [state.products, saveProducts]
  );

  const importProducts = useCallback(
    async (incoming: Product[]) => {
      const map = new Map(state.products.map((p) => [p.barcode, p]));
      incoming.forEach((p) => map.set(p.barcode, p));
      await saveProducts(Array.from(map.values()));
    },
    [state.products, saveProducts]
  );

  // ── Commit simple sale (paid in full) ──
  const commitSale = useCallback(
    async (items: TransactionItem[], note?: string) => {
      const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const entry: HistoryEntry = {
        id: newId(),
        type: 'SALE',
        timestamp: Date.now(),
        items,
        totalAmount: total,
        amountPaid: total,
        amountOwed: 0,
        note,
      };

      // Deduct stock
      const updatedProducts = state.products.map((p) => {
        const sold = items.find((i) => i.barcode === p.barcode);
        if (!sold) return p;
        return { ...p, stock: p.stock - sold.quantity };
      });

      await Promise.all([
        saveProducts(updatedProducts),
        saveHistory([entry, ...state.history]),
      ]);
    },
    [state.products, state.history, saveProducts, saveHistory]
  );

  // ── Sale with partial payment → creates debt ──
  const addSaleWithDebt = useCallback(
    async (
      items: TransactionItem[],
      amountPaid: number,
      customer: { id?: string; name: string; phone?: string },
      note?: string
    ) => {
      const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const owed = total - amountPaid;

      // Ensure customer exists
      let customerId = customer.id ?? newId();
      const existingCustomer = state.customers.find(
        (c) => c.id === customerId || c.name === customer.name
      );
      if (existingCustomer) {
        customerId = existingCustomer.id;
      }
      const updatedCustomer: Customer = {
        id: customerId,
        name: customer.name,
        phone: customer.phone ?? existingCustomer?.phone,
        totalDebt: (existingCustomer?.totalDebt ?? 0) + owed,
      };
      const updatedCustomers = [
        ...state.customers.filter((c) => c.id !== customerId),
        updatedCustomer,
      ];

      const saleEntryId = newId();
      const debtId = newId();

      const saleEntry: HistoryEntry = {
        id: saleEntryId,
        type: owed > 0 ? 'DEBT_CREATED' : 'SALE',
        timestamp: Date.now(),
        items,
        totalAmount: total,
        amountPaid,
        amountOwed: owed,
        customerId,
        customerName: customer.name,
        note,
      };

      const debt: DebtRecord = {
        id: debtId,
        customerId,
        customerName: customer.name,
        originalAmount: total,
        paidAmount: amountPaid,
        remainingAmount: owed,
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
        settled: owed === 0,
        relatedHistoryEntryId: saleEntryId,
        payments:
          amountPaid > 0
            ? [{ amount: amountPaid, paidAt: Date.now(), note: 'Initial payment' }]
            : [],
      };

      // Deduct stock
      const updatedProducts = state.products.map((p) => {
        const sold = items.find((i) => i.barcode === p.barcode);
        if (!sold) return p;
        return { ...p, stock: p.stock - sold.quantity };
      });

      await Promise.all([
        saveProducts(updatedProducts),
        saveHistory([saleEntry, ...state.history]),
        saveCustomers(updatedCustomers),
        saveDebts([...state.debts, debt]),
      ]);
    },
    [state, saveProducts, saveHistory, saveCustomers, saveDebts]
  );

  // ── Record a debt payment ──
  const recordDebtPayment = useCallback(
    async (debtId: string, amount: number, note?: string) => {
      const debt = state.debts.find((d) => d.id === debtId);
      if (!debt) throw new Error('Debt not found');

      const newPaid = debt.paidAmount + amount;
      const newRemaining = Math.max(0, debt.remainingAmount - amount);
      const settled = newRemaining === 0;

      const updatedDebt: DebtRecord = {
        ...debt,
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        settled,
        lastUpdatedAt: Date.now(),
        payments: [...debt.payments, { amount, paidAt: Date.now(), note }],
      };

      const paymentEntry: HistoryEntry = {
        id: newId(),
        type: 'DEBT_PAYMENT',
        timestamp: Date.now(),
        customerId: debt.customerId,
        customerName: debt.customerName,
        paymentAmount: amount,
        debtId,
        note: note ?? (settled ? 'Debt settled in full' : 'Partial payment'),
      };

      // Update customer total debt
      const updatedCustomers = state.customers.map((c) => {
        if (c.id !== debt.customerId) return c;
        return { ...c, totalDebt: Math.max(0, c.totalDebt - amount) };
      });

      await Promise.all([
        saveDebts(
          state.debts.map((d) => (d.id === debtId ? updatedDebt : d))
        ),
        saveHistory([paymentEntry, ...state.history]),
        saveCustomers(updatedCustomers),
      ]);
    },
    [state, saveDebts, saveHistory, saveCustomers]
  );

  // ── Refund a bill (delete + restore stock) ──
  const refundBill = useCallback(
    async (historyEntryId: string, note?: string) => {
      const entry = state.history.find((h) => h.id === historyEntryId);
      if (!entry) throw new Error('Bill not found');
      if (entry.type === 'REFUND') throw new Error('Already refunded');

      const refundEntry: HistoryEntry = {
        id: newId(),
        type: 'REFUND',
        timestamp: Date.now(),
        refundedEntryId: historyEntryId,
        items: entry.items,
        totalAmount: entry.totalAmount,
        customerId: entry.customerId,
        customerName: entry.customerName,
        note: note ?? `Refund of bill ${historyEntryId}`,
      };

      // Restore stock
      const updatedProducts = state.products.map((p) => {
        const refunded = entry.items?.find((i) => i.barcode === p.barcode);
        if (!refunded) return p;
        return { ...p, stock: p.stock + refunded.quantity };
      });

      // Mark original entry as refunded in history (add a flag)
      const updatedHistory = state.history.map((h) =>
        h.id === historyEntryId
          ? { ...h, note: `[REFUNDED] ${h.note ?? ''}`.trim() }
          : h
      );

      // If this was a debt, mark it settled (stock is back, debt forgiven)
      let updatedDebts = state.debts;
      if (entry.customerId) {
        updatedDebts = state.debts.map((d) => {
          if (d.relatedHistoryEntryId !== historyEntryId) return d;
          return { ...d, settled: true, remainingAmount: 0, lastUpdatedAt: Date.now() };
        });
        // Remove debt from customer total
        const debtRecord = state.debts.find(
          (d) => d.relatedHistoryEntryId === historyEntryId
        );
        if (debtRecord) {
          const customers = state.customers.map((c) => {
            if (c.id !== entry.customerId) return c;
            return {
              ...c,
              totalDebt: Math.max(0, c.totalDebt - debtRecord.remainingAmount),
            };
          });
          await saveCustomers(customers);
        }
      }

      await Promise.all([
        saveProducts(updatedProducts),
        saveHistory([refundEntry, ...updatedHistory]),
        saveDebts(updatedDebts),
      ]);
    },
    [state, saveProducts, saveHistory, saveDebts, saveCustomers]
  );

  // ── Simple purchase (add stock) ──
  const commitPurchase = useCallback(
    async (items: TransactionItem[], note?: string) => {
      const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      const entry: HistoryEntry = {
        id: newId(),
        type: 'PURCHASE',
        timestamp: Date.now(),
        items,
        totalAmount: total,
        note,
      };

      const updatedProducts = state.products.map((p) => {
        const purchased = items.find((i) => i.barcode === p.barcode);
        if (!purchased) return p;
        return { ...p, stock: p.stock + purchased.quantity };
      });

      await Promise.all([
        saveProducts(updatedProducts),
        saveHistory([entry, ...state.history]),
      ]);
    },
    [state.products, state.history, saveProducts, saveHistory]
  );

  // ── Customer CRUD ──
  const upsertCustomer = useCallback(
    async (c: Customer) => {
      const updated = state.customers.filter((x) => x.id !== c.id);
      await saveCustomers([...updated, c]);
    },
    [state.customers, saveCustomers]
  );

  const deleteCustomer = useCallback(
    async (id: string) => {
      await saveCustomers(state.customers.filter((c) => c.id !== id));
    },
    [state.customers, saveCustomers]
  );

  // ── CSV Export ──
  const exportCSV = useCallback(
    async (dataType: 'products' | 'history' | 'debts') => {
      let csv = '';
      let filename = '';

      if (dataType === 'products') {
        filename = `products_${Date.now()}.csv`;
        csv = [
          'Barcode,Name,Arabic Name,Stock,Min Stock,Unit,Price',
          ...state.products.map(
            (p) =>
              `"${p.barcode}","${p.name}","${p.arabicName ?? ''}",${p.stock},${p.minStock},"${p.unit ?? ''}",${p.price}`
          ),
        ].join('\n');
      } else if (dataType === 'history') {
        filename = `history_${Date.now()}.csv`;
        csv = [
          'ID,Type,Date,Customer,Items,Total Amount,Amount Paid,Amount Owed,Note',
          ...state.history.map((h) => {
            const items =
              h.items
                ?.map((i) => `${i.name} x${i.quantity}`)
                .join(' | ') ?? '';
            const date = new Date(h.timestamp).toLocaleString();
            return `"${h.id}","${h.type}","${date}","${h.customerName ?? ''}","${items}",${h.totalAmount ?? ''},${h.amountPaid ?? ''},${h.amountOwed ?? ''},"${h.note ?? ''}"`;
          }),
        ].join('\n');
      } else {
        filename = `debts_${Date.now()}.csv`;
        csv = [
          'ID,Customer,Original Amount,Paid Amount,Remaining,Settled,Created,Last Updated',
          ...state.debts.map(
            (d) =>
              `"${d.id}","${d.customerName}",${d.originalAmount},${d.paidAmount},${d.remainingAmount},${d.settled},"${new Date(d.createdAt).toLocaleString()}","${new Date(d.lastUpdatedAt).toLocaleString()}"`
          ),
        ].join('\n');
      }

      if (Platform.OS === 'web') {
        // Web: trigger download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      // Native: write to cache and share
      const path = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(path, {
        mimeType: 'text/csv',
        dialogTitle: `Export ${dataType}`,
        UTI: 'public.comma-separated-values-text',
      });
    },
    [state]
  );

  // ── Language ──
  const setLang = useCallback(async (l: 'en' | 'ar') => {
    await AsyncStorage.setItem(KEYS.lang, l);
    dispatch({ type: 'SET_LANG', payload: l });
  }, []);

  const value: InventoryContextValue = {
    ...state,
    upsertProduct,
    deleteProduct,
    importProducts,
    commitSale,
    addSaleWithDebt,
    recordDebtPayment,
    refundBill,
    commitPurchase,
    upsertCustomer,
    deleteCustomer,
    exportCSV,
    setLang,
    t,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used inside InventoryProvider');
  return ctx;
}

// Backward-compatible alias
export const useT = useInventory;
