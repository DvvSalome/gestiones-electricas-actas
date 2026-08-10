import re

ref_path = "/Users/isaias/Downloads/Untitled document (2).md"
target_path = "web/index.html"

with open(ref_path, "r") as f:
    ref_content = f.read()

with open(target_path, "r") as f:
    target_content = f.read()

# 1. Clean the reference markdown escapes
clean_ref = ref_content.replace(r'\<', '<').replace(r'\>', '>').replace(r'\-', '-').replace(r'\_', '_').replace(r'\=', '=').replace(r'\!', '!')

# 2. Extract CSS and insert just inside the <style> tag
css_match = re.search(r'<style>(.*?)</style>', clean_ref, re.DOTALL)
if css_match:
    new_css = css_match.group(1)
    target_content = target_content.replace('<style>', f'<style>\n{new_css}\n')

# 3. Extract JS and append just before </body>
js_match = re.search(r'<script>(.*?)</script>', clean_ref, re.DOTALL)
if js_match:
    new_js = f'<script>{js_match.group(1)}</script>'
    target_content = target_content.replace('</body>', f'{new_js}\n</body>')

# 4. Extract HTML block (Cliente/Activo and Modals)
# We want from <!-- CLIENTE --> to just before the row with "Teléfono Cliente"
html_match = re.search(r'<!-- CLIENTE -->.*?(?=<div class="row2" style="margin-top:14px;">)', clean_ref, re.DOTALL)
new_html = html_match.group(0) if html_match else None

# We also want the Floating panels
panels_match = re.search(r'<!-- PANEL LATERAL: Crear Cliente -->.*?</div>\s*</div>\s*(?=<script>)', clean_ref, re.DOTALL)
new_panels = panels_match.group(0) if panels_match else None

if new_html:
    target_start = '<!-- F6.7: identidad de sede'
    target_end = r'<div class="field-row">\s*<div class="field">\s*<span class="label">Teléfono Cliente</span>'
    target_content = re.sub(rf'{target_start}.*?(?={target_end})', new_html, target_content, flags=re.DOTALL)

if new_panels:
    # Insert floating panels right before </body>
    target_content = target_content.replace('</body>', f'{new_panels}\n</body>')

with open(target_path, "w") as f:
    f.write(target_content)
    
print("Successfully processed index.html!")
