# -*- coding: utf-8 -*-
with open("js/app.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Extract the share and import methods block
start_marker = "// --- DESTE PAYLAŞMA & İÇE AKTARMA SİSTEMİ (v2.8.8) ---"
end_marker = "bindCardsTab();"

pos_start = text.find(start_marker)
pos_end = text.find(end_marker)

if pos_start != -1 and pos_end != -1:
    methods_block = text[pos_start:pos_end].strip()

    # In init(): replace "this.\n  // --- DESTE..." up to "bindCardsTab();" with proper calls:
    # this.bindCardsTab();
    # this.bindImportDeckModal();
    init_replace_target = text[text.find("this.\n  // --- DESTE"):pos_end + len(end_marker)]
    init_replacement = """this.bindCardsTab();
    this.bindImportDeckModal();"""

    text = text.replace(init_replace_target, init_replacement)

    # Now append methods_block right before the last closing brace of class WortMeisterApp or before window.wmApp = new WortMeisterApp()
    last_brace_marker = "window.wmApp = new WortMeisterApp();"
    pos_last = text.find(last_brace_marker)
    if pos_last != -1:
        text = text[:pos_last] + "\n  " + methods_block + "\n}\n\n" + text[pos_last:]
        print("Moved methods to class level successfully!")
    else:
        print("WARNING: Could not find last_brace_marker")
else:
    print("WARNING: Markers not found")

with open("js/app.js", "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS: js/app.js repaired.")
