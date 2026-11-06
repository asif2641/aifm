/**
 * @file auth.js
 * @description Central authentication, user management, and PBKDF2 WebCrypto security.
 * Enforces role-based permissions, 5-attempt lockout, and idle auto-lock.
 */

import * as DB from './db.js';
import { store } from './store.js';
import { generateUUID } from './utils.js';

const PBKDF2_ITERATIONS = 100000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 60000; // 60 seconds

// Session state
let currentUser = null;
let isScreenLocked = false;
let failedAttempts = 0;
let lockoutUntil = 0;
let idleTimer = null;
let idleTimeoutMinutes = 15;

/**
 * Converts ArrayBuffer to Hex string.
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converts Hex string to Uint8Array.
 * @param {string} hex 
 * @returns {Uint8Array}
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generates a cryptographically secure random salt hex string.
 * @param {number} [byteLength=16] 
 * @returns {string}
 */
export function generateSalt(byteLength = 16) {
  const salt = new Uint8Array(byteLength);
  crypto.getRandomValues(salt);
  return bufferToHex(salt.buffer);
}

/**
 * Hashes a plaintext PIN using WebCrypto PBKDF2 with SHA-256 and unique salt.
 * Master Rule: Never store plain-text PINs in IndexedDB or logs.
 * @param {string} pin 
 * @param {string} saltHex 
 * @returns {Promise<string>} Hex encoded hash
 */
export async function hashPin(pin, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBytes(saltHex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
}

/**
 * Verifies a PIN against the stored salt and hash.
 * @param {string} pin 
 * @param {string} saltHex 
 * @param {string} expectedHashHex 
 * @returns {Promise<boolean>}
 */
export async function verifyPin(pin, saltHex, expectedHashHex) {
  const hash = await hashPin(pin, saltHex);
  return hash === expectedHashHex;
}

/**
 * Checks whether any users exist in the database (determines whether onboarding is needed).
 * @returns {Promise<boolean>} True if onboarding wizard must run
 */
export async function needsOnboarding() {
  const userCount = await DB.count('users');
  return userCount === 0;
}

/**
 * Retrieves all active users for login selection.
 * @returns {Promise<Array<Object>>}
 */
export async function getActiveUsers() {
  const all = await DB.getAll('users');
  return all.filter(u => u.active !== false).map(u => ({
    id: u.id,
    name: u.name,
    role: u.role
  }));
}

/**
 * Checks if the system is currently in lockout mode due to excessive failed attempts.
 * @returns {{ locked: boolean, remainingSeconds: number }}
 */
export function getLockoutStatus() {
  const now = Date.now();
  if (lockoutUntil > now) {
    const remainingSeconds = Math.ceil((lockoutUntil - now) / 1000);
    return { locked: true, remainingSeconds };
  }
  return { locked: false, remainingSeconds: 0 };
}

/**
 * Authenticates user by PIN.
 * @param {string} userId 
 * @param {string} pin 
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function login(userId, pin) {
  const status = getLockoutStatus();
  if (status.locked) {
    return { success: false, message: `System locked. Wait ${status.remainingSeconds} seconds.` };
  }

  const user = await DB.get('users', userId);
  if (!user || user.active === false) {
    return { success: false, message: 'User not found or inactive.' };
  }

  const isValid = await verifyPin(pin, user.pinSalt, user.pinHash);

  if (!isValid) {
    failedAttempts++;
    if (failedAttempts >= LOCKOUT_THRESHOLD) {
      lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      failedAttempts = 0;
      return { success: false, message: `Too many failed attempts. Locked for 60 seconds.` };
    }
    const left = LOCKOUT_THRESHOLD - failedAttempts;
    return { success: false, message: `Incorrect PIN. ${left} attempts remaining before lockout.` };
  }

  // Login successful
  failedAttempts = 0;
  lockoutUntil = 0;
  currentUser = {
    id: user.id,
    name: user.name,
    role: user.role
  };
  isScreenLocked = false;

  DB.setContext(currentUser.id, 'none');
  store.setState({ currentUser });

  startIdleWatcher();

  // Log to audit log
  import('./audit-log.js').then(Audit => {
    Audit.logAction({
      action: 'LOGIN',
      entity: 'users',
      entityId: user.id,
      summary: `User "${user.name}" (${user.role}) logged in successfully.`,
      outcome: 'success'
    }).catch(() => {});
  });

  return { success: true };
}

/**
 * Unlocks screen with PIN for current user.
 * @param {string} pin 
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function unlock(pin) {
  if (!currentUser) return { success: false, message: 'No active session.' };
  return login(currentUser.id, pin);
}

/**
 * Locks the current screen without clearing the user session.
 */
export function lock() {
  isScreenLocked = true;
  store.setState({ isLocked: true });
}

/**
 * Logs out the current user session completely.
 */
export function logout() {
  currentUser = null;
  isScreenLocked = false;
  DB.setContext('system', 'none');
  store.setState({ currentUser: null, isLocked: false, activeShift: null });
  stopIdleWatcher();
}

/**
 * Returns current logged-in user object or null.
 * @returns {Object|null}
 */
export function getCurrentUser() {
  return currentUser ? { ...currentUser } : null;
}

/**
 * Checks if a user is currently logged in.
 * @returns {boolean}
 */
export function isLoggedIn() {
  return currentUser !== null;
}

/**
 * Checks if the screen is currently locked.
 * @returns {boolean}
 */
export function isLocked() {
  return isScreenLocked;
}

/**
 * Creates a new user (Admin-only).
 * @param {Object} param0 
 * @param {string} param0.name 
 * @param {'admin'|'staff'|'viewer'} param0.role 
 * @param {string} param0.pin 
 * @returns {Promise<Object>}
 */
export async function createUser({ name, role, pin }) {
  const salt = generateSalt(16);
  const hash = await hashPin(pin, salt);

  const newUser = {
    name,
    role,
    pinHash: hash,
    pinSalt: salt,
    active: true
  };

  const saved = await DB.put('users', newUser);
  return saved;
}

/**
 * Updates user profile details or active state.
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateUser(id, updates) {
  const user = await DB.get('users', id);
  if (!user) throw new Error('User not found');

  const updated = { ...user, ...updates, id };
  return DB.put('users', updated);
}

/**
 * Resets user PIN.
 * @param {string} id 
 * @param {string} newPin 
 * @returns {Promise<boolean>}
 */
export async function resetUserPin(id, newPin) {
  const user = await DB.get('users', id);
  if (!user) throw new Error('User not found');

  const salt = generateSalt(16);
  const hash = await hashPin(newPin, salt);

  user.pinHash = hash;
  user.pinSalt = salt;

  await DB.put('users', user);
  return true;
}

// Idle activity watcher
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (idleTimeoutMinutes <= 0 || !currentUser || isScreenLocked) return;

  idleTimer = setTimeout(() => {
    lock();
  }, idleTimeoutMinutes * 60 * 1000);
}

function handleActivity() {
  resetIdleTimer();
}

export function setIdleTimeoutMinutes(mins) {
  idleTimeoutMinutes = Number(mins);
  resetIdleTimer();
}

function startIdleWatcher() {
  if (typeof window === 'undefined') return;
  window.addEventListener('mousemove', handleActivity, { passive: true });
  window.addEventListener('keydown', handleActivity, { passive: true });
  window.addEventListener('touchstart', handleActivity, { passive: true });
  window.addEventListener('pointerdown', handleActivity, { passive: true });
  resetIdleTimer();
}

function stopIdleWatcher() {
  if (typeof window === 'undefined') return;
  window.removeEventListener('mousemove', handleActivity);
  window.removeEventListener('keydown', handleActivity);
  window.removeEventListener('touchstart', handleActivity);
  window.removeEventListener('pointerdown', handleActivity);
  if (idleTimer) clearTimeout(idleTimer);
}
