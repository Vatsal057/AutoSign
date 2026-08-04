import { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, degrees } from 'pdf-lib'
import { vectorize } from './vectorizer/index.js'
import { buildSvg } from './vectorizer/buildSvg.js'
import { Upload, Download, ChevronLeft, ChevronRight, Settings, Loader2, Pen, Sliders } from 'lucide-react'
import Moveable from 'react-moveable'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

// ─── Default signature style ─────────────────────────────────────────────────
const DEFAULT_STYLE = {
  color: '#000f55',
  thickness: 4,
  smoothness: 5,
  taperAmount: 0.65,
  linecap: 'round',
  texture: 0,
  useTaper: true,
  tension: 6,
}

// ─── Rasterize an SVG string to a PNG data-URL at the given scale ────────────
function rasterizeSvg(svgString, width, height, pixelRatio = 3) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * pixelRatio
      canvas.height = height * pixelRatio
      const ctx = canvas.getContext('2d')
      ctx.scale(pixelRatio, pixelRatio)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = url
  })
}

// ─── Small control components ─────────────────────────────────────────────────
function Slider({ label, min, max, step = 0.01, value, onChange, unit = '' }) {
  return (
    <div className="setting-group">
      <div className="setting-label-row">
        <label>{label}</label>
        <span className="setting-value">{typeof value === 'number' ? value.toFixed(step < 0.1 ? 2 : 0) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // PDF
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  // Signature
  const [signatureSrc, setSignatureSrc] = useState(null)
  const [vectorData, setVectorData] = useState(null)   // { chains, width, height }
  const [sigSvgUrl, setSigSvgUrl] = useState(null)     // object URL of current SVG
  const [isProcessing, setIsProcessing] = useState(false)

  // Style — pure data, changing any field instantly re-renders SVG
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const setSingleStyle = useCallback((key, val) =>
    setStyle(s => ({ ...s, [key]: val })), [])

  // DOM refs
  const canvasRef = useRef(null)
  const sigRef = useRef(null)

  // Moveable transform state (tracked in a ref for perf — doesn't need to cause re-renders)
  const frame = useRef({ translate: [50, 50], rotate: 0, width: 300, height: 120 })

  // ── Load PDF ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfFile) return
    pdfjsLib.getDocument({ data: pdfFile.arrayBuffer() }).promise
      .then(doc => {
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setCurrentPage(1)
      })
  }, [pdfFile])

  useEffect(() => {
    if (!pdfFile) return
    pdfFile.arrayBuffer().then(buf => {
      pdfjsLib.getDocument({ data: buf }).promise.then(doc => {
        setPdfDoc(doc)
        setNumPages(doc.numPages)
        setCurrentPage(1)
      })
    })
  }, [pdfFile])

  // ── Render PDF page ──────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false
    pdfDoc.getPage(currentPage).then(page => {
      if (cancelled) return
      const vp = page.getViewport({ scale: 1.5 })
      const canvas = canvasRef.current
      canvas.width = vp.width
      canvas.height = vp.height
      page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
    })
    return () => { cancelled = true }
  }, [pdfDoc, currentPage])

  // ── Vectorize signature (expensive — runs only when image or threshold changes) ──
  useEffect(() => {
    if (!signatureSrc) return
    setIsProcessing(true)
    setVectorData(null)
    setSigSvgUrl(null)

    vectorize(signatureSrc).then(data => {
      setVectorData(data)
      setIsProcessing(false)
    }).catch(err => {
      console.error('Vectorization failed:', err)
      setIsProcessing(false)
    })
  }, [signatureSrc])

  // ── Re-render SVG whenever vector data OR style changes (instant) ──
  useEffect(() => {
    if (!vectorData) return

    const svgString = buildSvg(vectorData.chains, vectorData.width, vectorData.height, style)

    // Revoke old URL to prevent memory leaks
    if (sigSvgUrl) URL.revokeObjectURL(sigSvgUrl)

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setSigSvgUrl(url)

    // Update size hint based on SVG aspect ratio
    if (sigRef.current) {
      const ratio = vectorData.height / vectorData.width
      const w = frame.current.width
      const h = w * ratio
      frame.current.height = h
      sigRef.current.style.height = `${h}px`
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vectorData, style])

  // ── Image load → sync Moveable frame ────────────────────────────
  const handleImageLoad = (e) => {
    const ratio = e.target.naturalHeight / e.target.naturalWidth
    const w = frame.current.width
    const h = w * ratio
    frame.current.height = h
    e.target.style.width = `${w}px`
    e.target.style.height = `${h}px`
    e.target.style.transform =
      `translate(${frame.current.translate[0]}px, ${frame.current.translate[1]}px) rotate(${frame.current.rotate}deg)`
  }

  // ── Upload handlers ──────────────────────────────────────────────
  const handlePdfUpload = e => { if (e.target.files[0]) setPdfFile(e.target.files[0]) }
  const handleSigUpload = e => {
    if (e.target.files[0]) {
      if (signatureSrc) URL.revokeObjectURL(signatureSrc)
      setSignatureSrc(URL.createObjectURL(e.target.files[0]))
      // Reset frame size for new image
      frame.current = { translate: [50, 50], rotate: 0, width: 300, height: 120 }
    }
  }

  // ── Export signed PDF ────────────────────────────────────────────
  const handleExport = async () => {
    if (!pdfFile || !vectorData || !sigSvgUrl) return

    // Build a fresh SVG at current style
    const svgString = buildSvg(vectorData.chains, vectorData.width, vectorData.height, style)

    // Rasterize at 3× for crisp PDF embed
    const pngDataUrl = await rasterizeSvg(svgString, frame.current.width, frame.current.height, 3)

    const pngBytes = await fetch(pngDataUrl).then(r => r.arrayBuffer())
    const pdfBytes = await pdfFile.arrayBuffer()
    const pdfDocLib = await PDFDocument.load(pdfBytes)

    const embeddedSig = await pdfDocLib.embedPng(pngBytes)
    const pages = pdfDocLib.getPages()
    const targetPage = pages[currentPage - 1]

    const { width: unrotatedW, height: unrotatedH } = targetPage.getSize()
    const pageRotation = targetPage.getRotation().angle || 0

    let visualPdfW = unrotatedW
    let visualPdfH = unrotatedH
    if (pageRotation === 90 || pageRotation === 270) {
      visualPdfW = unrotatedH; visualPdfH = unrotatedW
    }

    const canvas = canvasRef.current
    const scaleX = visualPdfW / canvas.width
    const scaleY = visualPdfH / canvas.height

    const { translate, rotate, width: sigW, height: sigH } = frame.current
    const finalW = sigW * scaleX
    const finalH = sigH * scaleY

    const visualCx = translate[0] * scaleX + finalW / 2
    const visualCy = translate[1] * scaleY + finalH / 2

    let pdfCx = visualCx, pdfCy = unrotatedH - visualCy, pdfRot = -rotate
    if (pageRotation === 90) { pdfCx = visualCy; pdfCy = unrotatedH - visualCx; pdfRot = -rotate - 90 }
    else if (pageRotation === 180) { pdfCx = unrotatedW - visualCx; pdfCy = visualCy; pdfRot = -rotate - 180 }
    else if (pageRotation === 270) { pdfCx = unrotatedW - visualCy; pdfCy = visualCx; pdfRot = -rotate - 270 }

    const rad = (pdfRot * Math.PI) / 180
    const pdfX = pdfCx - (finalW / 2 * Math.cos(rad) - finalH / 2 * Math.sin(rad))
    const pdfY = pdfCy - (finalW / 2 * Math.sin(rad) + finalH / 2 * Math.cos(rad))

    targetPage.drawImage(embeddedSig, { x: pdfX, y: pdfY, width: finalW, height: finalH, rotate: degrees(pdfRot) })

    const saved = await pdfDocLib.save()
    const url = URL.createObjectURL(new Blob([saved], { type: 'application/pdf' }))
    Object.assign(document.createElement('a'), { href: url, download: `Signed_${pdfFile.name}` }).click()
  }

  // ─── Render ─────────────────────────────────────────────────────
  const showEditor = pdfFile
  const showSig = !!sigSvgUrl && !isProcessing

  return (
    <div className="app-container">
      <header className="navbar">
        <div className="navbar-brand">
          <Pen size={22} className="brand-icon" />
          <h1>FreeSign</h1>
        </div>
        <p>Sign PDFs directly in your browser — fully private, fully free.</p>
      </header>

      <main className="main-content">
        {/* ── Sidebar ── */}
        <aside className="sidebar">

          {/* Step 1 */}
          <div className="panel">
            <h3>① Upload Document</h3>
            <label className="upload-btn">
              <Upload size={16} />
              <span>{pdfFile ? pdfFile.name : 'Select PDF'}</span>
              <input type="file" accept="application/pdf" onChange={handlePdfUpload} hidden />
            </label>
          </div>

          {/* Step 2 */}
          <div className="panel">
            <h3>② Upload Signature Photo</h3>
            <label className="upload-btn">
              <Upload size={16} />
              <span>{signatureSrc ? 'Change Signature' : 'Select Photo'}</span>
              <input type="file" accept="image/*" onChange={handleSigUpload} hidden />
            </label>

            {/* Preview */}
            {(sigSvgUrl || isProcessing) && (
              <div className="sig-preview-container">
                {isProcessing ? (
                  <div className="loading-state">
                    <Loader2 size={28} className="spin" />
                    <p>Vectorizing…</p>
                    <span className="loading-sub">Tracing ink paths</span>
                  </div>
                ) : (
                  <img src={sigSvgUrl} alt="Signature preview" className="sig-preview" />
                )}
              </div>
            )}
          </div>

          {/* ── Style controls ── */}
          {vectorData && !isProcessing && (
            <div className="panel controls-panel">
              <h3><Sliders size={15} /> Signature Style</h3>

              <div className="setting-group">
                <label>Ink Color</label>
                <input type="color" value={style.color} onChange={e => setSingleStyle('color', e.target.value)} />
              </div>

              <Slider label="Thickness"   min={0.5} max={12}  step={0.5} value={style.thickness}   onChange={v => setSingleStyle('thickness', v)}   unit="px" />
              <Slider label="Smoothness"  min={0}   max={12}  step={1}   value={style.smoothness}  onChange={v => setSingleStyle('smoothness', v)} />
              <Slider label="Curve Tension" min={3} max={12}  step={1}   value={style.tension}     onChange={v => setSingleStyle('tension', v)} />
              <Slider label="Taper Amount" min={0}  max={1}   step={0.05} value={style.taperAmount} onChange={v => setSingleStyle('taperAmount', v)} />
              <Slider label="Texture / Grain" min={0} max={1} step={0.05} value={style.texture}   onChange={v => setSingleStyle('texture', v)} />

              <div className="setting-group">
                <label>End Cap Style</label>
                <div className="segmented">
                  {['round', 'butt', 'square'].map(cap => (
                    <button
                      key={cap}
                      className={`seg-btn${style.linecap === cap ? ' active' : ''}`}
                      onClick={() => setSingleStyle('linecap', cap)}
                    >
                      {cap}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-group toggle-group">
                <label>Taper Mode</label>
                <label className="toggle">
                  <input type="checkbox" checked={style.useTaper} onChange={e => setSingleStyle('useTaper', e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
            </div>
          )}

          {/* Step 3 */}
          <div className="panel">
            <h3>③ Export</h3>
            <button
              className="export-btn"
              disabled={!pdfFile || !vectorData || isProcessing}
              onClick={handleExport}
            >
              <Download size={16} /> Download Signed PDF
            </button>
          </div>

        </aside>

        {/* ── Editor canvas ── */}
        <section className="editor">
          {!showEditor ? (
            <div className="empty-state">
              <Pen size={48} className="empty-icon" />
              <h2>Upload a PDF to get started</h2>
              <p>Your files never leave your device</p>
            </div>
          ) : (
            <div className="pdf-workspace">
              <div className="toolbar">
                <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <span>Page {currentPage} of {numPages}</span>
                <button disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="canvas-container">
                <canvas ref={canvasRef} className="pdf-canvas" />

                {showSig && (
                  <>
                    <img
                      ref={sigRef}
                      src={sigSvgUrl}
                      alt="Draggable signature"
                      className="signature-target"
                      onLoad={handleImageLoad}
                      draggable={false}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: `${frame.current.width}px`,
                        height: `${frame.current.height}px`,
                        transform: `translate(${frame.current.translate[0]}px, ${frame.current.translate[1]}px) rotate(${frame.current.rotate}deg)`,
                      }}
                    />
                    <Moveable
                      target={sigRef}
                      draggable resizable rotatable keepRatio
                      throttleDrag={1} throttleResize={1} throttleRotate={0.5}
                      renderDirections={['nw','n','ne','w','e','sw','s','se']}
                      onDrag={e => {
                        frame.current.translate = e.beforeTranslate
                        e.target.style.transform = `translate(${e.beforeTranslate[0]}px, ${e.beforeTranslate[1]}px) rotate(${frame.current.rotate}deg)`
                      }}
                      onResize={e => {
                        frame.current.width = e.width
                        frame.current.height = e.height
                        frame.current.translate = e.drag.beforeTranslate
                        e.target.style.width = `${e.width}px`
                        e.target.style.height = `${e.height}px`
                        e.target.style.transform = `translate(${e.drag.beforeTranslate[0]}px, ${e.drag.beforeTranslate[1]}px) rotate(${frame.current.rotate}deg)`
                      }}
                      onRotate={e => {
                        frame.current.rotate = e.beforeRotate
                        e.target.style.transform = `translate(${frame.current.translate[0]}px, ${frame.current.translate[1]}px) rotate(${e.beforeRotate}deg)`
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
