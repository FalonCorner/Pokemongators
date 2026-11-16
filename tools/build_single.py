"""Bundles the app into one self-contained HTML file with every sprite embedded.

Usage: python3 tools/build_single.py <sprites-dir> <out.html>
<sprites-dir> holds 1.png ... 1025.png from github.com/PokeAPI/sprites (sprites/pokemon/).
"""
import base64, json, os, re, sys
root = os.path.join(os.path.dirname(__file__), "..")
read = lambda f: open(os.path.join(root, f), encoding="utf-8").read()
sprites = {}
for f in os.listdir(sys.argv[1]):
    m = re.fullmatch(r"(\d+)\.png", f)
    if m:
        sprites[int(m.group(1))] = base64.b64encode(open(os.path.join(sys.argv[1], f), "rb").read()).decode()
html = read("index.html")
body = html[html.index("<body>") + 6: html.index("</body>")]
body = body.replace('<script src="data/pokemon.js"></script>', "<script>" + read("data/pokemon.js") + "\nwindow.SPRITES=" + json.dumps(sprites, separators=(",", ":")) + ";</script>")
body = body.replace('<script src="app.js"></script>', "<script>" + read("app.js") + "</script>")
out = ('<title>Pokémon Gen Matchup</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
       "<style>" + read("style.css") + "</style>\n" + body)
open(sys.argv[2], "w", encoding="utf-8").write(out)
print(sys.argv[2], len(out) // 1024, "KB")
