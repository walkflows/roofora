"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

// Motion's own useReducedMotion() reads matchMedia synchronously, so its
// first client render can already differ from the server-rendered (window-less)
// output and trip a React hydration mismatch. useSyncExternalStore is built
// for exactly this: it always returns the server snapshot (false) for the
// render that hydrates, then subscribes to real changes after that.
export function useReducedMotionSafe() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
