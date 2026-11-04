import Foundation
import PDFKit
let path = CommandLine.arguments[1]
guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { exit(2) }
print("PAGES \(doc.pageCount)")
for i in 0..<doc.pageCount {
    let t = doc.page(at: i)?.string ?? ""
    print("=== PAGE \(i+1) ===")
    print(t)
}
