import Darwin
import ExpoModulesCore

public class NativeProcessMemoryModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeProcessMemory")

    Function("getProcessMemoryMB") {
      return Self.readProcessMemoryMB()
    }
  }

  /// Reads the process's physical footprint (`phys_footprint`) via the Mach
  /// `TASK_VM_INFO` call, which is the same value Activity Monitor reports for
  /// the "Memory" column. Returns MB as a float, or `nil` when the syscall
  /// fails.
  private static func readProcessMemoryMB() -> Double? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size
    )

    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }

    guard result == KERN_SUCCESS else {
      return nil
    }

    return Double(info.phys_footprint) / (1024.0 * 1024.0)
  }
}