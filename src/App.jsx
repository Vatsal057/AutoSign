import { useState, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument } from 'pdf-lib'
import { processSignature } from './imageProcessor'
import { Upload, Download, Trash2, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null) // pdf.js document
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  
  const [signatureSrc, setSignatureSrc] = useState(null)
  const [processedSignature, setProcessedSignature] = useState(null)
  
  const [sigColor, setSigColor] = useState('#000f55') // Deep Blue
  const [sigScale, setSigScale] = useState(1)
  
  // Drag state
  const [sigPos, setSigPos] = useState({ x: 100, y: 100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const canvasRef = useRef(null)

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

  // Process signature image when source or color changes
  useEffect(() => {
    if (!signatureSrc) return;
    processSignature(signatureSrc, sigColor).then(res => setProcessedSignature(res))
  }, [signatureSrc, sigColor])

  const handlePdfUpload = (e) => {
    if (e.target.files[0]) setPdfFile(e.target.files[0])
  }

  const handleSigUpload = (e) => {
    if (e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0])
      setSignatureSrc(url)
    }
  }

  const handleExport = async () => {
    if (!pdfFile || !processedSignature) return

    const arrayBuffer = await pdfFile.arrayBuffer()
    const pdfDocLib = await PDFDocument.load(arrayBuffer)
    
    // Embed signature
    const sigImageBytes = await fetch(processedSignature).then(res => res.arrayBuffer())
    const embeddedSig = await pdfDocLib.embedPng(sigImageBytes)

    const pages = pdfDocLib.getPages()
    // pdf-lib pages are 0-indexed
    const targetPage = pages[currentPage - 1]
    
    const { width, height } = targetPage.getSize()
    const canvas = canvasRef.current

    // Convert coordinates from DOM (canvas) scale to PDF internal scale
    const scaleX = width / canvas.width
    const scaleY = height / canvas.height
    
    // Calculate final dimensions
    const finalWidth = embeddedSig.width * sigScale * scaleX
    const finalHeight = embeddedSig.height * sigScale * scaleY
    
    // PDF coordinates have (0,0) at bottom-left, DOM has (0,0) at top-left
    const pdfX = sigPos.x * scaleX
    const pdfY = height - (sigPos.y * scaleY) - finalHeight

    targetPage.drawImage(embeddedSig, {
      x: pdfX,
      y: pdfY,
      width: finalWidth,
      height: finalHeight,
    })

    const pdfBytes = await pdfDocLib.save()
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `Signed_${pdfFile.name}`
    link.click()
  }

  // Drag handlers
  const onMouseDown = (e) => {
    setIsDragging(true)
    const rect = e.target.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  const onMouseMove = (e) => {
    if (!isDragging) return
    const containerRect = canvasRef.current.parentElement.getBoundingClientRect()
    let newX = e.clientX - containerRect.left - dragOffset.x
    let newY = e.clientY - containerRect.top - dragOffset.y
    setSigPos({ x: newX, y: newY })
  }

  const onMouseUp = () => {
    setIsDragging(false)
  }

  return (
    <div className="app-container" onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
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
            <h3>2. Upload Signature</h3>
            <label className="upload-btn">
              <Upload size={18} /> {signatureSrc ? "Change Signature" : "Select Signature Photo"}
              <input type="file" accept="image/*" onChange={handleSigUpload} hidden />
            </label>
            {processedSignature && (
              <div className="sig-preview-container">
                <img src={processedSignature} alt="Processed Signature" className="sig-preview" />
              </div>
            )}
          </div>

          {processedSignature && (
            <div className="panel settings-panel">
              <h3><Settings size={18} /> Settings</h3>
              
              <div className="setting-group">
                <label>Ink Color:</label>
                <input type="color" value={sigColor} onChange={e => setSigColor(e.target.value)} />
              </div>

              <div className="setting-group">
                <label>Signature Size:</label>
                <input type="range" min="0.1" max="2" step="0.1" value={sigScale} onChange={e => setSigScale(parseFloat(e.target.value))} />
              </div>
            </div>
          )}

          <div className="panel export-panel">
            <h3>3. Export</h3>
            <button className="export-btn" disabled={!pdfFile || !processedSignature} onClick={handleExport}>
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
                
                {processedSignature && (
                  <img 
                    src={processedSignature} 
                    alt="Draggable Signature" 
                    className="draggable-sig"
                    draggable="false"
                    onMouseDown={onMouseDown}
                    style={{
                      left: sigPos.x,
                      top: sigPos.y,
                      transform: `scale(${sigScale})`,
                      transformOrigin: 'top left',
                      cursor: isDragging ? 'grabbing' : 'grab'
                    }}
                  />
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
