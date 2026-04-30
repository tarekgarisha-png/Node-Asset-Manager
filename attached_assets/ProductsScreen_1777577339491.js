// screens/ProductsScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t, isRTL } from '../utils/i18n';
import { getAllProducts, saveProduct, deleteProduct } from '../utils/database';

const EMPTY = { barcode: '', name: '', nameAr: '', stock: '', minStock: '5', unit: 'pcs', price: '' };

export default function ProductsScreen({ navigation, route }) {
  const [products, setProducts]   = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [showLow, setShowLow]     = useState(false);
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState(EMPTY);
  const [editing, setEditing]     = useState(false);

  const rtl = isRTL();

  const load = useCallback(async () => {
    setLoading(true);
    try { setProducts(await getAllProducts()); }
    catch { Alert.alert('Error', t('dbError')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      load();
      if (route.params?.prefillBarcode) {
        setForm({ ...EMPTY, barcode: route.params.prefillBarcode });
        setEditing(false);
        setModal(true);
        navigation.setParams({ prefillBarcode: undefined });
      }
      if (route.params?.filterLow) {
        setShowLow(true);
        navigation.setParams({ filterLow: undefined });
      }
    });
    return unsub;
  }, [navigation, route.params, load]);

  useEffect(() => {
    let list = showLow ? products.filter(p => p.stock <= p.minStock) : products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nameAr && p.nameAr.includes(q)) ||
        p.barcode.includes(q)
      );
    }
    setFiltered(list);
  }, [products, search, showLow]);

  const openAdd = () => { setForm(EMPTY); setEditing(false); setModal(true); };
  const openEdit = (p) => {
    setForm({
      barcode: p.barcode, name: p.name, nameAr: p.nameAr || '',
      stock: String(p.stock), minStock: String(p.minStock),
      unit: p.unit || 'pcs', price: String(p.price || ''),
    });
    setEditing(true);
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.barcode.trim()) { Alert.alert('', t('barcodeRequired')); return; }
    if (!form.name.trim())    { Alert.alert('', t('nameRequired'));    return; }
    try {
      await saveProduct({
        ...form,
        stock:    parseInt(form.stock)    || 0,
        minStock: parseInt(form.minStock) || 5,
        price:    parseFloat(form.price)  || 0,
      });
      setModal(false);
      load();
    } catch { Alert.alert('Error', t('dbError')); }
  };

  const handleDelete = (p) => {
    Alert.alert(t('deleteProduct'), t('deleteProductMsg', p.name), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => { try { await deleteProduct(p.barcode); load(); } catch {} }
      }
    ]);
  };

  const dotColor = (p) => {
    if (p.stock === 0)         return '#e74c3c';
    if (p.stock <= p.minStock) return '#f39c12';
    return '#22c55e';
  };

  return (
    <View style={styles.container}>

      {/* Search + filter + add */}
      <View style={[styles.topRow, rtl && styles.rowReverse]}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={17} color="#94a3b8" />
          <TextInput
            style={[styles.searchInput, rtl && styles.rtlInput]}
            placeholder={t('searchProducts')}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#cbd5e1"
            textAlign={rtl ? 'right' : 'left'}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={17} color="#cbd5e1" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, showLow && styles.iconBtnActive]}
          onPress={() => setShowLow(v => !v)}
        >
          <Ionicons name="warning-outline" size={18} color={showLow ? 'white' : '#f39c12'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="white" />
        </TouchableOpacity>
      </View>

      {showLow && (
        <View style={[styles.filterBanner, rtl && styles.rowReverse]}>
          <Ionicons name="warning" size={14} color="#d97706" />
          <Text style={[styles.filterText, rtl && styles.rtlText]}>{t('lowOnly')}</Text>
          <TouchableOpacity onPress={() => setShowLow(false)}>
            <Text style={styles.filterClear}>{t('showAll')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color="#1e293b" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={50} color="#e2e8f0" />
          <Text style={[styles.emptyText, rtl && styles.rtlText]}>
            {showLow ? t('noLowStock') : t('noProducts')}
          </Text>
          {!showLow && (
            <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
              <Text style={styles.emptyBtnText}>{t('addFirst')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.barcode}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <View style={[styles.card, rtl && styles.rowReverse]}>
              <View style={[styles.dotWrap]}>
                <View style={[styles.dot, { backgroundColor: dotColor(item) }]} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.cardName, rtl && styles.rtlText]} numberOfLines={1}>
                  {rtl && item.nameAr ? item.nameAr : item.name}
                </Text>
                {rtl && item.nameAr && (
                  <Text style={styles.cardNameSub} numberOfLines={1}>{item.name}</Text>
                )}
                <Text style={[styles.cardSub, rtl && styles.rtlText]}>
                  {item.barcode} · {item.unit}
                  {item.price > 0 ? ` · ${item.price.toFixed(2)}` : ''}
                </Text>
              </View>
              <View style={styles.stockBox}>
                <Text style={[styles.stockNum, { color: dotColor(item) }]}>{item.stock}</Text>
                <Text style={styles.stockMin}>{t('minLabel', item.minStock)}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
                  <Ionicons name="pencil-outline" size={16} color="#475569" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* ── Modal ── */}
      <Modal visible={modal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <View style={[styles.sheetHeader, rtl && styles.rowReverse]}>
              <Text style={[styles.sheetTitle, rtl && styles.rtlText]}>
                {editing ? t('editProduct') : t('addProduct')}
              </Text>
              <TouchableOpacity onPress={() => setModal(false)}>
                <Ionicons name="close" size={24} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={[styles.label, rtl && styles.rtlText]}>{t('barcode')}</Text>
              <TextInput
                style={[styles.input, editing && styles.inputDim, rtl && styles.rtlInput]}
                value={form.barcode}
                onChangeText={v => setForm(f => ({ ...f, barcode: v }))}
                editable={!editing}
                placeholder="123456789"
                textAlign={rtl ? 'right' : 'left'}
              />

              <Text style={[styles.label, rtl && styles.rtlText]}>{t('productName')} (EN)</Text>
              <TextInput
                style={[styles.input, rtl && styles.rtlInput]}
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="Product name in English"
                textAlign={rtl ? 'right' : 'left'}
              />

              <Text style={[styles.label, styles.rtlText]}>اسم المنتج (عربي)</Text>
              <TextInput
                style={[styles.input, styles.rtlInput]}
                value={form.nameAr}
                onChangeText={v => setForm(f => ({ ...f, nameAr: v }))}
                placeholder="اسم المنتج بالعربي"
                textAlign="right"
              />

              <View style={styles.grid2}>
                <View style={styles.half}>
                  <Text style={[styles.label, rtl && styles.rtlText]}>{t('currentStock')}</Text>
                  <TextInput
                    style={[styles.input, rtl && styles.rtlInput]}
                    value={form.stock} onChangeText={v => setForm(f => ({ ...f, stock: v }))}
                    keyboardType="numeric" placeholder="0"
                    textAlign={rtl ? 'right' : 'left'}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={[styles.label, rtl && styles.rtlText]}>{t('minStock')}</Text>
                  <TextInput
                    style={[styles.input, rtl && styles.rtlInput]}
                    value={form.minStock} onChangeText={v => setForm(f => ({ ...f, minStock: v }))}
                    keyboardType="numeric" placeholder="5"
                    textAlign={rtl ? 'right' : 'left'}
                  />
                </View>
              </View>

              <View style={styles.grid2}>
                <View style={styles.half}>
                  <Text style={[styles.label, rtl && styles.rtlText]}>{t('unit')}</Text>
                  <TextInput
                    style={[styles.input, rtl && styles.rtlInput]}
                    value={form.unit} onChangeText={v => setForm(f => ({ ...f, unit: v }))}
                    placeholder="pcs / علبة / كغ"
                    textAlign={rtl ? 'right' : 'left'}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={[styles.label, rtl && styles.rtlText]}>{t('price')}</Text>
                  <TextInput
                    style={[styles.input, rtl && styles.rtlInput]}
                    value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))}
                    keyboardType="numeric" placeholder="0.00"
                    textAlign={rtl ? 'right' : 'left'}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Ionicons name="checkmark-circle-outline" size={20} color="white" />
                <Text style={styles.saveBtnText}>
                  {editing ? t('updateProduct') : t('saveProduct')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f0f4f8' },
  rtlText:    { textAlign: 'right', writingDirection: 'rtl' },
  rtlInput:   { textAlign: 'right' },
  rowReverse: { flexDirection: 'row-reverse' },

  topRow:    { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'center' },
  searchWrap:{
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  searchInput:   { flex: 1, paddingVertical: 10, fontSize: 14, color: '#334155' },
  iconBtn:       { backgroundColor: 'white', borderWidth: 1, borderColor: '#f39c12', padding: 10, borderRadius: 10 },
  iconBtnActive: { backgroundColor: '#f39c12', borderColor: '#f39c12' },
  addBtn:        { backgroundColor: '#1e293b', padding: 10, borderRadius: 10 },

  filterBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fefce8', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#fde68a' },
  filterText:   { flex: 1, fontSize: 13, color: '#92400e' },
  filterClear:  { fontSize: 13, color: '#1e293b', fontWeight: '700' },

  empty:        { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 30 },
  emptyText:    { color: '#94a3b8', fontSize: 15, textAlign: 'center' },
  emptyBtn:     { backgroundColor: '#1e293b', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { color: 'white', fontWeight: '700' },

  card: {
    backgroundColor: 'white', borderRadius: 12, padding: 13,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 },
  },
  dotWrap:     { justifyContent: 'center', alignItems: 'center', width: 14 },
  dot:         { width: 9, height: 9, borderRadius: 5 },
  cardInfo:    { flex: 1 },
  cardName:    { fontWeight: '700', fontSize: 14, color: '#1e293b' },
  cardNameSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  cardSub:     { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  stockBox:    { alignItems: 'center', minWidth: 40 },
  stockNum:    { fontSize: 20, fontWeight: '800', lineHeight: 22 },
  stockMin:    { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' },
  actions:     { flexDirection: 'row', gap: 5 },
  editBtn:     { padding: 7, backgroundColor: '#f1f5f9', borderRadius: 8 },
  delBtn:      { padding: 7, backgroundColor: '#fff1f2', borderRadius: 8 },

  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: 'white', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, maxHeight: '92%' },
  sheetHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  label:      { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9,
    padding: 11, fontSize: 14, marginBottom: 13, color: '#334155', backgroundColor: '#f8fafc',
  },
  inputDim: { backgroundColor: '#f1f5f9', color: '#94a3b8' },
  grid2:    { flexDirection: 'row', gap: 10 },
  half:     { flex: 1 },
  saveBtn:  { backgroundColor: '#1e293b', padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 10 },
  saveBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
