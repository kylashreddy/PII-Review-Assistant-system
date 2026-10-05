// Scrolls whatever is under a screen point, so the app can page through a document pane:
//   scroll-mac <x> <y> <pixels>     (screen points; negative pixels scroll down, positive up)
// macOS sends scrolling to what is under the mouse pointer, so the pointer is moved over
// the pane for the scroll and put back afterwards. Needs Accessibility permission.
import Foundation
import CoreGraphics

let a = CommandLine.arguments
guard a.count == 4, let x = Double(a[1]), let y = Double(a[2]), let px = Int32(a[3]) else {
  FileHandle.standardError.write("usage: scroll-mac <x> <y> <pixels>\n".data(using: .utf8)!)
  exit(1)
}
let back = CGEvent(source: nil)?.location ?? CGPoint(x: x, y: y)
let target = CGPoint(x: x, y: y)
CGWarpMouseCursorPosition(target)
CGAssociateMouseAndMouseCursorPosition(1)
if let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: target, mouseButton: .left) {
  move.post(tap: .cghidEventTap)
}
usleep(30000)
// Large scrolls are sent in steps, like a trackpad, so web pages follow them smoothly.
var left = px
let size: Int32 = abs(px) > 3000 ? 600 : 120   // big jumps (to the top) in bigger steps
let step: Int32 = px < 0 ? -size : size
while left != 0 {
  let d = abs(left) < abs(step) ? left : step
  guard let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: d, wheel2: 0, wheel3: 0) else { exit(2) }
  e.location = target
  e.post(tap: .cghidEventTap)
  left -= d
  usleep(12000)
}
usleep(30000)
CGWarpMouseCursorPosition(back)
CGAssociateMouseAndMouseCursorPosition(1)
