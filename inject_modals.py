import re

with open("web/index.html", "r") as f:
    html = f.read()

with open("prototype_modals.html", "r") as f:
    modals = f.read()

# Replace before the closing </body> tag or right before the script imports at the bottom.
# I'll look for <!-- Lógica Principal --> or <script src="js/session.js"></script>

pattern = re.compile(r'(<script[^>]*src="js/session\.js"[^>]*></script>)', re.IGNORECASE)
match = pattern.search(html)

if match:
    new_html = html[:match.start()] + "\n" + modals + "\n\n" + html[match.start():]
    with open("web/index.html", "w") as f:
        f.write(new_html)
    print("Modals injected!")
else:
    print("Could not find insertion point for modals.")
