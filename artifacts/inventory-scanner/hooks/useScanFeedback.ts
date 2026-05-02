/**
 * hooks/useScanFeedback.ts
 *
 * Provides beep + vibration on successful barcode scan.
 *
 * Install dependencies:
 *   pnpm --filter inventory-scanner add expo-haptics expo-av
 *
 * Usage in your scanner screen:
 *   const { triggerScanFeedback } = useScanFeedback();
 *   // call when a barcode is successfully decoded:
 *   await triggerScanFeedback();
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

export function useScanFeedback() {
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Allow audio to play even when the phone is on silent
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        // Load the beep sound.
        // Place a short beep .mp3 at: assets/sounds/scan-beep.mp3
        // You can use any royalty-free short beep, e.g. from mixkit.co
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/sounds/scan-beep.mp3'),
          { shouldPlay: false, volume: 1.0 }
        );
        if (mounted) soundRef.current = sound;
      } catch (e) {
        // Gracefully degrade — haptics still work without audio
        console.warn('useScanFeedback: could not load beep sound', e);
      }
    })();

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const triggerScanFeedback = useCallback(async () => {
    // Play beep
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      }
    } catch (e) {
      // Ignore audio errors silently
    }

    // Vibrate
    try {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
      }
    } catch (e) {
      // Ignore haptic errors silently
    }
  }, []);

  /** Call this on error scans (wrong mode, product not found, etc.) */
  const triggerErrorFeedback = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Error
        );
      }
    } catch (e) {}
  }, []);

  return { triggerScanFeedback, triggerErrorFeedback };
}
