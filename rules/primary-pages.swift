import AppKit
import Foundation
import PDFKit
import Vision

// Batch render + OCR for the page-edge-cropped primary scan.
// usage: swift primary-pages.swift INPUT.pdf OUTDIR OCR.txt FROM TO
let args = CommandLine.arguments
guard args.count == 6 else { fatalError("usage: primary-pages.swift INPUT.pdf OUTDIR OCR.txt FROM TO") }
let doc = PDFDocument(url: URL(fileURLWithPath: args[1]))!
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
let ocrURL = URL(fileURLWithPath: args[3])
let from = Int(args[4])!, to = min(Int(args[5])!, doc.pageCount)
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
var text = ""
for n in from...to {
    let page = doc.page(at: n - 1)!
    let image = page.thumbnail(of: NSSize(width: 1800, height: 1800), for: .cropBox)
    var rect = CGRect(origin: .zero, size: image.size)
    let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
    let rep = NSBitmapImageRep(cgImage: cg)
    let png = rep.representation(using: .png, properties: [:])!
    let name = String(format: "p%02d.png", n)
    try png.write(to: outDir.appendingPathComponent(name))
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.minimumTextHeight = 0.004
    try VNImageRequestHandler(cgImage: cg).perform([req])
    let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    text += "\n===== PDF PAGE \(n) =====\n" + lines.joined(separator: "\n") + "\n"
    print("page \(n): \(Int(image.size.width))x\(Int(image.size.height)), \(lines.count) lines")
}
try text.write(to: ocrURL, atomically: true, encoding: .utf8)
