import Foundation
import PDFKit
import Vision
import AppKit

let path = CommandLine.arguments[1]
guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { FileHandle.standardError.write("no doc\n".data(using:.utf8)!); exit(2) }
print("PAGES \(doc.pageCount)")
let scale: CGFloat = 2.0
for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let w = Int(box.width * scale), h = Int(box.height * scale)
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue) else { continue }
    ctx.setFillColor(CGColor(gray: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    guard let cg = ctx.makeImage() else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    try? handler.perform([req])
    print("=== PAGE \(i+1) ===")
    if let obs = req.results {
        // sort top-to-bottom then left-to-right
        var lines: [(CGFloat, CGFloat, String)] = []
        for o in obs {
            guard let c = o.topCandidates(1).first else { continue }
            let bb = o.boundingBox
            lines.append((1 - bb.midY, bb.minX, c.string))
        }
        lines.sort { a, b in abs(a.0 - b.0) < 0.01 ? a.1 < b.1 : a.0 < b.0 }
        for l in lines { print(l.2) }
    }
}
