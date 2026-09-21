import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class NativeProcessMemoryModule extends NativeModule<{}> {
  getProcessMemoryMB(): number | null;
}

/**
 * Optional because the native module is only linked into custom dev/prod
 * builds (not Expo Go, web, or Android). Falls back to `null` when absent.
 */
const NativeProcessMemory = requireOptionalNativeModule<NativeProcessMemoryModule>(
  'NativeProcessMemory'
);

export default NativeProcessMemory;