from PIL import Image
import os

source_path = "/Users/ethan/.gemini/antigravity/brain/a6c91b81-3336-4956-af3d-2afc02b63d2e/app_icon_1767756767742.png"
icons_dir = "src-tauri/icons"
sizes = {
    "icon.png": (1024, 1024), # Master icon
    "32x32.png": (32, 32),
    "128x128.png": (128, 128),
    "128x128@2x.png": (256, 256),
    "Square30x30Logo.png": (30, 30),
    "Square44x44Logo.png": (44, 44),
    "StoreLogo.png": (50, 50),
    "Square71x71Logo.png": (71, 71),
    "Square89x89Logo.png": (89, 89),
    "Square107x107Logo.png": (107, 107),
    "Square142x142Logo.png": (142, 142),
    "Square150x150Logo.png": (150, 150),
    "Square284x284Logo.png": (284, 284),
    "Square310x310Logo.png": (310, 310),
}

if not os.path.exists(icons_dir):
    os.makedirs(icons_dir)

try:
    img = Image.open(source_path)
    img = img.convert("RGBA")
    
    print(f"Opened source image: {source_path}")
    
    for filename, size in sizes.items():
        resized = img.resize(size, Image.Resampling.LANCZOS)
        output_path = os.path.join(icons_dir, filename)
        resized.save(output_path, "PNG")
        print(f"Generated {output_path} ({size})")
        
    print("All icons regenerated successfully in PNG format.")
    
except Exception as e:
    print(f"Error: {e}")
