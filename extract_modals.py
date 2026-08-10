import re

ref_path = "/Users/isaias/Downloads/Untitled document (2).md"

with open(ref_path, "r") as f:
    ref_content = f.read()

clean_ref = ref_content.replace(r'\<', '<').replace(r'\>', '>').replace(r'\-', '-').replace(r'\_', '_').replace(r'\=', '=').replace(r'\!', '!')

# The section is called "NUEVO CLIENTE — INFRAESTRUCTURA ELÉCTRICA"
# I will match from "<!-- ============ NUEVO CLIENTE" to the last </div> before <script>

match = re.search(r'<!-- ============ NUEVO CLIENTE.*?</div>\s*</div>\s*(?=<script>)', clean_ref, re.DOTALL)
if match:
    with open("prototype_modals.html", "w") as f:
        f.write(match.group(0))
    print("Modals extracted!")
else:
    print("Failed to match modals.")
