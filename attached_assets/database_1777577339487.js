// utils/database.js
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('inventory.db');

export function initDB() {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS products (
          barcode   TEXT PRIMARY KEY,
          name      TEXT NOT NULL,
          nameAr    TEXT DEFAULT '',
          stock     INTEGER DEFAULT 0,
          minStock  INTEGER DEFAULT 5,
          unit      TEXT DEFAULT 'pcs',
          price     REAL DEFAULT 0
        );`);
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS history (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          barcode TEXT,
          name    TEXT,
          type    TEXT,
          qty     INTEGER,
          date    TEXT
        );`);
    }, reject, resolve);
  });
}

// ── Products ──────────────────────────────────
export function getAllProducts() {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('SELECT * FROM products ORDER BY name ASC;', [],
        (_, { rows }) => resolve(rows._array),
        (_, err) => reject(err));
    });
  });
}

export function getProductByBarcode(barcode) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('SELECT * FROM products WHERE barcode = ?;', [barcode],
        (_, { rows }) => resolve(rows.length > 0 ? rows.item(0) : null),
        (_, err) => reject(err));
    });
  });
}

export function saveProduct({ barcode, name, nameAr, stock, minStock, unit, price }) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `INSERT OR REPLACE INTO products (barcode, name, nameAr, stock, minStock, unit, price)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [barcode, name, nameAr ?? '', stock ?? 0, minStock ?? 5, unit ?? 'pcs', price ?? 0],
        (_, r) => resolve(r), (_, e) => reject(e)
      );
    });
  });
}

export function deleteProduct(barcode) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM products WHERE barcode = ?;', [barcode],
        (_, r) => resolve(r), (_, e) => reject(e));
    });
  });
}

export function getLowStockProducts() {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        'SELECT * FROM products WHERE stock <= minStock ORDER BY stock ASC;', [],
        (_, { rows }) => resolve(rows._array),
        (_, err) => reject(err));
    });
  });
}

// ── Commit transaction queue ──────────────────
export function commitScanQueue(queue, mode) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      queue.forEach(item => {
        const delta = mode === 'SALE' ? -item.qty : item.qty;
        tx.executeSql('UPDATE products SET stock = stock + ? WHERE barcode = ?;', [delta, item.barcode]);
        tx.executeSql(
          'INSERT INTO history (barcode, name, type, qty, date) VALUES (?, ?, ?, ?, ?);',
          [item.barcode, item.name, mode, item.qty, new Date().toISOString()]
        );
      });
    }, reject, resolve);
  });
}

// ── History ───────────────────────────────────
export function getHistory(limit = 500) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('SELECT * FROM history ORDER BY id DESC LIMIT ?;', [limit],
        (_, { rows }) => resolve(rows._array),
        (_, err) => reject(err));
    });
  });
}

export function clearHistory() {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql('DELETE FROM history;', [], (_, r) => resolve(r), (_, e) => reject(e));
    });
  });
}

// ── CSV builders ──────────────────────────────
export function buildProductsCSV(products) {
  const header = 'Barcode,Name,Arabic Name,Stock,Min Stock,Unit,Price\n';
  const rows = products.map(p =>
    `"${p.barcode}","${p.name}","${p.nameAr || ''}",${p.stock},${p.minStock},"${p.unit}",${p.price}`
  ).join('\n');
  return header + rows;
}

export function buildHistoryCSV(history) {
  const header = 'ID,Barcode,Name,Type,Qty,Date\n';
  const rows = history.map(h =>
    `${h.id},"${h.barcode}","${h.name}","${h.type}",${h.qty},"${h.date}"`
  ).join('\n');
  return header + rows;
}
