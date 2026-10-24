# -*- coding: utf-8 -*-
with open("js/app.js", "r", encoding="utf-8") as f:
    text = f.read()

share_and_import_code = """  // --- DESTE PAYLAŞMA & İÇE AKTARMA SİSTEMİ (v2.8.8) ---
  async openShareDeckModal(deckId) {
    const modal = document.getElementById('modal-share-deck');
    if (!modal) return;

    const decks = await window.wmDB.getAllDecks();
    const deck = decks.find((d) => Number(d.id) === Number(deckId));
    if (!deck) {
      this.showToast('Deste bulunamadı.');
      return;
    }

    const allCards = await window.wmDB.getAllCards();
    const deckCards = allCards.filter((c) => Number(c.deckId) === Number(deckId));

    if (deckCards.length === 0) {
      this.showToast('Bu destede henüz paylaşılacak kart yok.');
      return;
    }

    const nameDisplay = document.getElementById('share-deck-name-display');
    const countDisplay = document.getElementById('share-deck-count-display');
    const sampleDisplay = document.getElementById('share-deck-sample-words');

    if (nameDisplay) nameDisplay.textContent = deck.name;
    if (countDisplay) countDisplay.textContent = `${deckCards.length} Kart`;

    const sampleWords = deckCards.slice(0, 5).map((c) => c.germanWord).join(', ');
    if (sampleDisplay) {
      sampleDisplay.textContent = `Örnek Kelimeler: ${sampleWords}${deckCards.length > 5 ? '...' : ''}`;
    }

    // Paylaşım Veri Paketi Oluştur (WortCoach Formatı)
    const exportData = {
      app: 'WortCoach',
      version: '2.8.8',
      exportedAt: new Date().toISOString(),
      deck: {
        name: deck.name,
        description: deck.description || 'WortCoach Paylaşılan Deste',
        color: deck.color || '#3B82F6'
      },
      cards: deckCards.map((c) => ({
        germanWord: c.germanWord,
        article: c.article || '',
        partOfSpeech: c.partOfSpeech || 'OTHER',
        pluralForm: c.pluralForm || '',
        meaningsTr: c.meaningsTr || '',
        meaningsEn: c.meaningsEn || '',
        exampleSentence: c.exampleSentence || '',
        praesens: c.praesens || '',
        praeteritum: c.praeteritum || '',
        partizipZwei: c.partizipZwei || '',
        hilfsverb: c.hilfsverb || 'hat',
        isSeparable: Boolean(c.isSeparable),
        isReflexive: Boolean(c.isReflexive)
      }))
    };

    const jsonStr = JSON.stringify(exportData, null, 2);

    // 1. Sistem Paylaşımı (Web Share API)
    const btnNative = document.getElementById('btn-share-native');
    if (btnNative) {
      btnNative.onclick = async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: `WortCoach Deste: ${deck.name}`,
              text: `Almanca "${deck.name}" deste paketi (${deckCards.length} kart):\n\n${jsonStr}`
            });
            this.showToast('Deste başarıyla paylaşıldı.');
          } catch (_) {}
        } else {
          await navigator.clipboard.writeText(jsonStr);
          this.showToast('Paylaşım kodu panoya kopyalandı! Arkadaşınıza gönderebilirsiniz. 📋');
        }
      };
    }

    // 2. Panoya Kopyala
    const btnCopy = document.getElementById('btn-share-copy');
    if (btnCopy) {
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(jsonStr);
          this.showToast('Deste kodu panoya kopyalandı! 📋');
        } catch (_) {
          this.showToast('Kopyalama başarısız oldu.');
        }
      };
    }

    // 3. JSON Dosyası Olarak İndir
    const btnDownload = document.getElementById('btn-share-download');
    if (btnDownload) {
      btnDownload.onclick = () => {
        const cleanName = deck.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${cleanName}_WortCoach.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast('Deste JSON dosyası indirildi! 💾');
      };
    }

    const btnClose = document.getElementById('btn-close-share-modal');
    if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
    const btnDone = document.getElementById('btn-done-share-modal');
    if (btnDone) btnDone.onclick = () => modal.classList.add('hidden');

    modal.classList.remove('hidden');
  }

  bindImportDeckModal() {
    const modal = document.getElementById('modal-import-deck');
    const btnOpen = document.getElementById('btn-import-deck');
    const btnClose = document.getElementById('btn-close-import-modal');
    const fileInput = document.getElementById('import-deck-file-input');
    const dropzone = document.getElementById('import-deck-dropzone');
    const jsonText = document.getElementById('import-deck-json-text');
    const previewBox = document.getElementById('import-deck-preview-box');
    const previewName = document.getElementById('import-preview-name');
    const previewCount = document.getElementById('import-preview-count');
    const previewSample = document.getElementById('import-preview-sample');
    const btnDoImport = document.getElementById('btn-do-import-deck');

    if (!modal) return;

    btnOpen?.addEventListener('click', () => {
      modal.classList.remove('hidden');
      if (jsonText) jsonText.value = '';
      if (previewBox) previewBox.classList.add('hidden');
    });

    btnClose?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    });

    const parseAndPreview = (rawStr) => {
      try {
        const parsed = JSON.parse(rawStr.trim());
        let deckName = 'İçe Aktarılan Deste';
        let cardsList = [];

        if (parsed.deck && parsed.deck.name) {
          deckName = parsed.deck.name;
        } else if (parsed.name) {
          deckName = parsed.name;
        }

        if (Array.isArray(parsed.cards)) {
          cardsList = parsed.cards;
        } else if (Array.isArray(parsed)) {
          cardsList = parsed;
        }

        const validCards = cardsList.filter((c) => c && typeof c.germanWord === 'string' && c.germanWord.trim().length > 0);

        if (validCards.length === 0) {
          if (previewBox) previewBox.classList.add('hidden');
          return null;
        }

        if (previewName) previewName.textContent = deckName;
        if (previewCount) previewCount.textContent = `${validCards.length} Kart`;
        const sampleStr = validCards.slice(0, 4).map((c) => c.germanWord).join(', ');
        if (previewSample) previewSample.textContent = `Örnek Kelimeler: ${sampleStr}${validCards.length > 4 ? '...' : ''}`;
        if (previewBox) previewBox.classList.remove('hidden');

        return { deckName, cards: validCards };
      } catch (_) {
        if (previewBox) previewBox.classList.add('hidden');
        return null;
      }
    };

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (jsonText) jsonText.value = content;
        parseAndPreview(content);
      };
      reader.readAsText(file, 'UTF-8');
    });

    jsonText?.addEventListener('input', () => {
      parseAndPreview(jsonText.value);
    });

    btnDoImport?.addEventListener('click', async () => {
      const parsedData = parseAndPreview(jsonText?.value || '');
      if (!parsedData) {
        this.showToast('Lütfen geçerli bir WortCoach JSON deste verisi girin.');
        return;
      }

      btnDoImport.disabled = true;
      btnDoImport.innerHTML = `<span>Yükleniyor...</span>`;

      try {
        // Yeni Deste Oluştur
        const newDeck = await window.wmDB.createDeck(parsedData.deckName);
        let addedCount = 0;

        for (const c of parsedData.cards) {
          const cleanW = (c.germanWord || '').trim();
          if (cleanW) {
            await window.wmDB.addCard({
              ...c,
              germanWord: cleanW,
              deckId: newDeck.id
            });
            addedCount++;
          }
        }

        modal.classList.add('hidden');
        this.showToast(`"${parsedData.deckName}" (${addedCount} kart) başarıyla içe aktarıldı! 🎉`);
        await this.renderDecksTab();
        await this.renderCardsList();
      } catch (err) {
        this.showToast(`İçe aktarma hatası: ${err.message || 'Bilinmeyen hata'}`);
      } finally {
        btnDoImport.disabled = false;
        btnDoImport.innerHTML = `
          <svg class="svg-icon" style="width:16px;height:16px;"><use href="#icon-check"></use></svg>
          <span>Desteyi Veritabanına Yükle</span>
        `;
      }
    });
  }
"""

target = "  showToast(message) {"
if target in text:
    text = text.replace(target, share_and_import_code + "\n" + target)
    print("Inserted openShareDeckModal and bindImportDeckModal right before showToast!")
else:
    print("WARNING: Could not find target")

with open("js/app.js", "w", encoding="utf-8") as f:
    f.write(text)

print("SUCCESS: js/app.js updated.")
