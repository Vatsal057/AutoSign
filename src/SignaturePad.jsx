import React, { useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from './signatureUtils';

export function SignaturePad({ strokes, setStrokes, thickness, smoothing, taper, color }) {
  const [currentStroke, setCurrentStroke] = useState(null);

  function handlePointerDown(e) {
    e.target.setPointerCapture(e.pointerId);
    const rect = e.target.getBoundingClientRect();
    setCurrentStroke([[e.clientX - rect.left, e.clientY - rect.top, e.pressure]]);
  }

  function handlePointerMove(e) {
    if (e.buttons !== 1 || !currentStroke) return;
    const rect = e.target.getBoundingClientRect();
    setCurrentStroke([...currentStroke, [e.clientX - rect.left, e.clientY - rect.top, e.pressure]]);
  }

  function handlePointerUp() {
    if (!currentStroke) return;
    setStrokes([...strokes, currentStroke]);
    setCurrentStroke(null);
  }

  function handleClear() {
    setStrokes([]);
  }

  const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        style={{ 
          width: '100%', 
          height: '200px', 
          background: '#ffffff', 
          border: '1px dashed #94a3b8', 
          borderRadius: '0.5rem', 
          touchAction: 'none',
          cursor: 'crosshair'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <filter id="pad-ink-texture">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {allStrokes.map((stroke, i) => {
          const pathData = getSvgPathFromStroke(
            getStroke(stroke, {
              size: thickness,
              thinning: taper,
              smoothing: smoothing,
              streamline: 0.5,
            })
          );
          return <path key={i} d={pathData} fill={color} filter="url(#pad-ink-texture)" />;
        })}
      </svg>
      {strokes.length > 0 && (
        <button 
          onClick={handleClear}
          style={{ 
            position: 'absolute', 
            top: 10, 
            right: 10, 
            fontSize: '12px', 
            padding: '4px 8px', 
            background: '#f1f5f9', 
            border: '1px solid #cbd5e1', 
            borderRadius: '4px', 
            cursor: 'pointer',
            color: '#475569',
            fontWeight: '500'
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
