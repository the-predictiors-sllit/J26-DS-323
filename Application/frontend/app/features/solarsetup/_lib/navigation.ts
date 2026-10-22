'use client';
import { useSyncExternalStore } from 'react';
export type Section = 'analysis' | 'orientation';
function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
function snapshot(): Section {
  const value = window.location.hash.slice(1);
  return value === "orientation" ? "orientation" : "analysis";
}
export function useSection() {
  return useSyncExternalStore(subscribe, snapshot, () => 'analysis' as Section);
}
