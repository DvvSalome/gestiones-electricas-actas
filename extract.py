import re

ref_path = "/Users/isaias/Downloads/Untitled document (2).md"

with open(ref_path, "r") as f:
    ref_content = f.read()

# Clean reference content
clean_ref = ref_content.replace(r'\<', '<').replace(r'\>', '>').replace(r'\-', '-').replace(r'\_', '_').replace(r'\=', '=').replace(r'\!', '!')

# Extract CSS
css_match = re.search(r'<style>(.*?)</style>', clean_ref, re.DOTALL)
if css_match:
    with open("prototype_styles.css", "w") as f:
        f.write(css_match.group(1))

# Extract JS
js_match = re.search(r'<script>(.*?)</script>', clean_ref, re.DOTALL)
if js_match:
    with open("prototype_logic.js", "w") as f:
        f.write(js_match.group(1))

# Extract HTML Client/Asset block
html_match = re.search(r'<!-- CLIENTE -->.*?(?=<div class="row2" style="margin-top:14px;">)', clean_ref, re.DOTALL)
if html_match:
    with open("prototype_combos.html", "w") as f:
        f.write(html_match.group(0))

# Extract HTML Modals
panels_match = re.search(r'<!-- PANEL LATERAL: Crear Cliente -->.*?</div>\s*</div>\s*(?=<script>)', clean_ref, re.DOTALL)
if panels_match:
    with open("prototype_modals.html", "w") as f:
        f.write(panels_match.group(0))

print("Extraction complete.")
