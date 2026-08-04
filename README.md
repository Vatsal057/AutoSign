# AutoSign

A simple, open-source desktop utility that takes a photo of your hand-written signature, seamlessly removes the background, cleans it up to look like a perfectly crisp digital ink stroke, and securely embeds it into any PDF.

![AutoSign Preview](https://via.placeholder.com/800x400?text=AutoSign+Screenshot)

## Features
- **Auto-Deskew**: Automatically detects the angle of your signature and perfectly squares it.
- **Background Removal & Cleanup**: Uses adaptive thresholding to perfectly isolate your ink from the paper, leaving behind crisp, authentic-looking pen strokes.
- **Smart PDF Insertion**: Programmatically inserts the signature perfectly on the baseline of the target "Signature:" field, avoiding overlap with other document text.
- **100% Local**: No cloud APIs. Your sensitive documents and signature stay entirely on your machine.

## Download & Run
You do not need to be a developer to use AutoSign!
Head over to the [Releases](https://github.com/vatsal/AutoSign/releases) tab and download the standalone app for Windows or macOS. Double-click to run.

## Development Setup
If you want to run from source or contribute to the project:

```bash
# Clone the repository
git clone https://github.com/vatsal/AutoSign.git
cd AutoSign

# Set up virtual environment and install dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run the app
python app.py
```

## How to Build the Executable
We use PyInstaller to build the standalone app. A GitHub Action handles this automatically, but you can build locally:

```bash
pip install pyinstaller
pyinstaller --noconsole --onefile --name AutoSign app.py
```

## License
MIT License
