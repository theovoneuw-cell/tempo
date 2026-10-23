// Onde de frappe : point ambre, deux cercles qui s'éloignent.
// swift build/logo.swift <taille> <sortie.png>
import AppKit
let s = Double(CommandLine.arguments[1])!
let out = CommandLine.arguments[2]
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(s), pixelsHigh: Int(s), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let bg = NSColor(srgbRed: 0x12/255, green: 0x12/255, blue: 0x11/255, alpha: 1)
let ivory = NSColor(srgbRed: 0xF1/255, green: 0xEE/255, blue: 0xE6/255, alpha: 1)
let amber = NSColor(srgbRed: 1, green: 0x9E/255, blue: 0x3D/255, alpha: 1)
bg.setFill(); NSRect(x: 0, y: 0, width: s, height: s).fill()
let c = s / 2
func ring(_ r: Double, _ w: Double, _ a: Double) {
    let p = NSBezierPath(ovalIn: NSRect(x: c - r*s, y: c - r*s, width: 2*r*s, height: 2*r*s))
    p.lineWidth = w * s; ivory.withAlphaComponent(a).setStroke(); p.stroke()
}
ring(0.35, 0.02, 0.18)
ring(0.235, 0.028, 0.5)
amber.setFill()
NSBezierPath(ovalIn: NSRect(x: c - 0.125*s, y: c - 0.125*s, width: 0.25*s, height: 0.25*s)).fill()
NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
