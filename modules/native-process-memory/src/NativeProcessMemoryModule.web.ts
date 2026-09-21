import { NativeModule, registerWebModule } from 'expo';

// NativeProcessMemory is not available on the web platform.
class NativeProcessMemoryModule extends NativeModule<{}> {
  getProcessMemoryMB(): number | null {
    return null;
  }
}

export default registerWebModule(NativeProcessMemoryModule, 'NativeProcessMemoryModule');