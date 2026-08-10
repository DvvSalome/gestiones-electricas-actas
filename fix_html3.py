import re

ref_path = "/Users/isaias/Downloads/Untitled document (2).md"
target_path = "web/index.html"

with open(ref_path, "r") as f:
    ref_content = f.read()

with open(target_path, "r") as f:
    target_content = f.read()

# Clean reference content (remove escaping backslashes)
clean_ref = ref_content.replace(r'\<', '<').replace(r'\>', '>').replace(r'\-', '-').replace(r'\_', '_').replace(r'\=', '=').replace(r'\!', '!')

# Extract from reference
cliente_activo_start = '<!-- CLIENTE -->'
cliente_activo_end = r'<div class="row2" style="margin-top:14px;">'
match = re.search(rf'{cliente_activo_start}.*?(?={cliente_activo_end})', clean_ref, re.DOTALL)
new_html = match.group(0) if match else None

if new_html:
    # In target, replace from F6.7 to <div class="field-row"> where Telefono is.
    target_start = '<!-- F6.7: identidad de sede'
    target_end = r'<div class="field-row">\s*<div class="field">\s*<span class="label">Teléfono Cliente</span>'
    
    target_content = re.sub(rf'{target_start}.*?(?={target_end})', new_html, target_content, flags=re.DOTALL)
    
    with open(target_path, "w") as f:
        f.write(target_content)
    print("Fixed HTML correctly.")
else:
    print("Could not extract from reference.")
