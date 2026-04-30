import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  HistoryEntry,
  Product,
  ScanQueueItem,
  TransactionType,
} from "./types";

const PRODUCTS_KEY = "inventory:products:v1";
const HISTORY_KEY = "inventory:history:v1";

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

export async function getAllProducts(): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(PRODUCTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Product[];
    return parsed.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function writeProducts(products: Product[]): Promise<void> {
  await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

export async function getProductByBarcode(
  barcode: string,
): Promise<Product | null> {
  const products = await getAllProducts();
  return products.find((p) => p.barcode === barcode) ?? null;
}

export async function saveProduct(product: Product): Promise<void> {
  const products = await getAllProducts();
  const idx = products.findIndex((p) => p.barcode === product.barcode);
  if (idx >= 0) {
    products[idx] = product;
  } else {
    products.push(product);
  }
  await writeProducts(products);
}

export async function deleteProduct(barcode: string): Promise<void> {
  const products = await getAllProducts();
  const filtered = products.filter((p) => p.barcode !== barcode);
  await writeProducts(filtered);
}

export async function getLowStockProducts(): Promise<Product[]> {
  const products = await getAllProducts();
  return products
    .filter((p) => p.stock <= p.minStock)
    .sort((a, b) => a.stock - b.stock);
}

export async function commitScanQueue(
  queue: ScanQueueItem[],
  mode: TransactionType,
): Promise<void> {
  const products = await getAllProducts();
  const now = new Date().toISOString();
  const history = await getHistory(10000);

  for (const item of queue) {
    const delta = mode === "SALE" ? -item.qty : item.qty;
    const idx = products.findIndex((p) => p.barcode === item.barcode);
    if (idx >= 0) {
      const updated = { ...products[idx]! };
      updated.stock = Math.max(0, updated.stock + delta);
      products[idx] = updated;
    }
    history.unshift({
      id: genId(),
      barcode: item.barcode,
      name: item.name,
      type: mode,
      qty: item.qty,
      date: now,
    });
  }

  await writeProducts(products);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export async function getHistory(limit = 500): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return parsed.slice(0, limit);
  } catch {
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export function buildProductsCSV(products: Product[]): string {
  const header = "Barcode,Name,Arabic Name,Stock,Min Stock,Unit,Price\n";
  const rows = products
    .map(
      (p) =>
        `${csvEscape(p.barcode)},${csvEscape(p.name)},${csvEscape(
          p.nameAr,
        )},${p.stock},${p.minStock},${csvEscape(p.unit)},${p.price}`,
    )
    .join("\n");
  return header + rows;
}

export function buildHistoryCSV(history: HistoryEntry[]): string {
  const header = "ID,Barcode,Name,Type,Qty,Date\n";
  const rows = history
    .map(
      (h) =>
        `${csvEscape(h.id)},${csvEscape(h.barcode)},${csvEscape(h.name)},${csvEscape(h.type)},${h.qty},${csvEscape(h.date)}`,
    )
    .join("\n");
  return header + rows;
}
