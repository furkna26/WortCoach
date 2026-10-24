# -*- coding: utf-8 -*-
with open("index.html", "r", encoding="utf-8") as f:
    html = f.read()

start_marker = "<!-- 0ms Morfoloji Örnek Hapları (Pills) -->"
pos_start = html.find(start_marker)
if pos_start == -1:
    pos_start = html.find("Anlık Morfoloji Örnekleri")
    if pos_start != -1:
        # find preceding <div
        pos_start = html.rfind('<div style="margin-bottom: 20px;">', 0, pos_start)

if pos_start != -1:
    end_marker = "<!-- Son Desteler -->"
    pos_end = html.find(end_marker, pos_start)
    if pos_end != -1:
        html = html[:pos_start] + html[pos_end:]
        print("Successfully removed 'Anlık Morfoloji Örnekleri' section from index.html.")
    else:
        print("WARNING: Could not find end_marker")
else:
    print("WARNING: Could not find start_marker")

# Bump version to 2.8.9 in index.html and sw.js
html = html.replace('?v=2.8.8', '?v=2.8.9')
print("Bumped asset versions to 2.8.9")

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)
