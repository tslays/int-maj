import Foundation
import PDFKit
import Vision
import AppKit
// usage: cellocr <pdf> <page> <px> <x0> <x1> <y,y,y,...>
let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[1]))!
let page = doc.page(at: Int(a[2])! - 1)!
let px = CGFloat(Double(a[3])!)
let x0 = Double(a[4])!, x1 = Double(a[5])!
let ys = a[6].split(separator: ",").compactMap { Double($0) }
let img = page.thumbnail(of: NSSize(width: px, height: px), for: .mediaBox)
var rect = CGRect(origin: .zero, size: img.size)
let full = img.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
let W = CGFloat(full.width), H = CGFloat(full.height)
for y in ys {
    let pad = 0.011
    let cx = CGFloat(x0) * W
    let cw = CGFloat(x1 - x0) * W
    let cyTop = CGFloat(1.0 - y - pad) * H
    let ch = CGFloat(2 * pad) * H
    let box = CGRect(x: max(0, cx), y: max(0, cyTop), width: cw, height: ch).integral
    guard let crop = full.cropping(to: box) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    req.minimumTextHeight = 0
    try? VNImageRequestHandler(cgImage: crop, options: [:]).perform([req])
    var parts: [String] = []
    for o in req.results ?? [] {
        if let c = o.topCandidates(1).first { parts.append(c.string) }
    }
    print(String(format: "%.4f\t%@", y, parts.joined(separator: " ")))
}
