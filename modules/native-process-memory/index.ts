import NativeProcessMemory from './src/NativeProcessMemoryModule';

/**
 * Returns the native process physical RAM footprint in MB, or `null` when the
 * native module is unavailable (Expo Go, web, Android) or the syscall failed.
 */
export function readNativeProcessMemoryMB(): number | null {
  if (!NativeProcessMemory || typeof NativeProcessMemory.getProcessMemoryMB !== 'function') {
    return null;
  }
  try {
    const value = NativeProcessMemory.getProcessMemoryMB();
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export { default } from './src/NativeProcessMemoryModule';
export * from './src/NativeProcessMemory.types';