import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const KEEP_AWAKE_TAG = 'eye-rule-20-timer';

/** Keeps the screen awake only while `enabled` is true (timer running AND the user opted in). */
export function useConditionalKeepAwake(enabled: boolean): void {
  useEffect(() => {
    if (enabled) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [enabled]);
}
