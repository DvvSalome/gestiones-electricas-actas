import re

with open("web/index.html", "r") as f:
    html = f.read()

with open("prototype_combos.html", "r") as f:
    combos_html = f.read()

# I will target the block starting with "<!-- F6.7: identidad de sede"
# and ending at the end of the Activo Intervenido div.

pattern = re.compile(
    r'<!-- F6.7: identidad de sede.*?</button>\s*</div>\s*</div>',
    re.DOTALL
)

match = pattern.search(html)
if match:
    new_html = html[:match.start()] + "\n" + combos_html + "\n" + html[match.end():]
    with open("web/index.html", "w") as f:
        f.write(new_html)
    print("HTML combos successfully replaced!")
else:
    print("Error: Could not find target block in index.html")
