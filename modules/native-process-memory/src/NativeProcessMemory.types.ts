// Types for the NativeProcessMemory native module surface.

export interface NativeProcessMemoryModuleSpec {
  /**
   * Current physical footprint (resident set) of the whole app process in MB,
   * read via the Mach `TASK_VM_INFO` `phys_footprint` field. `null` when the
   * native call fails or the module is not linked.
   */
  getProcessMemoryMB(): number | null;
}