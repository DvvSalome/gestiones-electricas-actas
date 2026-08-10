import re

with open("web/index.html", "r") as f:
    html = f.read()

with open("prototype_styles.css", "r") as f:
    new_css = f.read()

# Inject the new CSS right before the closing </style> tag
injected_css = f"\n    /* ==========================================\n       NUEVOS ESTILOS PARA COMBOBOX Y MODALES\n       ========================================== */\n{new_css}\n"

html = html.replace("</style>", injected_css + "</style>", 1)

with open("web/index.html", "w") as f:
    f.write(html)
print("CSS Injected!")
