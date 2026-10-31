import Foundation
import PDFKit
import Vision
import AppKit

let path = CommandLine.arguments[1]
let pageNo = Int(CommandLine.arguments[2])! - 1
let height = CGFloat(Double(CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : "2600")!)
let doc = PDFDocument(url: URL(fileURLWithPath: path))!
let page = doc.page(at: pageNo)!
let img = page.thumbnail(of: NSSize(width: height, height: height), for: .mediaBox)
var rect = CGRect(origin: .zero, size: img.size)
guard let cg = img.cgImage(forProposedRect: &rect, context: nil, hints: nil) else { exit(3) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = true
req.minimumTextHeight = 0.003
try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
print("SIZE \(cg.width)x\(cg.height)")
for o in req.results ?? [] {
    guard let c = o.topCandidates(1).first else { continue }
    let b = o.boundingBox
    print(String(format: "%.3f\t%.3f\t%.3f\t%.3f\t%@", b.minX, b.minY, b.maxX, b.maxY, c.string))
}
