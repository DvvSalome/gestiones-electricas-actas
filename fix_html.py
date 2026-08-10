import re

ref_path = "/Users/isaias/Downloads/Untitled document (2).md"
target_path = "web/index.html"

with open(ref_path, "r") as f:
    ref_content = f.read()

with open(target_path, "r") as f:
    target_content = f.read()

# Extract Cliente and Activo blocks from reference
cliente_activo_start = '<!-- CLIENTE -->'
cliente_activo_end = '      <div><label class="field-label" style="margin-top:0">Teléfono Cliente</label>'
match = re.search(rf'{cliente_activo_start}.*?(?={cliente_activo_end})', ref_content, re.DOTALL)
new_html = match.group(0) if match else None

if new_html:
    # Replace in target
    target_start = '<!-- F6.7: identidad de sede'
    target_end = '<div class="field-row">\n          <div class="field">\n            <span class="label">Teléfono Cliente</span>'
    target_content = re.sub(rf'{target_start}.*?(?={target_end})', new_html, target_content, flags=re.DOTALL)
    
    with open(target_path, "w") as f:
        f.write(target_content)
    print("Fixed HTML.")
else:
    print("Could not extract from reference.")
