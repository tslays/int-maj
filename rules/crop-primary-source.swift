import AppKit
import Foundation
import PDFKit
import Vision

// Produce a non-destructive, page-edge-cropped copy of the original scan.
// The source PDF is never modified; this sets each output page's CropBox only.
guard CommandLine.arguments.count == 3 else {
    fatalError("usage: swift crop-primary-source.swift INPUT.pdf OUTPUT.pdf")
}
let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
guard inputURL.standardizedFileURL != outputURL.standardizedFileURL else {
    fatalError("input and output must be different files")
}
guard !FileManager.default.fileExists(atPath: outputURL.path) else {
    fatalError("refusing to overwrite existing output: \(outputURL.path)")
}
guard let document = PDFDocument(url: inputURL), document.pageCount > 0 else {
    fatalError("could not open input PDF or it has no pages")
}

let detector = VNDetectDocumentSegmentationRequest()
for index in 0..<document.pageCount {
    guard let page = document.page(at: index) else { fatalError("missing page \(index + 1)") }
    let media = page.bounds(for: .mediaBox)
    let thumbnail = page.thumbnail(of: NSSize(width: 1200, height: 900), for: .mediaBox)
    var proposed = CGRect(origin: .zero, size: thumbnail.size)
    guard let image = thumbnail.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else {
        fatalError("could not render page \(index + 1)")
    }
    try VNImageRequestHandler(cgImage: image).perform([detector])
    guard let observation = detector.results?.max(by: {
        $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
    }) else {
        fatalError("could not detect page edges on page \(index + 1); no output written")
    }
    let box = observation.boundingBox
    guard observation.confidence >= 0.5, box.width > 0.35, box.height > 0.2 else {
        fatalError("implausible page-edge detection on page \(index + 1); no output written")
    }
    // Keep a 0.25% safety border so a slightly conservative detector never clips the paper edge.
    let padX = media.width * 0.0025
    let padY = media.height * 0.0025
    let detected = CGRect(
        x: media.minX + box.minX * media.width - padX,
        y: media.minY + box.minY * media.height - padY,
        width: box.width * media.width + 2 * padX,
        height: box.height * media.height + 2 * padY
    ).intersection(media)
    guard detected.width > 0, detected.height > 0 else {
        fatalError("invalid crop box on page \(index + 1)")
    }
    page.setBounds(detected, for: .cropBox)
    print(String(format: "%02d confidence %.2f crop %.1f%% x %.1f%% at (%.3f, %.3f)",
        index + 1, observation.confidence,
        100 * detected.width / media.width, 100 * detected.height / media.height,
        box.minX, box.minY))
}

guard document.write(to: outputURL),
      let check = PDFDocument(url: outputURL), check.pageCount == document.pageCount else {
    try? FileManager.default.removeItem(at: outputURL)
    fatalError("output failed PDF/page-count validation")
}
for index in 0..<check.pageCount {
    let page = check.page(at: index)!
    let crop = page.bounds(for: .cropBox)
    let media = page.bounds(for: .mediaBox)
    guard crop.width < media.width, crop.height < media.height else {
        try? FileManager.default.removeItem(at: outputURL)
        fatalError("page \(index + 1) was not cropped")
    }
}
print("Validated \(check.pageCount) pages; original scan retained unchanged.")
