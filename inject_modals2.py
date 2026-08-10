import re

with open("web/index.html", "r") as f:
    html = f.read()

with open("prototype_modals.html", "r") as f:
    modals = f.read()

pattern = re.compile(r'(<script[^>]*src="/js/pwa\.js"[^>]*></script>)', re.IGNORECASE)
match = pattern.search(html)

if match:
    new_html = html[:match.start()] + "\n" + modals + "\n\n" + html[match.start():]
    with open("web/index.html", "w") as f:
        f.write(new_html)
    print("Modals injected!")
else:
    print("Could not find insertion point for modals.")
