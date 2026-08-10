import re
import os

ref_path = "/Users/isaias/Downloads/Untitled document (2).md"
target_path = "web/index.html"

with open(ref_path, "r") as f:
    ref_content = f.read()

with open(target_path, "r") as f:
    target_content = f.read()

# Replace <style> block
css_match = re.search(r'<style>(.*?)</style>', ref_content, re.DOTALL)
if css_match:
    target_content = re.sub(r'<style>.*?</style>', f'<style>{css_match.group(1)}</style>', target_content, flags=re.DOTALL)

# Replace <script> block at the bottom
js_match = re.search(r'<script>(.*?)</script>', ref_content, re.DOTALL)
if js_match:
    target_content = re.sub(r'<script>.*?</script>', f'<script>{js_match.group(1)}</script>', target_content, flags=re.DOTALL)

# Replace Cliente HTML
cliente_html_start = '<!-- F6.7: identidad de sede'
cliente_html_end = '<!-- FECHA -->'
cliente_match = re.search(rf'{cliente_html_start}.*?(?={cliente_html_end})', ref_content, re.DOTALL)
if cliente_match:
    target_content = re.sub(rf'{cliente_html_start}.*?(?={cliente_html_end})', cliente_match.group(0), target_content, flags=re.DOTALL)

# Replace Activo HTML
activo_html_start = '<!-- Detalle de Activo'
activo_html_end = '<!-- /FIN SECCIÓN ACTIVO -->'
activo_match = re.search(rf'{activo_html_start}.*?{activo_html_end}', ref_content, re.DOTALL)
if activo_match:
    target_content = re.sub(rf'{activo_html_start}.*?{activo_html_end}', activo_match.group(0), target_content, flags=re.DOTALL)

# Add Floating panels to the end of the body (before <script>)
panels_start = '<!-- PANEL LATERAL: Crear Cliente -->'
panels_end = '<!-- PANEL LATERAL: Modificar Lectura SPT -->'
panels_match = re.search(rf'{panels_start}.*?</div>\s*</div>\s*(?=<script>)', ref_content, re.DOTALL)
if panels_match:
    if panels_start not in target_content:
        # insert before <script>
        target_content = re.sub(r'(<script>)', f'{panels_match.group(0)}\n\n\\1', target_content)
    else:
        target_content = re.sub(rf'{panels_start}.*?(?=<script>)', panels_match.group(0), target_content, flags=re.DOTALL)

with open(target_path, "w") as f:
    f.write(target_content)

print("Migration completed.")
