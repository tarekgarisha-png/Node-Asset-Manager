import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isRTLFor, tFor, type Lang } from "@/lib/i18n";
import {
  clearHistory as clearHistoryStorage,
  commitScanQueue,
  deleteProduct as deleteProductStorage,
  getAllProducts,
  getHistory,
  saveProduct as saveProductStorage,
} from "@/lib/storage";
import type {
  HistoryEntry,
  Product,
  ScanQueueItem,
  TransactionType,
} from "@/lib/types";

type InventoryContextValue = {
  products: Product[];
  history: HistoryEntry[];
  loading: boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  refresh: () => Promise<void>;
  saveProduct: (p: Product) => Promise<void>;
  deleteProduct: (barcode: string) => Promise<void>;
  commitQueue: (queue: ScanQueueItem[], mode: TransactionType) => Promise<void>;
  clearAllHistory: () => Promise<void>;
};

const InventoryContext = createContext<InventoryContextValue | null>(null);

const LANG_KEY = "inventory:lang:v1";

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lang, setLangState] = useState<Lang>("en");

  const refresh = useCallback(async () => {
    const [p, h] = await Promise.all([getAllProducts(), getHistory(600)]);
    setProducts(p);
    setHistory(h);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const storedLang = await AsyncStorage.getItem(LANG_KEY);
        if (storedLang === "ar" || storedLang === "en") {
          setLangState(storedLang);
        }
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  }, []);

  const saveProduct = useCallback(
    async (p: Product) => {
      await saveProductStorage(p);
      await refresh();
    },
    [refresh],
  );

  const deleteProduct = useCallback(
    async (barcode: string) => {
      await deleteProductStorage(barcode);
      await refresh();
    },
    [refresh],
  );

  const commitQueue = useCallback(
    async (queue: ScanQueueItem[], mode: TransactionType) => {
      await commitScanQueue(queue, mode);
      await refresh();
    },
    [refresh],
  );

  const clearAllHistory = useCallback(async () => {
    await clearHistoryStorage();
    await refresh();
  }, [refresh]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      products,
      history,
      loading,
      lang,
      setLang,
      refresh,
      saveProduct,
      deleteProduct,
      commitQueue,
      clearAllHistory,
    }),
    [
      products,
      history,
      loading,
      lang,
      setLang,
      refresh,
      saveProduct,
      deleteProduct,
      commitQueue,
      clearAllHistory,
    ],
  );

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within InventoryProvider");
  }
  return ctx;
}

export function useT() {
  const { lang } = useInventory();
  return {
    t: (key: string, ...args: any[]) => tFor(lang, key, ...args),
    rtl: isRTLFor(lang),
    lang,
  };
}
