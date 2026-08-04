import cv2
import numpy as np
import fitz  # PyMuPDF
from PIL import Image
import os

def process_signature(input_path, output_path):
    """Reads a signature photo, removes background, squares it, and saves as transparent PNG."""
    img = cv2.imread(input_path)
    if img is None:
        raise ValueError(f"Error loading {input_path}")
        
    scale_percent = 400
    width = int(img.shape[1] * scale_percent / 100)
    height = int(img.shape[0] * scale_percent / 100)
    dim = (width, height)
    img_high_res = cv2.resize(img, dim, interpolation=cv2.INTER_CUBIC)
    
    gray = cv2.cvtColor(img_high_res, cv2.COLOR_BGR2GRAY)
    
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                   cv2.THRESH_BINARY, 201, 25)
    alpha = 255 - thresh
    
    # Smooth edges but keep crisp look
    alpha = cv2.GaussianBlur(alpha, (7, 7), 0)
    _, alpha = cv2.threshold(alpha, 50, 255, cv2.THRESH_BINARY)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    
    # Deskew and crop
    coords_xy = np.column_stack(np.where(alpha > 0))[:, ::-1]
    if len(coords_xy) > 0:
        rect = cv2.minAreaRect(coords_xy)
        (cx, cy), (w, h), angle = rect
        if w < h:
            angle = angle - 90
        if angle < -45:
            angle = angle + 90
        elif angle > 45:
            angle = angle - 90
            
        angle = angle * 0.5
        M = cv2.getRotationMatrix2D((cx, cy), angle, 1.0)
        alpha = cv2.warpAffine(alpha, M, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        
        coords = np.column_stack(np.where(alpha > 0))
        if len(coords) > 0:
            y_min, x_min = coords.min(axis=0)
            y_max, x_max = coords.max(axis=0)
            pad = 50
            y_min = max(0, y_min - pad)
            y_max = min(height, y_max + pad)
            x_min = max(0, x_min - pad)
            x_max = min(width, x_max + pad)
            alpha = alpha[y_min:y_max, x_min:x_max]
            height, width = alpha.shape

    ink = np.zeros((height, width, 4), dtype=np.uint8)
    ink[:, :, 0] = 130 # B
    ink[:, :, 1] = 50  # G
    ink[:, :, 2] = 20  # R
    ink[:, :, 3] = alpha
    
    cv2.imwrite(output_path, ink)
    return output_path

def sign_pdf(pdf_path, img_path, output_path):
    """Inserts a signature image naturally into a PDF document near the word 'Signature:'."""
    doc = fitz.open(pdf_path)
    page = doc[-1]
    text_instances = page.search_for("signature")
    
    img = Image.open(img_path)
    img_w, img_h = img.size
    aspect_ratio = img_w / img_h
    
    sig_w = 110.0
    sig_h = sig_w / aspect_ratio
    
    if text_instances:
        inst = text_instances[-1]
        x0 = inst.x1 + 10
        y1 = inst.y1
        y0 = y1 - sig_h
        x1 = x0 + sig_w
        img_rect = fitz.Rect(x0, y0, x1, y1)
    else:
        page_rect = page.rect
        margin = 50
        img_rect = fitz.Rect(
            page_rect.width - margin - sig_w,
            page_rect.height - margin - sig_h,
            page_rect.width - margin,
            page_rect.height - margin
        )
        
    page.insert_image(img_rect, filename=img_path)
    doc.save(output_path)
    doc.close()
    return output_path

def process_and_sign(sig_photo_path, pdf_path, output_pdf_path):
    """End-to-end pipeline."""
    temp_img_path = "temp_digital_signature.png"
    process_signature(sig_photo_path, temp_img_path)
    sign_pdf(pdf_path, temp_img_path, output_pdf_path)
    if os.path.exists(temp_img_path):
        os.remove(temp_img_path)
