// Reads a PNG from stdin and prints the text Apple Vision finds in it, as JSON:
//   {"width":W,"height":H,"lines":[{"text":"…","box":[x,y,w,h],"words":[{"text":"…","box":[x,y,w,h]}]}]}
// Boxes are in image pixels, origin top-left. Everything runs on this computer.
// Option: --scale N reads the image enlarged N times (better spacing on small,
// non-Retina text); boxes are still reported in the original image's pixels.
import Foundation
import Vision
import ImageIO

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

let data = FileHandle.standardInput.readDataToEndOfFile()
guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let original = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("not an image") }
let W = Double(original.width), H = Double(original.height)

var scale = 1
if let i = CommandLine.arguments.firstIndex(of: "--scale"), i + 1 < CommandLine.arguments.count, let n = Int(CommandLine.arguments[i + 1]) {
  scale = max(1, min(4, n))
}
var image = original
if scale > 1, let ctx = CGContext(data: nil, width: original.width * scale, height: original.height * scale, bitsPerComponent: 8,
                                  bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
  ctx.interpolationQuality = .high
  ctx.draw(original, in: CGRect(x: 0, y: 0, width: original.width * scale, height: original.height * scale))
  if let big = ctx.makeImage() { image = big }
}

func pixels(_ r: CGRect) -> [Int] {
  // Vision: normalised, origin bottom-left -> pixels, origin top-left.
  [Int((r.minX * W).rounded()), Int(((1 - r.maxY) * H).rounded()), Int((r.width * W).rounded()), Int((r.height * H).rounded())]
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false   // keep names, IDs and numbers exactly as shown
request.recognitionLanguages = ["en-US"]
request.minimumTextHeight = 0
let handler = VNImageRequestHandler(cgImage: image, options: [:])
do { try handler.perform([request]) } catch { fail("ocr failed: \(error)") }

var lines: [[String: Any]] = []
for obs in request.results ?? [] {
  guard let cand = obs.topCandidates(1).first else { continue }
  let text = cand.string
  var words: [[String: Any]] = []
  // Words = runs of non-space characters (keeps emails, phone numbers and IDs whole).
  var i = text.startIndex
  while i < text.endIndex {
    while i < text.endIndex && text[i].isWhitespace { i = text.index(after: i) }
    if i == text.endIndex { break }
    var j = i
    while j < text.endIndex && !text[j].isWhitespace { j = text.index(after: j) }
    if let box = try? cand.boundingBox(for: i..<j) {
      words.append(["text": String(text[i..<j]), "box": pixels(box.boundingBox)])
    }
    i = j
  }
  lines.append(["text": text, "box": pixels(obs.boundingBox), "words": words])
}

let out: [String: Any] = ["width": original.width, "height": original.height, "lines": lines]
let json = try! JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(json)
