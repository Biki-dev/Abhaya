
// ─────────────────────────────────────────────────────────────────────────────
// Offline-first emergency contacts service.
//
// SOURCE OF TRUTH:  AsyncStorage (always)
// BACKEND:          Synced opportunistically; never blocks reads or SOS.
//
// Data flow:
//   READ  → always from AsyncStorage (instant, works offline)
//   WRITE → AsyncStorage first → then try backend sync in background
//   INIT  → on login/startup, pull from backend ONCE to seed local cache;
//           if offline, use whatever is already cached.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrlCandidates } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────
export type EmergencyContact = {
  /** Local UUID — used as key inside AsyncStorage. Backend id may differ. */
  localId: string;
  /** Backend id — present once synced. Null for contacts added offline. */
  backendId: number | null;
  name:  string;
  phone: string;
};

// ── Storage keys ──────────────────────────────────────────────────────────────
const CONTACTS_KEY = 'saathi_emergency_contacts';   // local list

// ── Helpers ───────────────────────────────────────────────────────────────────
function uuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function readLocal(): Promise<EmergencyContact[]> {
  try {
    const raw = await AsyncStorage.getItem(CONTACTS_KEY);
    return raw ? (JSON.parse(raw) as EmergencyContact[]) : [];
  } catch {
    return [];
  }
}

async function writeLocal(contacts: EmergencyContact[]): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

async function getUserPhone(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem('saathiUserData');
    if (!raw) return null;
    return (JSON.parse(raw) as { phone?: string }).phone ?? null;
  } catch {
    return null;
  }
}

// ── Backend helpers ───────────────────────────────────────────────────────────
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getWorkingBase(): Promise<string | null> {
  // Always try the cached working URL first (set by heartbeat / apiRequest)
  const stored = await AsyncStorage.getItem('saathi_api_base').catch(() => null);
  const candidates = [...new Set(
    [stored, ...getApiBaseUrlCandidates()].filter((v): v is string => Boolean(v))
  )];

  for (const base of candidates) {
    try {
      const res = await fetchWithTimeout(`${base}/health`, 3000);
      if (res.ok) {
        // Cache so next call is instant
        await AsyncStorage.setItem('saathi_api_base', base).catch(() => {});
        return base;
      }
    } catch {
      // offline or wrong URL — try next
    }
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read contacts from local cache — always instant, always works offline.
 */
export async function getContacts(): Promise<EmergencyContact[]> {
  return readLocal();
}

/**
 * Called once on app start / after login.
 * Tries to pull latest list from backend and merge into local cache.
 * If offline → silently skips, returns cached list.
 */
export async function initContactsFromBackend(): Promise<EmergencyContact[]> {
  const phone = await getUserPhone();
  if (!phone) return readLocal();

  try {
    const base = await getWorkingBase();
    if (!base) return readLocal();

    const res = await fetch(`${base}/api/contacts/${phone}`, {
      signal: AbortSignal.timeout?.(6000) ?? undefined,
    });
    if (!res.ok) return readLocal();

    type BackendContact = { id: number; name: string; phone: string };
    const remote: BackendContact[] = await res.json();

    // Map backend contacts → local shape; preserve any unsynced local contacts
    const local   = await readLocal();
    const synced  = remote.map((c) => {
      const existing = local.find(
        (l) => l.backendId === c.id || (l.name === c.name && l.phone === c.phone)
      );
      return {
        localId:   existing?.localId ?? uuid(),
        backendId: c.id,
        name:      c.name,
        phone:     c.phone,
      };
    });

    // Append any local-only contacts that haven't been pushed yet
    const unsyncedLocal = local.filter(
      (l) => !synced.find((s) => s.localId === l.localId)
    );
    const merged = [...synced, ...unsyncedLocal];
    await writeLocal(merged);

    // Push any unsynced back immediately
    if (unsyncedLocal.length > 0) {
      syncToBackend(merged, phone, base).catch(() => {});
    }

    return merged;
  } catch {
    return readLocal();
  }
}

/**
 * Add a new emergency contact.
 * Writes locally first (instant), then pushes to backend in background.
 */
export async function addContact(
  name: string,
  phone: string,
): Promise<EmergencyContact> {
  const contact: EmergencyContact = {
    localId:   uuid(),
    backendId: null,
    name:      name.trim(),
    phone:     phone.trim(),
  };

  const list = await readLocal();
  list.push(contact);
  await writeLocal(list);

  // Background sync
  backgroundSync(list).catch(() => {});

  return contact;
}

/**
 * Update an existing contact by localId.
 */
export async function updateContact(
  localId: string,
  name: string,
  phone: string,
): Promise<EmergencyContact | null> {
  const list = await readLocal();
  const idx  = list.findIndex((c) => c.localId === localId);
  if (idx === -1) return null;

  list[idx] = { ...list[idx], name: name.trim(), phone: phone.trim() };
  await writeLocal(list);

  // Background sync
  backgroundSync(list).catch(() => {});

  return list[idx];
}

/**
 * Delete a contact by localId.
 */
export async function deleteContact(localId: string): Promise<void> {
  const list = await readLocal();
  const idx  = list.findIndex((c) => c.localId === localId);
  if (idx === -1) return;

  const [removed] = list.splice(idx, 1);
  await writeLocal(list);

  // Try to delete from backend if it was synced
  if (removed.backendId != null) {
    deleteFromBackend(removed.backendId).catch(() => {});
  }
}

/**
 * Replace entire local contacts list.
 * Used during onboarding to seed contacts entered in sign-up flow.
 */
export async function setContacts(
  contacts: { name: string; phone: string }[],
): Promise<EmergencyContact[]> {
  const mapped: EmergencyContact[] = contacts.map((c) => ({
    localId:   uuid(),
    backendId: null,
    name:      c.name.trim(),
    phone:     c.phone.trim(),
  }));
  await writeLocal(mapped);
  backgroundSync(mapped).catch(() => {});
  return mapped;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL SYNC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Full replace sync — sends entire local list to backend. */
async function syncToBackend(
  contacts: EmergencyContact[],
  phone: string,
  base: string,
): Promise<void> {
  const body = JSON.stringify({
    contacts: contacts.map((c) => ({ name: c.name, phone: c.phone })),
  });

  const res = await fetch(`${base}/api/contacts/${phone}/sync`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    console.warn('[contacts] Backend sync failed:', res.status);
    return;
  }

  type BackendContact = { id: number; name: string; phone: string };
  const { contacts: synced }: { contacts: BackendContact[] } = await res.json();

  // Update backendIds in local store
  const local = await readLocal();
  const updated = local.map((l, i) => ({
    ...l,
    backendId: synced[i]?.id ?? l.backendId,
  }));
  await writeLocal(updated);

  console.log('[contacts] ✅ Synced', updated.length, 'contacts to backend');
}

/** Fire-and-forget background sync — resolves silently on any error. */
async function backgroundSync(contacts: EmergencyContact[]): Promise<void> {
  // Small delay: let the upsertUser call finish caching the working base URL
  await new Promise(r => setTimeout(r, 1500));

  for (let attempt = 1; attempt <= 3; attempt++) {
    const phone = await getUserPhone();
    if (!phone) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    const base = await getWorkingBase();
    if (!base) {
      console.warn(`[contacts] Sync attempt ${attempt}: No base URL found`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    try {
      await syncToBackend(contacts, phone, base);
      console.log('[contacts] backgroundSync completed successfully');
      return;
    } catch (err) {
      console.warn(`[contacts] Sync attempt ${attempt} failed:`, err);
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.error('[contacts] backgroundSync failed after all attempts');
}

/** Delete a single contact from backend by backendId. */
async function deleteFromBackend(backendId: number): Promise<void> {
  const phone = await getUserPhone();
  if (!phone) return;
  const base = await getWorkingBase();
  if (!base) return;

  await fetch(`${base}/api/contacts/${phone}/${backendId}`, {
    method: 'DELETE',
  }).catch(() => {});
}