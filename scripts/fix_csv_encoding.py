import os

def fix_csv_encoding(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

    # Try to read the file
    content = None
    encodings = ['utf-8', 'gbk', 'gb18030', 'utf-16']
    
    used_encoding = None
    for enc in encodings:
        try:
            with open(file_path, 'rb') as f:
                raw_data = f.read()
                content = raw_data.decode(enc)
                used_encoding = enc
                break
        except Exception:
            continue

    if content is None:
        print("Error: Could not determine file encoding.")
        return

    print(f"Detected encoding: {used_encoding}")
    
    # Write back as UTF-8 with BOM (Excel compatible)
    output_path = file_path # Overwrite original
    with open(output_path, 'w', encoding='utf-8-sig') as f:
        f.write(content)
    
    print(f"Successfully converted '{file_path}' to UTF-8 with BOM.")
    print("Now you can open it in Excel or text editors without garbled characters.")

import sys

# ... (main function remains)

if __name__ == "__main__":
    target_file = None
    
    # Kinda support command line args
    if len(sys.argv) > 1:
        target_file = sys.argv[1]
    
    # Fallback to manual input
    if not target_file:
        print("请拖入文件到终端或输入文件路径:")
        target_file = input("File path: ").strip()
        # Handle quotes if user drags and drops file
        if target_file.startswith("'") and target_file.endswith("'"):
            target_file = target_file[1:-1]
        if target_file.startswith('"') and target_file.endswith('"'):
            target_file = target_file[1:-1]

    if target_file:
        fix_csv_encoding(target_file)
    else:
        print("未提供文件路径，操作取消。")
