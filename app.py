import tkinter as tk
from tkinter import filedialog, messagebox
import os
import core

class AutoSignApp:
    def __init__(self, root):
        self.root = root
        self.root.title("AutoSign")
        self.root.geometry("450x350")
        self.root.resizable(False, False)
        
        self.sig_path = None
        self.pdf_path = None
        
        # Title
        tk.Label(root, text="AutoSign", font=("Helvetica", 20, "bold")).pack(pady=15)
        tk.Label(root, text="Digitize your signature & sign PDFs seamlessly.").pack(pady=5)
        
        # Step 1: Signature
        frame1 = tk.Frame(root)
        frame1.pack(pady=10, fill="x", padx=20)
        tk.Label(frame1, text="1. Signature Photo:").pack(side="left")
        self.btn_sig = tk.Button(frame1, text="Browse Image", command=self.select_sig)
        self.btn_sig.pack(side="right")
        self.lbl_sig = tk.Label(root, text="No image selected", fg="gray")
        self.lbl_sig.pack()
        
        # Step 2: PDF
        frame2 = tk.Frame(root)
        frame2.pack(pady=10, fill="x", padx=20)
        tk.Label(frame2, text="2. PDF Document:").pack(side="left")
        self.btn_pdf = tk.Button(frame2, text="Browse PDF", command=self.select_pdf)
        self.btn_pdf.pack(side="right")
        self.lbl_pdf = tk.Label(root, text="No PDF selected", fg="gray")
        self.lbl_pdf.pack()
        
        # Step 3: Run
        self.btn_run = tk.Button(root, text="Sign Document!", font=("Helvetica", 14, "bold"), 
                                 bg="green", fg="white", command=self.run, state="disabled")
        self.btn_run.pack(pady=30)
        
    def select_sig(self):
        path = filedialog.askopenfilename(filetypes=[("Image Files", "*.png *.jpg *.jpeg")])
        if path:
            self.sig_path = path
            self.lbl_sig.config(text=os.path.basename(path), fg="black")
            self.check_ready()
            
    def select_pdf(self):
        path = filedialog.askopenfilename(filetypes=[("PDF Files", "*.pdf")])
        if path:
            self.pdf_path = path
            self.lbl_pdf.config(text=os.path.basename(path), fg="black")
            self.check_ready()
            
    def check_ready(self):
        if self.sig_path and self.pdf_path:
            self.btn_run.config(state="normal")
            
    def run(self):
        out_path = filedialog.asksaveasfilename(
            defaultextension=".pdf",
            initialfile="signed_" + os.path.basename(self.pdf_path),
            filetypes=[("PDF Files", "*.pdf")]
        )
        
        if not out_path:
            return
            
        try:
            self.btn_run.config(text="Processing...", state="disabled")
            self.root.update()
            
            core.process_and_sign(self.sig_path, self.pdf_path, out_path)
            
            messagebox.showinfo("Success", f"Document signed successfully!\nSaved to:\n{out_path}")
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred:\n{str(e)}")
        finally:
            self.btn_run.config(text="Sign Document!", state="normal")

if __name__ == "__main__":
    root = tk.Tk()
    app = AutoSignApp(root)
    root.mainloop()
