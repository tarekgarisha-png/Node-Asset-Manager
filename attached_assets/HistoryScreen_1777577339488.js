// screens/HistoryScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { t, isRTL } from '../utils/i18n';
import { getHistory, clearHistory, buildHistoryCSV } from '../utils/database';

export default function HistoryScreen() {
  const [history, setHistory]   = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('ALL');
  const [loading, setLoading]   = useState(true);
  const rtl = isRTL();

  const load = useCallback(async () => {
    setLoading(true);
    try { setHistory(await getHistory(600)); }
    catch { Alert.alert('Error', t('dbError')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let list = filter === 'ALL' ? history : history.filter(h => h.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q) || h.barcode.includes(q));
    }
    setFiltered(list);
  }, [history, search, filter]);

  const exportCSV = async () => {
    try {
      const csv  = buildHistoryCSV(filtered.length ? filtered : history);
      const path = FileSystem.documentDirectory + `history_${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { Alert.alert('', t('noSharing')); return; }
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: t('exportCSV') });
    } catch { Alert.alert(t('exportFailed'), ''); }
  };

  const handleClear = () => {
    Alert.alert(t('clearHistory'), t('clearHistoryMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('deleteAll'), style: 'destructive', onPress: async () => { await clearHistory(); load(); } }
    ]);
  };

  const fmtDate = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('ar-EG')}  ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const totalSold     = history.filter(h => h.type === 'SALE').reduce((s, h) => s + h.qty, 0);
  const totalPurchased= history.filter(h => h.type === 'PURCHASE').reduce((s, h) => s + h.qty, 0);

  return (
    <View style={styles.container}>

      {/* Summary */}
      <View style={[styles.summary, rtl && styles.rowReverse]}>
        <SumItem num={history.length} label={t('transactions')} />
        <View style={styles.divider} />
        <SumItem num={totalSold}      label={t('sold')}         color="#e74c3c" />
        <View style={styles.divider} />
        <SumItem num={totalPurchased} label={t('purchased')}    color="#22c55e" />
        <TouchableOpacity style={styles.csvBtn} onPress={exportCSV}>
          <Ionicons name="download-outline" size={15} color="white" />
          <Text style={styles.csvText}>{t('exportCSV')}</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabs, rtl && styles.rowReverse]}>
        {[
          { key: 'ALL', label: t('all') },
          { key: 'SALE', label: t('sale') },
          { key: 'PURCHASE', label: t('purchase') }
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, filter === tab.key && styles.tabOn]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.tabText, filter === tab.key && styles.tabTextOn]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, rtl && styles.rowReverse]}>
        <Ionicons name="search-outline" size={16} color="#94a3b8" />
        <TextInput
          style={[styles.searchInput, rtl && styles.rtlInput]}
          placeholder={t('searchHistory')}
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#cbd5e1"
          textAlign={rtl ? 'right' : 'left'}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#cbd5e1" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1e293b" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={48} color="#e2e8f0" />
          <Text style={[styles.emptyText, rtl && styles.rtlText]}>{t('noHistory')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => {
            const isSale = item.type === 'SALE';
            return (
              <View style={[styles.row, rtl && styles.rowReverse]}>
                <View style={[styles.typeIcon, { backgroundColor: isSale ? '#fff1f2' : '#f0fdf4' }]}>
                  <Ionicons
                    name={isSale ? 'arrow-up-outline' : 'arrow-down-outline'}
                    size={18}
                    color={isSale ? '#e74c3c' : '#22c55e'}
                  />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, rtl && styles.rtlText]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.rowDate, rtl && styles.rtlText]}>{fmtDate(item.date)}</Text>
                  <Text style={[styles.rowCode, rtl && styles.rtlText]}>{item.barcode}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowQty, { color: isSale ? '#e74c3c' : '#22c55e' }]}>
                    {isSale ? '−' : '+'}{item.qty}
                  </Text>
                  <Text style={styles.rowType}>{item.type}</Text>
                </View>
              </View>
            );
          }}
        />
      )}

      {history.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Ionicons name="trash-outline" size={14} color="#e74c3c" />
          <Text style={[styles.clearText, rtl && styles.rtlText]}>{t('clearHistory')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function SumItem({ num, label, color = '#1e293b' }) {
  return (
    <View style={styles.sumItem}>
      <Text style={[styles.sumNum, { color }]}>{num}</Text>
      <Text style={styles.sumLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f0f4f8' },
  rtlText:    { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput:   { textAlign: 'right' },
  rowReverse: { flexDirection: 'row-reverse' },

  summary:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 13, borderBottomWidth: 1, borderColor: '#e2e8f0', gap: 4 },
  sumItem:  { flex: 1, alignItems: 'center' },
  sumNum:   { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  sumLabel: { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  divider:  { width: 1, height: 28, backgroundColor: '#e2e8f0' },
  csvBtn:   { backgroundColor: '#1e293b', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 8 },
  csvText:  { color: 'white', fontWeight: '700', fontSize: 12 },

  tabs:        { flexDirection: 'row', backgroundColor: 'white', paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  tab:         { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f1f5f9' },
  tabOn:       { backgroundColor: '#1e293b' },
  tabText:     { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  tabTextOn:   { color: 'white' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', margin: 12, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput:{ flex: 1, paddingVertical: 10, fontSize: 14, color: '#334155' },

  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { color: '#94a3b8', fontSize: 15 },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: 12, padding: 12, marginBottom: 8, gap: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 },
  },
  typeIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  rowInfo:  { flex: 1 },
  rowName:  { fontWeight: '700', fontSize: 13, color: '#1e293b' },
  rowDate:  { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  rowCode:  { fontSize: 10, color: '#cbd5e1' },
  rowRight: { alignItems: 'flex-end' },
  rowQty:   { fontSize: 18, fontWeight: '800' },
  rowType:  { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' },

  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, margin: 12, borderRadius: 10, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff1f2' },
  clearText:{ color: '#e74c3c', fontWeight: '600', fontSize: 13 },
});
