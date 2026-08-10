import re

with open("web/index.html", "r") as f:
    html = f.read()

with open("prototype_modals.html", "r") as f:
    modals = f.read()

# I will find the EXACT string: <script src="/js/pwa.js"></script>
# and replace it with:
# {modals}
# <script src="/js/combos.js"></script>
# <script src="/js/pwa.js"></script>

target = '<script src="/js/pwa.js"></script>'
replacement = modals + '\n  <script src="/js/combos.js"></script>\n  <script src="/js/pwa.js"></script>'

if target in html:
    new_html = html.replace(target, replacement, 1)
    with open("web/index.html", "w") as f:
        f.write(new_html)
    print("Modals and script tag injected!")
else:
    print("Error: Could not find target <script src=\"/js/pwa.js\"></script>")
