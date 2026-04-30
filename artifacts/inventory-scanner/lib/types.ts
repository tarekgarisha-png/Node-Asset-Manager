export type Product = {
  barcode: string;
  name: string;
  nameAr: string;
  stock: number;
  minStock: number;
  unit: string;
  price: number;
};

export type TransactionType = "SALE" | "PURCHASE";

export type HistoryEntry = {
  id: string;
  barcode: string;
  name: string;
  type: TransactionType;
  qty: number;
  date: string;
};

export type ScanQueueItem = {
  barcode: string;
  name: string;
  qty: number;
  unit: string;
};

export type ScanMode = "SALE" | "PURCHASE";
