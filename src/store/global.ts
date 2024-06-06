import { createStore } from 'lrhs';
import { DefaultSettings, type Settings } from '@/service/settings';
import type { CVMInstance } from '@/service/tencent';

export interface GlobalStore {
  settings: Settings;
  instance?: CVMInstance;
}

function getLs<P extends keyof GlobalStore, T = string>(key: P) {
  const v = localStorage.getItem(`yav2ray.${key}`);
  if (!v) return undefined;
  return JSON.parse(v) as T;
}
export const globalStore = createStore<GlobalStore>({
  settings: {
    ...DefaultSettings,
    ...getLs('settings'),
  },
});

['settings'].forEach((prop) => {
  globalStore.hook(prop as keyof GlobalStore, (v) => {
    localStorage.setItem(`yav2ray.${prop}`, JSON.stringify(v));
  });
});