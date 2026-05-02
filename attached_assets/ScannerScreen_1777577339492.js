// screens/ScannerScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Alert, Vibration, SafeAreaView, I18nManager
} from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { Ionicons } from '@expo/vector-icons';
import { t, isRTL } from '../utils/i18n';
import { getProductByBarcode, commitScanQueue, getLowStockProducts } from '../utils/database';
const { triggerScanFeedback, triggerErrorFeedback } = useScanFeedback();
export default function ScannerScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned]             = useState(false);
  const [mode, setMode]                   = useState('SALE');
  const [scanQueue, setScanQueue]         = useState([]);
  const [cameraActive, setCameraActive]   = useState(true);
  const [lowStockCount, setLowStockCount] = useState(0);

  const rtl = isRTL();

  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      const low = await getLowStockProducts();
      setLowStockCount(low.length);
    });
    return unsub;
  }, [navigation]);

  const handleBarCodeScanned = useCallback(async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(80);

    try {
      const product = await getProductByBarcode(data);

      if (!product) {
        Alert.alert(
          t('unknownBarcode'),
          `${t('unknownMsg')}\n${data}`,
          [
            { text: t('ignore'), style: 'cancel', onPress: () => setTimeout(() => setScanned(false), 600) },
            {
              text: t('register'),
              onPress: () => {
                setScanned(false);
                navigation.navigate('Products', { screen: 'ProductsList', params: { prefillBarcode: data } });
              }
            }
          ]
        );
        return;
      }

      // Display name: prefer Arabic name if RTL
      const displayName = rtl && product.nameAr ? product.nameAr : product.name;

      setScanQueue(prev => {
        const existing = prev.find(i => i.barcode === data);
        if (existing) {
          return prev.map(i => i.barcode === data ? { ...i, qty: i.qty + 1 } : i);
        }
        return [...prev, { barcode: data, name: displayName, qty: 1, unit: product.unit }];
      });
    } catch {
      Alert.alert('Error', t('dbError'));
    }

    setTimeout(() => setScanned(false), 1000);
  }, [scanned, navigation, rtl]);

  const removeItem = (barcode) => setScanQueue(prev => prev.filter(i => i.barcode !== barcode));

  const adjustQty = (barcode, delta) => {
    setScanQueue(prev =>
      prev.map(i => i.barcode === barcode ? { ...i, qty: i.qty + delta } : i)
          .filter(i => i.qty > 0)
    );
  };

  const totalItems = scanQueue.reduce((s, i) => s + i.qty, 0);

  const confirmTransaction = async () => {
    if (!scanQueue.length) return;
    Alert.alert(
      t('confirmTitle'),
      t('confirmMsg', totalItems, scanQueue.length),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: mode === 'SALE' ? t('confirmSale') : t('confirmPurchase'),
          onPress: async () => {
            try {
              await commitScanQueue(scanQueue, mode);
              const low = await getLowStockProducts();
              setLowStockCount(low.length);
              setScanQueue([]);
              Alert.alert('✓', t('savedSuccess'));
            } catch {
              Alert.alert('Error', t('dbError'));
            }
          }
        }
      ]
    );
  };

  // Permission screens
  if (hasPermission === null) return (
    <View style={styles.centered}>
      <Ionicons name="camera-outline" size={52} color="#94a3b8" />
      <Text style={[styles.permText, rtl && styles.rtlText]}>{t('cameraRequest')}</Text>
    </View>
  );
  if (hasPermission === false) return (
    <View style={styles.centered}>
      <Ionicons name="camera-off-outline" size={52} color="#e74c3c" />
      <Text style={[styles.permText, rtl && styles.rtlText]}>{t('cameraDenied')}</Text>
      <Text style={[styles.permSub, rtl && styles.rtlText]}>{t('cameraHint')}</Text>
    </View>
  );

  const modeColor = mode === 'SALE' ? '#e74c3c' : '#27ae60';

  return (
    <SafeAreaView style={styles.container}>

      {/* Camera */}
      <View style={styles.scannerBox}>
        {cameraActive && (
          <BarCodeScanner
            onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        {/* Reticle */}
        <View style={styles.reticle} />
        {/* Corner accents */}
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />

        {/* Top bar */}
        <View style={[styles.topBar, rtl && styles.rowReverse]}>
          <Text style={styles.modeLabel}>
            {mode === 'SALE' ? t('saleMode') : t('purchaseMode')}
          </Text>
          <TouchableOpacity
            style={[styles.modeBtn, { backgroundColor: modeColor }]}
            onPress={() => setMode(m => m === 'SALE' ? 'PURCHASE' : 'SALE')}
          >
            <Ionicons name="swap-horizontal" size={15} color="white" />
            <Text style={styles.modeBtnText}>{t('switchMode')}</Text>
          </TouchableOpacity>
        </View>

        {/* Low stock badge */}
        {lowStockCount > 0 && (
          <TouchableOpacity
            style={[styles.lowBadge, rtl ? styles.leftBadge : styles.rightBadge]}
            onPress={() => navigation.navigate('Products', { screen: 'ProductsList', params: { filterLow: true } })}
          >
            <Ionicons name="warning" size={13} color="white" />
            <Text style={styles.lowBadgeText}>{t('lowStock', lowStockCount)}</Text>
          </TouchableOpacity>
        )}

        {/* Pause camera */}
        <TouchableOpacity
          style={[styles.pauseBtn, rtl ? styles.pauseLeft : styles.pauseRight]}
          onPress={() => setCameraActive(c => !c)}
        >
          <Ionicons name={cameraActive ? 'pause' : 'play'} size={17} color="white" />
        </TouchableOpacity>
      </View>

      {/* Queue list */}
      <View style={styles.listArea}>
        <View style={[styles.listHeader, rtl && styles.rowReverse]}>
          <Text style={[styles.listTitle, rtl && styles.rtlText]}>
            {t('scannedItems')}
            {scanQueue.length > 0 && (
              <Text style={styles.qtyHint}> {t('items', totalItems)}</Text>
            )}
          </Text>
          {scanQueue.length > 0 && (
            <TouchableOpacity onPress={() =>
              Alert.alert(t('clearAllTitle'), t('clearAllMsg'), [
                { text: t('cancel'), style: 'cancel' },
                { text: t('clearAll'), style: 'destructive', onPress: () => setScanQueue([]) }
              ])
            }>
              <Text style={styles.clearAllBtn}>{t('clearAll')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {scanQueue.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="scan-outline" size={42} color="#cbd5e1" />
            <Text style={[styles.emptyText, rtl && styles.rtlText]}>{t('scanPrompt')}</Text>
          </View>
        ) : (
          <FlatList
            data={scanQueue}
            keyExtractor={i => i.barcode}
            renderItem={({ item }) => (
              <View style={[styles.row, rtl && styles.rowReverse]}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, rtl && styles.rtlText]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.rowBarcode, rtl && styles.rtlText]}>{item.barcode}</Text>
                </View>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(item.barcode, -1)}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyNum}>{item.qty}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(item.barcode, 1)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => removeItem(item.barcode)} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={17} color="white" />
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        <TouchableOpacity
          onPress={confirmTransaction}
          style={[
            styles.confirmBtn,
            { backgroundColor: modeColor, opacity: scanQueue.length ? 1 : 0.4 }
          ]}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="white" />
          <Text style={[styles.confirmText, rtl && styles.rtlText]}>
            {mode === 'SALE' ? t('confirmSale') : t('confirmPurchase')}
            {scanQueue.length > 0 ? ` ${t('items', totalItems)}` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f0f4f8' },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 14 },
  permText:   { fontSize: 16, fontWeight: '700', color: '#334155', textAlign: 'center' },
  permSub:    { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  rtlText:    { textAlign: 'right', writingDirection: 'rtl' },
  rowReverse: { flexDirection: 'row-reverse' },

  scannerBox: { flex: 1.3, backgroundColor: '#0a0a0a', overflow: 'hidden' },

  reticle: {
    position: 'absolute', alignSelf: 'center', top: '28%',
    width: 230, height: 130, borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  // Corner accents on reticle
  corner:    { position: 'absolute', width: 20, height: 20, borderColor: 'white', borderWidth: 2.5 },
  cornerTL:  { top: '27%', left: '50%', marginLeft: -115, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR:  { top: '27%', right: '50%', marginRight: -115, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL:  { top: '27%', marginTop: 110, left: '50%', marginLeft: -115, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR:  { top: '27%', marginTop: 110, right: '50%', marginRight: -115, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  topBar: {
    position: 'absolute', top: 18, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
  },
  modeLabel:    { color: 'white', fontSize: 17, fontWeight: '800', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  modeBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20 },
  modeBtnText:  { color: 'white', fontWeight: '700', fontSize: 13 },

  lowBadge:     { position: 'absolute', bottom: 46, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f39c12', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  rightBadge:   { right: 12 },
  leftBadge:    { left: 12 },
  lowBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },

  pauseBtn:   { position: 'absolute', bottom: 12, backgroundColor: 'rgba(255,255,255,0.18)', padding: 8, borderRadius: 20 },
  pauseRight: { right: 14 },
  pauseLeft:  { left: 14 },

  listArea:   { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listTitle:  { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  qtyHint:    { fontSize: 13, color: '#94a3b8', fontWeight: '400' },
  clearAllBtn:{ color: '#e74c3c', fontSize: 13, fontWeight: '600' },

  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, opacity: 0.6 },
  emptyText:  { color: '#94a3b8', fontSize: 14, textAlign: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    padding: 11, borderRadius: 10, marginBottom: 7, gap: 8,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowOffset: { width: 0, height: 1 },
  },
  rowInfo:    { flex: 1 },
  rowName:    { fontWeight: '700', fontSize: 13, color: '#1e293b' },
  rowBarcode: { fontSize: 10, color: '#94a3b8', marginTop: 1 },

  qtyRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn:     { backgroundColor: '#f1f5f9', borderRadius: 6, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  qtyBtnText: { fontSize: 18, color: '#1e293b', fontWeight: '600', lineHeight: 22 },
  qtyNum:     { fontSize: 15, fontWeight: '800', color: '#1e293b', minWidth: 20, textAlign: 'center' },
  delBtn:     { backgroundColor: '#e74c3c', padding: 8, borderRadius: 8 },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 12, marginTop: 8, marginBottom: 4,
  },
  confirmText: { color: 'white', fontWeight: '700', fontSize: 14 },
});
