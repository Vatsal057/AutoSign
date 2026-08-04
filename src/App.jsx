import { useState, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { PDFDocument, degrees } from 'pdf-lib'
import { processSignature } from './imageProcessor'
import { Upload, Download, ChevronLeft, ChevronRight, Settings, Loader2, PenTool, Image as ImageIcon } from 'lucide-react'
import Moveable from 'react-moveable'
import { SignaturePad } from './SignaturePad'
import { strokesToPngUrl, vectorizePathsToPngUrl } from './signatureUtils'
import { vectorizeSignature } from './vectorizer'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  
  const [signatureMode, setSignatureMode] = useState('draw') // 'upload' or 'draw'
  
  const [signatureSrc, setSignatureSrc] = useState(null)
  const [processedSignature, setProcessedSignature] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadedVectorPaths, setUploadedVectorPaths] = useState([])
  
  // Digital Ink State
  const [drawnStrokes, setDrawnStrokes] = useState([])
  const [inkThickness, setInkThickness] = useState(8)
  const [inkSmoothing, setInkSmoothing] = useState(0.5)
  const [inkTaper, setInkTaper] = useState(0.6)
  
  const [sigColor, setSigColor] = useState('#000f55')
  
  const canvasRef = useRef(null)
  const sigRef = useRef(null)
  
  // Transform State for Moveable
  const frame = useRef({
    translate: [100, 100],
    rotate: 0,
    width: 250,
    height: 100,
  })

  // Load PDF
  useEffect(() => {
    if (!pdfFile) return;
    const loadPdf = async () => {
      const arrayBuffer = await pdfFile.arrayBuffer()
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      setPdfDoc(loadedPdf)
      setNumPages(loadedPdf.numPages)
      setCurrentPage(1)
    }
    loadPdf()
  }, [pdfFile])

  // Render PDF Page
  useEffect(() => {
    if (!pdfDoc) return;
    const renderPage = async () => {
      const page = await pdfDoc.getPage(currentPage)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')
      
      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
    }
    renderPage()
  }, [pdfDoc, currentPage])

  // Process uploaded signature image
  useEffect(() => {
    if (signatureMode === 'upload' && signatureSrc) {
      setIsProcessing(true)
      setTimeout(() => {
        // Step 1: Remove background
        processSignature(signatureSrc, sigColor).then(res => {
          // Step 2: Auto-Trace to Vector
          vectorizeSignature(res, inkSmoothing).then(paths => {
             setUploadedVectorPaths(paths)
          })
        })
      }, 100)
    }
  }, [signatureSrc, sigColor, signatureMode, inkSmoothing])

  // Apply Digital Ink styling to Uploaded Vectors
  useEffect(() => {
    if (signatureMode === 'upload' && uploadedVectorPaths.length > 0) {
      vectorizePathsToPngUrl(uploadedVectorPaths, inkThickness, sigColor).then(url => {
        setProcessedSignature(url)
        setIsProcessing(false)
      })
    }
  }, [uploadedVectorPaths, inkThickness, sigColor, signatureMode])

  // Process drawn digital ink
  useEffect(() => {
    if (signatureMode === 'draw') {
      if (drawnStrokes.length > 0) {
         strokesToPngUrl(drawnStrokes, inkThickness, inkSmoothing, inkTaper, sigColor).then(url => {
            setProcessedSignature(url)
         })
      } else {
         setProcessedSignature(null)
      }
    }
  }, [drawnStrokes, inkThickness, inkSmoothing, inkTaper, sigColor, signatureMode])

  const handlePdfUpload = (e) => {
    if (e.target.files[0]) setPdfFile(e.target.files[0])
  }

  const handleSigUpload = (e) => {
    if (e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0])
      setSignatureSrc(url)
    }
  }

  const handleImageLoad = (e) => {
    if (frame.current.height !== 100 && signatureMode === 'upload') return; 
    // Always recalculate aspect ratio when drawn ink updates, but keep translate/rotate state
    const ratio = e.target.naturalHeight / e.target.naturalWidth;
    const initialWidth = signatureMode === 'draw' ? 200 : 250;
    const initialHeight = initialWidth * ratio;
    
    frame.current.width = initialWidth;
    frame.current.height = initialHeight;
    
    e.target.style.width = `${initialWidth}px`;
    e.target.style.height = `${initialHeight}px`;
    e.target.style.transform = `translate(${frame.current.translate[0]}px, ${frame.current.translate[1]}px) rotate(${frame.current.rotate}deg)`;
  }

  const handleExport = async () => {
    if (!pdfFile || !processedSignature) return

    const arrayBuffer = await pdfFile.arrayBuffer()
    const pdfDocLib = await PDFDocument.load(arrayBuffer)
    
    const sigImageBytes = await fetch(processedSignature).then(res => res.arrayBuffer())
    const embeddedSig = await pdfDocLib.embedPng(sigImageBytes)

    const pages = pdfDocLib.getPages()
    const targetPage = pages[currentPage - 1]
    
    const { width: unrotatedW, height: unrotatedH } = targetPage.getSize()
    const pageRotation = targetPage.getRotation().angle || 0;
    
    let visualPdfW = unrotatedW;
    let visualPdfH = unrotatedH;
    
    if (pageRotation === 90 || pageRotation === 270) {
      visualPdfW = unrotatedH;
      visualPdfH = unrotatedW;
    }

    const canvas = canvasRef.current
    const scaleX = visualPdfW / canvas.width
    const scaleY = visualPdfH / canvas.height
    
    const { translate, rotate, width: sigDOMWidth, height: sigDOMHeight } = frame.current;
    
    const finalWidth = sigDOMWidth * scaleX
    const finalHeight = sigDOMHeight * scaleY
    
    // DOM visual top-left coordinates
    const visualX = translate[0] * scaleX;
    const visualY = translate[1] * scaleY;
    
    // Center of the signature in visual space
    const visualCx = visualX + finalWidth / 2;
    const visualCy = visualY + finalHeight / 2;

    let pdfCx = 0;
    let pdfCy = 0;
    let pdfRotation = 0;

    // Map visual center to unrotated page center
    if (pageRotation === 0) {
      pdfCx = visualCx;
      pdfCy = unrotatedH - visualCy;
      pdfRotation = -rotate;
    } else if (pageRotation === 90) {
      pdfCx = visualCy;
      pdfCy = unrotatedH - visualCx;
      pdfRotation = -rotate - 90;
    } else if (pageRotation === 180) {
      pdfCx = unrotatedW - visualCx;
      pdfCy = visualCy;
      pdfRotation = -rotate - 180;
    } else if (pageRotation === 270) {
      pdfCx = unrotatedW - visualCy;
      pdfCy = visualCx;
      pdfRotation = -rotate - 270;
    }

    // pdf-lib drawImage rotates around the bottom-left corner of the image.
    // Calculate where the bottom-left corner needs to be so the image is centered at (pdfCx, pdfCy)
    const angleRad = (pdfRotation * Math.PI) / 180;
    const pdfX = pdfCx - (finalWidth / 2 * Math.cos(angleRad) - finalHeight / 2 * Math.sin(angleRad));
    const pdfY = pdfCy - (finalWidth / 2 * Math.sin(angleRad) + finalHeight / 2 * Math.cos(angleRad));

    targetPage.drawImage(embeddedSig, {
      x: pdfX,
      y: pdfY,
      width: finalWidth,
      height: finalHeight,
      rotate: degrees(pdfRotation)
    })

    const pdfBytes = await pdfDocLib.save()
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `Signed_${pdfFile.name}`
    link.click()
  }

  return (
    <div className="app-container">
      <header className="navbar">
        <h1>FreeSign</h1>
        <p>Sign PDFs directly in your browser. Fast, free, and secure.</p>
      </header>
      
      <main className="main-content">
        <aside className="sidebar">
          
          <div className="panel">
            <h3>1. Upload Document</h3>
            <label className="upload-btn">
              <Upload size={18} /> {pdfFile ? pdfFile.name : "Select PDF"}
              <input type="file" accept="application/pdf" onChange={handlePdfUpload} hidden />
            </label>
          </div>

          <div className="panel">
            <h3>2. Signature Source</h3>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button 
                onClick={() => setSignatureMode('draw')}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: signatureMode === 'draw' ? '#e2e8f0' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <PenTool size={16} /> Draw
              </button>
              <button 
                onClick={() => setSignatureMode('upload')}
                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: signatureMode === 'upload' ? '#e2e8f0' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <ImageIcon size={16} /> Upload
              </button>
            </div>

            {signatureMode === 'upload' ? (
              <>
                <label className="upload-btn">
                  <Upload size={18} /> {signatureSrc ? "Change Signature Photo" : "Select Signature Photo"}
                  <input type="file" accept="image/*" onChange={handleSigUpload} hidden />
                </label>
                {(processedSignature || isProcessing) && (
                  <div className="sig-preview-container" style={{ marginTop: '12px' }}>
                    {isProcessing ? (
                      <div className="loading-spinner">
                        <Loader2 className="animate-spin text-blue-500" size={32} />
                        <p>Processing...</p>
                      </div>
                    ) : (
                      <img src={processedSignature} alt="Processed Signature" className="sig-preview" />
                    )}
                  </div>
                )}
              </>
            ) : (
              <SignaturePad 
                strokes={drawnStrokes}
                setStrokes={setDrawnStrokes}
                thickness={inkThickness}
                smoothing={inkSmoothing}
                taper={inkTaper}
                color={sigColor}
              />
            )}
            
          </div>

          {(processedSignature || signatureMode === 'draw') && (
            <div className="panel settings-panel">
              <h3><Settings size={18} /> Settings</h3>
              
              <div className="setting-group">
                <label>Ink Color:</label>
                <input type="color" value={sigColor} onChange={e => setSigColor(e.target.value)} disabled={isProcessing} />
              </div>

              <div className="setting-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px' }}>Thickness</label>
                <input type="range" min="0" max="24" step="1" value={inkThickness} onChange={e => setInkThickness(parseFloat(e.target.value))} />
              </div>
              <div className="setting-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px' }}>Smoothing</label>
                <input type="range" min="0" max="2" step="0.1" value={inkSmoothing} onChange={e => setInkSmoothing(parseFloat(e.target.value))} />
              </div>

              {signatureMode === 'draw' && (
                <div className="setting-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px' }}>End Tapering</label>
                  <input type="range" min="0" max="1" step="0.1" value={inkTaper} onChange={e => setInkTaper(parseFloat(e.target.value))} />
                </div>
              )}
            </div>
          )}

          <div className="panel export-panel">
            <h3>3. Export</h3>
            <button className="export-btn" disabled={!pdfFile || !processedSignature || isProcessing} onClick={handleExport}>
              <Download size={18} /> Export Signed PDF
            </button>
          </div>

        </aside>

        <section className="editor">
          {!pdfFile ? (
            <div className="empty-state">
              <h2>Upload a PDF to get started</h2>
            </div>
          ) : (
            <div className="pdf-workspace">
              <div className="toolbar">
                <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft size={18} />
                </button>
                <span>Page {currentPage} of {numPages}</span>
                <button disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="canvas-container">
                <canvas ref={canvasRef} className="pdf-canvas" />
                
                {processedSignature && !isProcessing && (
                  <>
                    <img 
                      ref={sigRef}
                      src={processedSignature} 
                      alt="Draggable Signature" 
                      className="signature-target"
                      onLoad={handleImageLoad}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: `${frame.current.width}px`,
                        height: `${frame.current.height}px`,
                        transform: `translate(${frame.current.translate[0]}px, ${frame.current.translate[1]}px) rotate(${frame.current.rotate}deg)`,
                        cursor: 'grab'
                      }}
                    />
                    <Moveable
                      target={sigRef}
                      draggable={true}
                      resizable={true}
                      rotatable={true}
                      keepRatio={true}
                      throttleDrag={1}
                      throttleResize={1}
                      throttleRotate={1}
                      renderDirections={["nw","n","ne","w","e","sw","s","se"]}
                      onDrag={e => {
                        frame.current.translate = e.beforeTranslate;
                        e.target.style.transform = `translate(${e.beforeTranslate[0]}px, ${e.beforeTranslate[1]}px) rotate(${frame.current.rotate}deg)`;
                      }}
                      onResize={e => {
                        frame.current.width = e.width;
                        frame.current.height = e.height;
                        frame.current.translate = e.drag.beforeTranslate;
                        e.target.style.width = `${e.width}px`;
                        e.target.style.height = `${e.height}px`;
                        e.target.style.transform = `translate(${e.drag.beforeTranslate[0]}px, ${e.drag.beforeTranslate[1]}px) rotate(${frame.current.rotate}deg)`;
                      }}
                      onRotate={e => {
                        frame.current.rotate = e.beforeRotate;
                        e.target.style.transform = `translate(${frame.current.translate[0]}px, ${frame.current.translate[1]}px) rotate(${e.beforeRotate}deg)`;
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

export default App
