// Scan a screenshot of the table without seeing it: OCR every label with its
// box, then sample the palette and the tile grid. Used to check layout
// positions, label placement and contrast from a real render.
//
//   swift tools/scan-screenshot.swift shot.png [--region x,y,w,h]

import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1, let img = NSImage(contentsOfFile: args[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    FileHandle.standardError.write("usage: scan-screenshot.swift <png> [--region x,y,w,h]\n".data(using: .utf8)!)
    exit(2)
}
var region = CGRect(x: 0, y: 0, width: cg.width, height: cg.height)
if let i = args.firstIndex(of: "--region"), i + 1 < args.count {
    let p = args[i + 1].split(separator: ",").compactMap { Double($0) }
    if p.count == 4 { region = CGRect(x: p[0], y: p[1], width: p[2], height: p[3]) }
}
guard let crop = cg.cropping(to: region) else { exit(3) }

let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: crop, options: [:]).perform([req])
print("# text (x,y,w,h in region pixels)")
for obs in (req.results ?? []) {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    let x = Int(b.minX * Double(region.width)), y = Int((1 - b.maxY) * Double(region.height))
    print("\(x),\(y),\(Int(b.width * Double(region.width)))x\(Int(b.height * Double(region.height)))\t\(c.string)")
}

// Palette: quantise and report the ten most common colours.
guard let data = crop.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else { exit(4) }
let bpp = crop.bitsPerPixel / 8, rowBytes = crop.bytesPerRow
var counts: [UInt32: Int] = [:]
for y in stride(from: 0, to: crop.height, by: 2) {
    for x in stride(from: 0, to: crop.width, by: 2) {
        let o = y * rowBytes + x * bpp
        let r = UInt32(bytes[o] / 16), g = UInt32(bytes[o + 1] / 16), b = UInt32(bytes[o + 2] / 16)
        counts[(r << 8) | (g << 4) | b, default: 0] += 1
    }
}
let total = counts.values.reduce(0, +)
print("\n# palette (share of sampled pixels)")
for (key, n) in counts.sorted(by: { $0.value > $1.value }).prefix(10) {
    let r = (key >> 8) & 0xF, g = (key >> 4) & 0xF, b = key & 0xF
    print(String(format: "#%1X%1X%1X0  %5.1f%%", r, g, b, 100.0 * Double(n) / Double(total)))
}
