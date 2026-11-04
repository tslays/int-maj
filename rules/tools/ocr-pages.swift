import Foundation
import PDFKit
import Vision
import AppKit

// usage: ocr-pages <pdf> <firstPage> <lastPage> <pxHeight> <pngDir>
let path = CommandLine.arguments[1]
let first = Int(CommandLine.arguments[2])!
let last = Int(CommandLine.arguments[3])!
let px = CGFloat(Double(CommandLine.arguments[4])!)
let pngDir = CommandLine.arguments[5]
let doc = PDFDocument(url: URL(fileURLWithPath: path))!
try? FileManager.default.createDirectory(atPath: pngDir, withIntermediateDirectories: true)

for n in first...last {
    guard let page = doc.page(at: n - 1) else { continue }
    let img = page.thumbnail(of: NSSize(width: px, height: px), for: .mediaBox)
    var rect = CGRect(origin: .zero, size: img.size)
    guard let cg = img.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { continue }
    // write the upright render
    if let rep = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) {
        let name = String(format: "p%02d.png", n)
        try? rep.write(to: URL(fileURLWithPath: pngDir + "/" + name))
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.minimumTextHeight = 0.003
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    for o in req.results ?? [] {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        print(String(format: "%d\t%.4f\t%.4f\t%.4f\t%.4f\t%@", n, b.minX, b.minY, b.maxX, b.maxY, c.string))
    }
    FileHandle.standardError.write("page \(n) done\n".data(using: .utf8)!)
}
