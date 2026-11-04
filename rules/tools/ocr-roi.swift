import Foundation
import PDFKit
import Vision
import AppKit
// usage: ocr-roi <pdf> <page> <px> <x> <y> <w> <h>   (normalised, origin bottom-left)
let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[1]))!
let page = doc.page(at: Int(a[2])! - 1)!
let px = CGFloat(Double(a[3])!)
let img = page.thumbnail(of: NSSize(width: px, height: px), for: .mediaBox)
var rect = CGRect(origin: .zero, size: img.size)
let cg = img.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
req.minimumTextHeight = 0.0
req.regionOfInterest = CGRect(x: Double(a[4])!, y: Double(a[5])!, width: Double(a[6])!, height: Double(a[7])!)
try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
for o in req.results ?? [] {
    guard let c = o.topCandidates(1).first else { continue }
    let b = o.boundingBox
    print(String(format: "%.4f %.4f %@", b.minY, b.minX, c.string))
}
