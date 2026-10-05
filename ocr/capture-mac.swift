// Captures screen regions with ScreenCaptureKit, leaving out one app's windows (Evaratus
// Review's own panel and marks), and prints them as JSON with base64 PNGs:
//   capture-mac <pid> '<json [{"x":..,"y":..,"width":..,"height":..}, ...]>'
//   -> {"images":[{"png":"…","scale":2}, ...]}
// Regions are in screen points, origin top-left of the main display (as Electron uses).
import Foundation
import ScreenCaptureKit
import ImageIO
import UniformTypeIdentifiers

func fail(_ message: String, _ code: Int32 = 1) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(code)
}

struct Region: Decodable { let x: Double; let y: Double; let width: Double; let height: Double }

let args = CommandLine.arguments
guard args.count == 3, let pid = Int32(args[1]),
      let regions = try? JSONDecoder().decode([Region].self, from: Data(args[2].utf8)) else {
  fail("usage: capture-mac <pid> '<regions json>'")
}

func png(_ image: CGImage) -> Data {
  let data = NSMutableData()
  let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  CGImageDestinationFinalize(dest)
  return data as Data
}

// The main thread keeps running (dispatchMain) so ScreenCaptureKit can deliver its results;
// blocking it would deadlock. The task exits the process when done.
Task {
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    let mine = content.applications.filter { $0.processID == pid }
    var images: [[String: Any]] = []
    for r in regions {
      let centre = CGPoint(x: r.x + r.width / 2, y: r.y + r.height / 2)
      guard let display = content.displays.first(where: { $0.frame.contains(centre) }) ?? content.displays.first else {
        fail("no display")
      }
      let filter = SCContentFilter(display: display, excludingApplications: mine, exceptingWindows: [])
      let scale = Double(filter.pointPixelScale)
      let config = SCStreamConfiguration()
      config.sourceRect = CGRect(x: r.x - display.frame.minX, y: r.y - display.frame.minY, width: r.width, height: r.height)
      config.width = Int(r.width * scale)
      config.height = Int(r.height * scale)
      config.showsCursor = false
      let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
      images.append(["png": png(image).base64EncodedString(), "scale": scale])
    }
    let json = try JSONSerialization.data(withJSONObject: ["images": images])
    FileHandle.standardOutput.write(json)
    exit(0)
  } catch {
    // The usual cause: Screen Recording permission not given yet.
    fail("capture failed: \(error.localizedDescription)", 2)
  }
}
dispatchMain()
