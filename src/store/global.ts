import { createStore } from 'lrhs';
import { DefaultSettings, type Settings } from '@/service/settings';
import type { CVMInstance } from '@/service/tencent';

export interface GlobalStore {
  settings: Settings;
  instance?: CVMInstance;
  v2rayState: 'NOT_INSTALLED' | 'INSTALLING' | 'INSTALLED';
}

function getLs<P extends keyof GlobalStore, T = string>(key: P) {
  const v = localStorage.getItem(`cloudv2ray.${key}`);
  if (!v) return undefined;
  return JSON.parse(v) as T;
}
export const globalStore = createStore<GlobalStore>({
  settings: {
    ...DefaultSettings,
    ...getLs('settings'),
  },
  v2rayState: 'NOT_INSTALLED',
});

['settings'].forEach((prop) => {
  globalStore.hook(prop as keyof GlobalStore, (v) => {
    localStorage.setItem(`cloudv2ray.${prop}`, JSON.stringify(v));
  });
});
