import AppKit
import Foundation
import PDFKit
import Vision

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fputs("Usage: swift scripts/ocr-resume.swift <input.pdf> <output.txt>\n", stderr)
    exit(1)
}

let inputURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])

guard let document = PDFDocument(url: inputURL) else {
    fputs("Unable to open PDF at \(inputURL.path)\n", stderr)
    exit(1)
}

var pages: [String] = []

for pageIndex in 0..<document.pageCount {
    guard let page = document.page(at: pageIndex) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let targetSize = NSSize(width: bounds.width * 3, height: bounds.height * 3)
    let image = page.thumbnail(of: targetSize, for: .mediaBox)

    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        fputs("Unable to render page \(pageIndex + 1)\n", stderr)
        continue
    }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-AU", "en-US"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    let observations = (request.results ?? []).sorted { first, second in
        let rowDifference = abs(first.boundingBox.midY - second.boundingBox.midY)
        if rowDifference < 0.012 {
            return first.boundingBox.minX < second.boundingBox.minX
        }
        return first.boundingBox.midY > second.boundingBox.midY
    }

    let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    pages.append("PAGE \(pageIndex + 1)\n\(text)")
}

let output = pages.joined(separator: "\n\n")
try FileManager.default.createDirectory(
    at: outputURL.deletingLastPathComponent(),
    withIntermediateDirectories: true
)
try output.write(to: outputURL, atomically: true, encoding: .utf8)
print("OCR extracted \(output.count) characters from \(document.pageCount) pages.")
