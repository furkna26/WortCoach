/**
 * WortCoach - Sätze bilden (Dağınık ve Çekimsiz Kelimelerden Cümle Kurma Oyunu)
 * - 27 Adet İleri Seviye (B1-C1) Örnek Çalışma Seti
 * - Belgeden / Metinden / Görselden (PDF, DOCX, TXT, OCR) Yapay Zeka ile Cümle Dağıtma ve Çekimsizleştirme Motoru
 * - Yapay Zeka Destekli Esnek Doğruluk Kontrolü (Birden fazla doğru dizilim, zaman ve çekim kabulü)
 * - Sıfır emoji, kurumsal ve analitik mimari.
 */

(function () {
  const $ = (id) => document.getElementById(id);
  const EMOJI_RE = /[\p{Extended_Pictographic}\u200d\ufe0f]/gu;
  const cleanStr = (s) => String(s || '').replace(EMOJI_RE, '').trim();

  const STORAGE_KEY_PROGRESS = 'wortcoach_satz_progress_v1';
  const STORAGE_KEY_CUSTOM = 'wortcoach_satz_custom_v1';

  // Kullanıcının verdiği 27 adet orijinal çalışma cümlesi
  const BUILTIN_SATZ_EXERCISES = [
    {
      id: 'b-1',
      num: 1,
      topic: 'jemandem auf die Schulter klopfen',
      rawWords: 'Der Lehrer / wollen / die Schülerin / fleißig / die Schulter / auf / schlagen / wegen / schön / die Handschrift / die Hausaufgaben / in / alt / klein',
      sampleAnswer: 'Der alte Lehrer wollte der fleißigen Schülerin wegen der schönen Handschrift in den kleinen Hausaufgaben auf die Schulter klopfen.',
      grammarTip: 'jemandem (Dativ: der fleißigen Schülerin) auf die Schulter (Akkusativ) klopfen/schlagen; wegen + Genitiv (wegen der schönen Handschrift); in + Dativ (in den kleinen Hausaufgaben).'
    },
    {
      id: 'b-2',
      num: 2,
      topic: 'einbiegen in etwas',
      rawWords: 'Das Kind / wollen / die Gasse / in / dunkel / einbiegen / abends / nicht / die Hunde / bellend / krank / wegen / dick',
      sampleAnswer: 'Das kranke Kind wollte abends wegen der dicken bellenden Hunde nicht in die dunkle Gasse einbiegen.',
      grammarTip: 'in etwas (Akkusativ - yönelme: in die dunkle Gasse) einbiegen; wegen + Genitiv Plural (wegen der dicken bellenden Hunde).'
    },
    {
      id: 'b-3',
      num: 3,
      topic: 'zählen',
      rawWords: 'Der Verkäufer / die Bleistifte / die Schublade / in / zählen / der Morgen / an / der Laden / in / groß / neu / rot / eng / in',
      sampleAnswer: 'Der neue Verkäufer zählt am Morgen in dem großen Laden die roten Bleistifte in der engen Schublade.',
      grammarTip: 'an dem Morgen -> am Morgen; in + Dativ (bulunma: in dem großen Laden / in der engen Schublade); die roten Bleistifte (Akkusativ Plural).'
    },
    {
      id: 'b-4',
      num: 4,
      topic: 'ahnen',
      rawWords: 'Die Lehrerin / der Fehler / in / das Schulbuch / schnell / alt / ahnen / groß / nicht / die Bilder / mit / das Lesen / bei',
      sampleAnswer: 'Die alte Lehrerin ahnte beim Lesen den großen Fehler in dem Schulbuch mit den Bildern nicht schnell.',
      grammarTip: 'etwas (Akkusativ: den großen Fehler) ahnen; bei dem Lesen -> beim Lesen; in dem Schulbuch mit den Bildern (Dativ).'
    },
    {
      id: 'b-5',
      num: 5,
      topic: 'warnen',
      rawWords: 'Der Nachbar / die Fahrer / warnen / vor / das Haus / die Unfälle / wegen / alt / schnell / grün / unerwünscht',
      sampleAnswer: 'Der alte Nachbar warnt die schnellen Fahrer vor dem grünen Haus wegen der unerwünschten Unfälle.',
      grammarTip: 'jemanden (Akkusativ: die schnellen Fahrer) vor + Dativ (vor dem grünen Haus / vor den unerwünschten Unfällen) warnen; wegen + Genitiv (wegen der unerwünschten Unfälle).'
    },
    {
      id: 'b-6',
      num: 6,
      topic: 'Maßnahmen treffen',
      rawWords: 'Die Finanzminister / wollen / die Welt / auf / wegen / die Inflation / für / der Transport / die Waren / billig / das Flugzeug / mit / Maßnahmen treffen / ganz / zunehmend',
      sampleAnswer: 'Die Finanzminister auf der ganzen Welt wollen wegen der zunehmenden Inflation Maßnahmen für den billigen Transport der Waren mit dem Flugzeug treffen.',
      grammarTip: 'auf der ganzen Welt (Dativ); wegen der zunehmenden Inflation (Genitiv); für den billigen Transport (Akkusativ) der Waren (Genitiv Plural) mit dem Flugzeug (Dativ).'
    },
    {
      id: 'b-7',
      num: 7,
      topic: 'schmecken',
      rawWords: 'Der Kuchen / die Großmutter / groß / die(meine) Freundin / neu / schmecken / gut / die Birnen / mit / der Tisch / auf / schwarz',
      sampleAnswer: 'Der große Kuchen der Großmutter mit den Birnen auf dem schwarzen Tisch schmeckt meiner neuen Freundin gut.',
      grammarTip: 'jemandem (Dativ: meiner neuen Freundin) gut schmecken; der große Kuchen der Großmutter (Genitiv); auf dem schwarzen Tisch (Dativ).'
    },
    {
      id: 'b-8',
      num: 8,
      topic: 'die Rachen',
      rawWords: 'Die Rachen / scheinen / sein / zu / die Haifische / gefährlich / nicht / groß / der Meeresgrund / auf / lebend',
      sampleAnswer: 'Die Rachen der auf dem Meeresgrund lebenden gefährlichen Haifische scheinen nicht groß zu sein.',
      grammarTip: 'scheinen + zu + Infinitiv (scheinen nicht groß zu sein); Partizip I tamlaması (der auf dem Meeresgrund lebenden gefährlichen Haifische - Genitiv Plural).'
    },
    {
      id: 'b-9',
      num: 9,
      topic: 'sich vor etwas hüten',
      rawWords: 'Die Frau / sollen / sich hüten / vor / die Straßenbahn / in / die Diebe / jung / schnell / wegen / das Geld / die Tasche / in / viel',
      sampleAnswer: 'Die junge Frau soll sich in der Straßenbahn wegen des vielen Geldes in der Tasche vor den schnellen Dieben hüten.',
      grammarTip: 'sich vor + Dativ (vor den schnellen Dieben) hüten; in der Straßenbahn (Dativ); wegen des vielen Geldes (Genitiv).'
    },
    {
      id: 'b-10',
      num: 10,
      topic: 'den Titel verleihen',
      rawWords: 'Der Rektor / wollen / der Maler / der Titel / “Doktor“ / verleihen / die Fakultät / weltbekannt / alt / die Bilder / schön / wegen / österreichisch',
      sampleAnswer: 'Der alte Rektor der Fakultät will dem weltbekannten österreichischen Maler wegen der schönen Bilder den Titel "Doktor" verleihen.',
      grammarTip: 'jemandem (Dativ: dem weltbekannten österreichischen Maler) etwas (Akkusativ: den Titel) verleihen; wegen der schönen Bilder (Genitiv Plural).'
    },
    {
      id: 'b-11',
      num: 11,
      topic: 'strömen irgendwohin',
      rawWords: 'Die Frauen / strömen / in / die Läden / die Preise / reduziert / die Woche / in / bekannt / jung / groß / die Türkei / in / wegen',
      sampleAnswer: 'Die jungen Frauen in der Türkei strömen in der Woche wegen der reduzierten Preise in die großen bekannten Läden.',
      grammarTip: 'in + Akkusativ (hareket/yönelme: in die großen bekannten Läden strömen); wegen + Genitiv Plural (wegen der reduzierten Preise).'
    },
    {
      id: 'b-12',
      num: 12,
      topic: 'sorgen für etwas',
      rawWords: 'Die Polizei / sollen / sorgen / die Ruhe / die Stadt / in / sorgen / nötig / groß / für / der Name / mit / Rosenheim',
      sampleAnswer: 'Die Polizei soll in der großen Stadt mit dem Namen Rosenheim für die nötige Ruhe sorgen.',
      grammarTip: 'für + Akkusativ (für die nötige Ruhe) sorgen; in der großen Stadt mit dem Namen Rosenheim (Dativ).'
    },
    {
      id: 'b-13',
      num: 13,
      topic: 'melden',
      rawWords: 'Der Hausmeister / die Bewohner / der Lärm / in / das Hochhaus / alt / melden / wegen / die Menschen / krank',
      sampleAnswer: 'Die Bewohner melden dem alten Hausmeister wegen der kranken Menschen den Lärm in dem Hochhaus.',
      grammarTip: 'jemandem (Dativ: dem alten Hausmeister) etwas (Akkusativ: den Lärm) melden; wegen der kranken Menschen (Genitiv Plural).'
    },
    {
      id: 'b-14',
      num: 14,
      topic: 'überlegen',
      rawWords: 'Die Katze / neu / adoptiert / gemeinsam / mit / das Mädchen / überlegen / die (ihre) Freundin / neu / (die) Namen / für / die Haare / rot / mit / weiß',
      sampleAnswer: 'Das Mädchen mit den roten Haaren überlegt gemeinsam mit ihrer neuen Freundin neue Namen für die neu adoptierte weiße Katze.',
      grammarTip: 'gemeinsam mit + Dativ (mit ihrer neuen Freundin); für + Akkusativ (für die neu adoptierte weiße Katze).'
    },
    {
      id: 'b-15',
      num: 15,
      topic: 'horchen nach etwas (Dativ)',
      rawWords: 'Die Nachbarin / wollen / die Geräusche / das Nachbarhaus / groß / nach / horchen / neugierig / in / die Nacht / in / der Verbrecher / die Nähe / in / wegen',
      sampleAnswer: 'Die neugierige Nachbarin wollte in der Nacht wegen des Verbrechers in der Nähe nach den Geräuschen in dem großen Nachbarhaus horchen.',
      grammarTip: 'horchen nach + Dativ (nach den Geräuschen); in der Nacht / in der Nähe / in dem großen Nachbarhaus (Dativ); wegen des Verbrechers (Genitiv).'
    },
    {
      id: 'b-16',
      num: 16,
      topic: 'mit der Hand über etwas fahren',
      rawWords: 'Der Opa / fahren / die Hand / mit / über / das Sofa / und / finden / der Hund / nicht / klein / gelb / alt / zitternd',
      sampleAnswer: 'Der alte Opa fährt mit der Hand über das gelbe Sofa und findet den kleinen zitternden Hund nicht.',
      grammarTip: 'mit der Hand (Dativ) über + Akkusativ (über das gelbe Sofa) fahren; den kleinen zitternden Hund (Akkusativ, Partizip I).'
    },
    {
      id: 'b-17',
      num: 17,
      topic: 'fehlen',
      rawWords: 'Der Mann / krank / der Atem / das Krankenhaus / in / wegen / COPD-Erkrankung / mit / plötzlich / schwerkrank / bekannt / fehlen',
      sampleAnswer: 'Dem schwerkranken Mann mit der bekannten COPD-Erkrankung fehlt in dem Krankenhaus plötzlich der Atem.',
      grammarTip: 'jemandem (Dativ: Dem schwerkranken Mann) fehlt etwas (Nominativ: der Atem); mit der bekannten COPD-Erkrankung (Dativ).'
    },
    {
      id: 'b-18',
      num: 18,
      topic: 'sich Brot abschneiden',
      rawWords: 'Die Oma / sich abschneiden / die Küche / in / wegen / Marie / die Krankheit / (das) Brot / zu Hause / der Name / mit / der Krebs / der Name / mit',
      sampleAnswer: 'Die Oma mit dem Namen Marie schneidet sich zu Hause in der Küche wegen der Krankheit mit dem Namen Krebs das Brot ab.',
      grammarTip: 'sich (Dativ: kendine) etwas (Akkusativ: das Brot) abschneiden (ayrılabilen fiil: schneidet ... ab); wegen der Krankheit (Genitiv).'
    },
    {
      id: 'b-19',
      num: 19,
      topic: 'die Brotkrümel',
      rawWords: 'die Brotkrümel / wegen / der Tisch / auf / scheinen / zu / schmutzig / die Küche / die Oma / blau / sein',
      sampleAnswer: 'Wegen der Brotkrümel auf dem blauen Tisch scheint die Küche der Oma schmutzig zu sein.',
      grammarTip: 'wegen + Genitiv Plural (wegen der Brotkrümel); auf dem blauen Tisch (Dativ); die Küche der Oma (Genitiv); scheinen + zu + Infinitiv.'
    },
    {
      id: 'b-20',
      num: 20,
      topic: 'die Decke',
      rawWords: 'Die Decke / der Tisch / auf / man / brauchen / waschen / zu / heute / grün / das Essen / nach / feierlich',
      sampleAnswer: 'Man braucht heute nach dem feierlichen Essen die grüne Decke auf dem Tisch zu waschen.',
      grammarTip: 'brauchen + zu + Infinitiv (braucht ... zu waschen); nach + Dativ (nach dem feierlichen Essen); die grüne Decke (Akkusativ).'
    },
    {
      id: 'b-21',
      num: 21,
      topic: 'sich erkälten',
      rawWords: 'Der Wind / wegen / heftig / heutig / können / die Kinder / die Schule / der Schulhof / in / sich erkälten / ohne / die Winterschuhe',
      sampleAnswer: 'Wegen des heutigen heftigen Windes können sich die Kinder der Schule ohne die Winterschuhe in dem Schulhof erkälten.',
      grammarTip: 'wegen + Genitiv (wegen des heutigen heftigen Windes); ohne + Akkusativ (ohne die Winterschuhe); sich erkälten (dönüşlü fiil).'
    },
    {
      id: 'b-22',
      num: 22,
      topic: 'ertragen',
      rawWords: 'Das Faulenzen / können / die Ehefrau / der Ehemann / nicht / ertragen / lang / jung / arbeitslos / das (dies) Jahr / in / nicht mehr',
      sampleAnswer: 'Die junge Ehefrau kann in diesem Jahr das lange Faulenzen des arbeitslosen Ehemannes nicht mehr ertragen.',
      grammarTip: 'in diesem Jahr (Dativ); das lange Faulenzen (Akkusativ) des arbeitslosen Ehemannes (Genitiv Singular); nicht mehr ertragen können.'
    },
    {
      id: 'b-23',
      num: 23,
      topic: 'Die Dachrinne',
      rawWords: 'Die Meinung / die Frau / die Dachrinne / kommen / der Lärm / das Klappern / das Wetter / windig / bei / der Winter / in / nach',
      sampleAnswer: 'Nach der Meinung der Frau kommt der Lärm des Klapperns der Dachrinne im Winter bei dem windigen Wetter.',
      grammarTip: 'nach der Meinung der Frau (Dativ + Genitiv); bei dem windigen Wetter (Dativ); in dem Winter -> im Winter.'
    },
    {
      id: 'b-24',
      num: 24,
      topic: 'unter die Decke kriechen',
      rawWords: 'Die Katze / die Decke / unter / wegen / die Krankheit / braun / klein / heutig / kriechen / das Bett / in / schön',
      sampleAnswer: 'Die kleine braune Katze kriecht wegen der heutigen Krankheit in dem schönen Bett unter die Decke.',
      grammarTip: 'unter + Akkusativ (yönelme: unter die Decke kriechen); wegen der heutigen Krankheit (Genitiv); in dem schönen Bett (Dativ).'
    },
    {
      id: 'b-25',
      num: 25,
      topic: 'vertragen',
      rawWords: 'Die Menschen / alt / nach / 19:00 Uhr / abends / alt / nicht / vertragen / können / das Essen',
      sampleAnswer: 'Die alten Menschen können abends nach 19:00 Uhr das alte Essen nicht vertragen.',
      grammarTip: 'die alten Menschen (Nominativ Plural); nach 19:00 Uhr; das alte Essen (Akkusativ) nicht vertragen können.'
    },
    {
      id: 'b-26',
      num: 26,
      topic: 'sich tief über etwas beugen (Akk.)',
      rawWords: 'Der Mann / tief / sich beugen / der Teller / über / die Straße / auf / lebend / mit / (der) Reis / voll / arm',
      sampleAnswer: 'Der auf der Straße lebende arme Mann beugt sich tief über den vollen Teller mit dem Reis.',
      grammarTip: 'sich über + Akkusativ (über den vollen Teller) beugen; der auf der Straße lebende arme Mann (Partizip I sıfat tamlaması).'
    },
    {
      id: 'b-27',
      num: 27,
      topic: 'nach einer Weile',
      rawWords: 'Die Schülerin / in / die Klasse / kommen / nach einer Weile / wegen / das Fahrrad / kaputt / nach / der Lehrer / neu / die Brille / mit',
      sampleAnswer: 'Die Schülerin kommt wegen des kaputten Fahrrads nach einer Weile nach dem neuen Lehrer mit der Brille in die Klasse.',
      grammarTip: 'wegen + Genitiv (wegen des kaputten Fahrrads); nach + Dativ (nach dem neuen Lehrer mit der Brille); in + Akkusativ (in die Klasse kommen).'
    }
  ];

  const MAX_PDF_BYTES = 4.5 * 1024 * 1024;

  const state = {
    tab: 'play', // 'play' | 'extract'
    sourceSet: 'builtin', // 'builtin' | 'custom'
    currentIndex: 0,
    customExercises: [],
    progress: {}, // { [id]: { solved: true, bestScore: 100, lastAttempt: '...' } }
    file: null,
    fileName: '',
    busy: false
  };

  function loadState() {
    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESS) || '{}');
      if (p && typeof p === 'object') state.progress = p;
    } catch (_) {}
    try {
      const c = JSON.parse(localStorage.getItem(STORAGE_KEY_CUSTOM) || '[]');
      if (Array.isArray(c)) state.customExercises = c;
    } catch (_) {}
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(state.progress));
    } catch (_) {}
  }

  function saveCustomExercises() {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(state.customExercises));
    } catch (_) {}
  }

  function toast(msg) {
    if (window.wmApp && window.wmApp.showToast) window.wmApp.showToast(msg);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getActiveList() {
    if (state.sourceSet === 'custom' && state.customExercises.length > 0) {
      return state.customExercises;
    }
    return BUILTIN_SATZ_EXERCISES;
  }

  function getCurrentExercise() {
    const list = getActiveList();
    if (state.currentIndex >= list.length) state.currentIndex = 0;
    if (state.currentIndex < 0) state.currentIndex = list.length - 1;
    return list[state.currentIndex] || BUILTIN_SATZ_EXERCISES[0];
  }

  function parseTokens(rawWords) {
    return String(rawWords || '')
      .split('/')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Sekme Değiştirme (Oyun Alanı <-> Belgeden Cümle Dağıt)
  function switchSatzTab(tabName) {
    state.tab = tabName === 'extract' ? 'extract' : 'play';
    const isExtract = state.tab === 'extract';

    const btnPlay = $('tab-btn-satz-play');
    const btnExtract = $('tab-btn-satz-extract');
    const panePlay = $('satz-pane-play');
    const paneExtract = $('satz-pane-extract');

    if (btnPlay && btnExtract) {
      if (!isExtract) {
        btnPlay.style.border = '1px solid var(--brand-blue)';
        btnPlay.style.background = 'var(--accent-primary-soft)';
        btnPlay.style.color = 'var(--brand-blue-hover)';

        btnExtract.style.border = '1px solid transparent';
        btnExtract.style.background = 'transparent';
        btnExtract.style.color = 'var(--text-secondary)';
      } else {
        btnExtract.style.border = '1px solid #10B981';
        btnExtract.style.background = 'rgba(16, 185, 129, 0.14)';
        btnExtract.style.color = '#34D399';

        btnPlay.style.border = '1px solid transparent';
        btnPlay.style.background = 'transparent';
        btnPlay.style.color = 'var(--text-secondary)';
      }
    }

    if (panePlay) panePlay.classList.toggle('hidden', isExtract);
    if (paneExtract) paneExtract.classList.toggle('hidden', !isExtract);

    if (!isExtract) {
      renderExercise();
    }
  }

  // Veri Seti Seçimi (27 Örnek Set vs Belgeden Üretilenler)
  function updateSetSelectorUI() {
    const setSelect = $('satz-source-set-select');
    if (!setSelect) return;
    const hasCustom = state.customExercises.length > 0;
    setSelect.innerHTML = `
      <option value="builtin" ${state.sourceSet === 'builtin' ? 'selected' : ''}>Hazır Çalışma Seti (27 Cümle)</option>
      ${hasCustom ? `<option value="custom" ${state.sourceSet === 'custom' ? 'selected' : ''}>Belgeden Üretilen Cümleler (${state.customExercises.length} Cümle)</option>` : ''}
    `;
  }

  function renderExercise(shuffleTokens = false) {
    updateSetSelectorUI();
    const list = getActiveList();
    const ex = getCurrentExercise();
    if (!ex) return;

    // 1. Soru Seçici Dropdown'ı Doldur
    const qSelect = $('satz-question-select');
    if (qSelect) {
      qSelect.innerHTML = list.map((item, idx) => {
        const solved = state.progress[item.id]?.solved ? ' [Çözüldü]' : '';
        return `<option value="${idx}" ${idx === state.currentIndex ? 'selected' : ''}>${idx + 1}. ${item.topic}${solved}</option>`;
      }).join('');
    }

    // 2. İlerleme & Çözülen Sayısı
    const solvedCount = list.filter((item) => state.progress[item.id]?.solved).length;
    const statsEl = $('satz-progress-badge');
    if (statsEl) {
      statsEl.textContent = `${solvedCount} / ${list.length} Tamamlandı`;
    }

    // 3. Başlık & Hedef Kalıp
    const topicEl = $('satz-current-topic');
    if (topicEl) {
      topicEl.textContent = `${state.currentIndex + 1}. ${ex.topic}`;
    }

    const statusBadge = $('satz-current-solved-badge');
    if (statusBadge) {
      const prog = state.progress[ex.id];
      if (prog && prog.solved) {
        statusBadge.textContent = `Çözüldü (${prog.bestScore || 100} Puan)`;
        statusBadge.classList.remove('hidden');
      } else {
        statusBadge.classList.add('hidden');
      }
    }

    // 4. Dağınık Kelimeler (Slash metni + Tıklanabilir Kelime Çipleri)
    let tokens = parseTokens(ex.rawWords);
    if (shuffleTokens) {
      tokens = [...tokens].sort(() => Math.random() - 0.5);
    }

    const rawTextEl = $('satz-raw-slash-text');
    if (rawTextEl) {
      rawTextEl.textContent = tokens.join(' / ');
    }

    const chipsWrap = $('satz-word-chips');
    if (chipsWrap) {
      chipsWrap.innerHTML = '';
      tokens.forEach((tok) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'satz-token-chip';
        chip.style.padding = '6px 11px';
        chip.style.borderRadius = '8px';
        chip.style.background = 'var(--bg-surface)';
        chip.style.border = '1px solid var(--border-medium)';
        chip.style.color = 'var(--text-primary)';
        chip.style.fontWeight = '700';
        chip.style.fontSize = '0.86rem';
        chip.style.cursor = 'pointer';
        chip.style.transition = 'all 0.15s ease';
        chip.textContent = tok;

        chip.addEventListener('click', () => {
          const input = $('satz-user-input');
          if (!input) return;
          const curVal = input.value;
          const needsSpace = curVal.length > 0 && !/\s$/.test(curVal);
          input.value = curVal + (needsSpace ? ' ' : '') + tok;
          chip.style.opacity = '0.55';
          chip.style.borderColor = 'var(--brand-blue)';
          input.focus();
        });

        chipsWrap.appendChild(chip);
      });
    }

    // 5. Önceki deneme varsa veya boşsa inputu hazırla, sonuç kutusunu gizle
    const inputEl = $('satz-user-input');
    if (inputEl && !shuffleTokens) {
      inputEl.value = state.progress[ex.id]?.lastAttempt || '';
    }
    $('satz-eval-result')?.classList.add('hidden');
    $('satz-hint-box')?.classList.add('hidden');
  }

  // İpucu / Örnek Cümle Göster
  function toggleHint() {
    const ex = getCurrentExercise();
    const box = $('satz-hint-box');
    if (!ex || !box) return;

    if (!box.classList.contains('hidden')) {
      box.classList.add('hidden');
      return;
    }

    box.innerHTML = `
      <div style="font-size:0.78rem; font-weight:800; color:#FBBF24; text-transform:uppercase; margin-bottom:4px;">Gramer &amp; Çekim İpucu</div>
      <div style="font-size:0.86rem; color:var(--text-secondary); line-height:1.45; margin-bottom:8px;">${escapeHtml(ex.grammarTip || 'Kelimelerin artikel, hal (Akkusativ/Dativ/Genitiv) ve fiil çekimlerine dikkat ederek cümleyi kurun.')}</div>
      ${ex.sampleAnswer ? `
      <details style="margin-top:6px; cursor:pointer;">
        <summary style="font-size:0.8rem; font-weight:800; color:var(--brand-blue-hover);">Örnek Doğru Cümleyi Gör</summary>
        <div style="margin-top:6px; padding:8px 10px; background:var(--bg-elevated); border-radius:8px; font-weight:700; font-size:0.88rem; color:#34D399;">${escapeHtml(ex.sampleAnswer)}</div>
      </details>` : ''}
    `;
    box.classList.remove('hidden');
  }

  // Çevrimdışı veya API Yedek Değerlendirici (Akıllı Token & Çekim Karşılaştırması)
  function fallbackLocalEvaluation(ex, userSentence) {
    const normalize = (s) => String(s || '')
      .toLowerCase()
      .replace(/[.,!?;:"„“”()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const userNorm = normalize(userSentence);
    const sampleNorm = normalize(ex.sampleAnswer || '');
    const userWords = userNorm.split(' ').filter(Boolean);

    // Kök / stem eşleşmesi kontrolü
    const rawTokens = parseTokens(ex.rawWords)
      .map((t) => normalize(t).replace(/^(der|die|das|ein|eine|sich)\s+/i, '').trim())
      .filter((t) => t.length >= 3);

    let matchedStems = 0;
    rawTokens.forEach((tok) => {
      const stem = tok.slice(0, Math.max(3, Math.min(5, tok.length - 1)));
      if (userNorm.includes(stem)) matchedStems += 1;
    });

    const ratio = rawTokens.length ? matchedStems / rawTokens.length : 0.8;
    const exactMatch = sampleNorm && userNorm === sampleNorm;
    const score = exactMatch ? 100 : Math.min(95, Math.max(40, Math.round(ratio * 95)));
    const isCorrect = score >= 80 && userWords.length >= 6;
    const isPartial = !isCorrect && score >= 55;

    return {
      isCorrect,
      isPartial,
      score,
      userSentence,
      corrected: ex.sampleAnswer || userSentence,
      alternative: ex.sampleAnswer || '',
      analysis: ex.grammarTip || 'Cümleniz verilen kelimeler ve örnek çekim yapısıyla karşılaştırıldı.'
    };
  }

  // Yapay Zeka Destekli Cümle Değerlendirme (Birden fazla doğru cevabı kabul eder)
  async function evaluateUserSentence() {
    if (state.busy) return;
    const ex = getCurrentExercise();
    const inputEl = $('satz-user-input');
    const userSentence = (inputEl?.value || '').trim();

    if (!userSentence || userSentence.length < 5) {
      toast('Lütfen önce verilen kelimelerle Almanca cümlenizi yazın.');
      inputEl?.focus();
      return;
    }

    state.busy = true;
    const checkBtn = $('btn-satz-check');
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<span>Yapay Zeka Kontrol Ediyor...</span>';
    }

    const evalPrompt = `SÄTZE BILDEN CÜMLE KONTROLÜ (Not: Yanıt şemasında exercise.type değerini 'NONE' yap, değerlendirmeyi reply içine yaz):
Hedef Kalıp: ${ex.topic}
Verilen Çekimsiz Kelimeler: ${ex.rawWords}
Referans Cümle: ${ex.sampleAnswer || ''}
Kullanıcının Yazdığı Cümle: ${userSentence}

GÖREV: Kullanıcının yazdığı Almanca cümleyi değerlendir.
1. Almancada aynı kelimelerle birden fazla doğru söz dizimi (Wortstellung), zaman ve sıfat-isim eşleştirmesi mümkündür; gramer ve anlam doğruysa farklı dizilimleri DOĞRU kabul et.
2. Fiil çekimi, artikel/hal (Kasus), edatlar ve sıfat çekimlerini kontrol et.
3. reply metninin en sonuna mutlaka şu formatta tek satır ekle:
[SATZ_EVAL] Durum: DOGRU veya KISMEN veya YANLIS | Puan: 0-100 | Duzeltme: kusursuz Almanca hali | Alternatif: alternatif doğru Almanca dizilim | Analiz: Türkçe gramer ve çekim açıklaması [/SATZ_EVAL]`;

    try {
      let evalData = null;
      try {
        const res = await window.coachRequest('chat', {
          message: evalPrompt,
          userLevel: 'B2',
          action: '',
          history: []
        });

        const rawReply = String(res?.reply || '');
        let status = 'KISMEN';
        let score = 75;
        let corrected = ex.sampleAnswer || userSentence;
        let alternative = ex.sampleAnswer || '';
        let analysis = rawReply.replace(/\[SATZ_EVAL\][\s\S]*$/i, '').trim();

        const match = rawReply.match(/\[SATZ_EVAL\]([\s\S]*?)(?:\[\/SATZ_EVAL\]|$)/i);
        if (match) {
          const block = match[1];
          const stM = block.match(/Durum\s*:\s*([^|]+)/i);
          const scM = block.match(/Puan\s*:\s*(\d+)/i);
          const corM = block.match(/Duzeltme\s*:\s*([^|]+)/i);
          const altM = block.match(/Alternatif\s*:\s*([^|]+)/i);
          const anM = block.match(/Analiz\s*:\s*([^|\]]+)/i);

          if (stM) status = stM[1].trim().toUpperCase();
          if (scM) score = Math.max(0, Math.min(100, parseInt(scM[1], 10)));
          if (corM) corrected = corM[1].trim();
          if (altM) alternative = altM[1].trim();
          if (anM) analysis = anM[1].trim();
        } else if (/tebrik|doğru|kusursuz|harika|başarılı/i.test(rawReply) && !/hatalı|yanlış/i.test(rawReply)) {
          status = 'DOGRU';
          score = 95;
        }

        const isCorrect = status.includes('DOGRU') || status.includes('DOĞRU') || score >= 80;
        const isPartial = !isCorrect && (status.includes('KISMEN') || score >= 50);

        evalData = {
          isCorrect,
          isPartial,
          score,
          userSentence,
          corrected,
          alternative,
          analysis: analysis || ex.grammarTip || 'Cümle yapısı incelendi.'
        };
      } catch (_apiErr) {
        evalData = fallbackLocalEvaluation(ex, userSentence);
      }

      // İlerlemeyi kaydet
      const prevBest = state.progress[ex.id]?.bestScore || 0;
      state.progress[ex.id] = {
        solved: evalData.isCorrect || Boolean(state.progress[ex.id]?.solved),
        bestScore: Math.max(prevBest, evalData.score),
        lastAttempt: userSentence
      };
      saveProgress();

      // ELO / Aktivite kaydı
      if (window.wmSocial && window.wmSocial.recordActivity) {
        window.wmSocial.recordActivity({
          type: 'cloze',
          isCorrect: evalData.isCorrect || evalData.isPartial,
          responseTimeMs: 5000,
          comboCount: evalData.isCorrect ? 1 : 0,
          isHardWord: true
        });
      }

      renderEvalResult(evalData);

      // Başlık rozetini güncelle
      const statusBadge = $('satz-current-solved-badge');
      if (statusBadge && state.progress[ex.id]?.solved) {
        statusBadge.textContent = `Çözüldü (${state.progress[ex.id].bestScore} Puan)`;
        statusBadge.classList.remove('hidden');
      }
      const list = getActiveList();
      const solvedCount = list.filter((item) => state.progress[item.id]?.solved).length;
      const statsEl = $('satz-progress-badge');
      if (statsEl) statsEl.textContent = `${solvedCount} / ${list.length} Tamamlandı`;
    } catch (err) {
      toast('Değerlendirme sırasında hata: ' + (err.message || 'Tekrar deneyin.'));
    } finally {
      state.busy = false;
      if (checkBtn) {
        checkBtn.disabled = false;
        checkBtn.innerHTML = '<span>Yapay Zeka ile Kontrol Et</span>';
      }
    }
  }

  function renderEvalResult(data) {
    const resEl = $('satz-eval-result');
    if (!resEl) return;

    const borderColor = data.isCorrect ? '#10B981' : (data.isPartial ? '#F59E0B' : '#EF4444');
    const bgColor = data.isCorrect ? 'rgba(16,185,129,0.1)' : (data.isPartial ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)');
    const titleColor = data.isCorrect ? '#34D399' : (data.isPartial ? '#FBBF24' : '#F87171');
    const statusLabel = data.isCorrect
      ? `Doğru Cümle! (${data.score} / 100 Puan)`
      : (data.isPartial ? `Kısmen Doğru / Küçük Çekim Hatası (${data.score} / 100 Puan)` : `Gramer / Çekim Düzeltmesi Gerekli (${data.score} / 100 Puan)`);

    resEl.style.border = `1px solid ${borderColor}`;
    resEl.style.background = bgColor;
    resEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <div style="font-weight:900; font-size:1rem; color:${titleColor};">${statusLabel}</div>
        <button type="button" id="btn-satz-speak-corrected" class="btn-secondary-compact" style="padding:4px 10px; font-size:0.76rem; font-weight:800;">
          <span>Cümleyi Dinle</span>
        </button>
      </div>

      <div style="margin-bottom:8px; padding:10px 12px; background:var(--bg-surface); border-radius:10px; border:1px solid var(--border-subtle);">
        <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">Doğru / Kusursuz Hali:</div>
        <div style="font-size:0.94rem; font-weight:800; color:#34D399; line-height:1.45;">${escapeHtml(data.corrected)}</div>
      </div>

      ${data.alternative && data.alternative.toLowerCase() !== data.corrected.toLowerCase() ? `
      <div style="margin-bottom:8px; padding:9px 12px; background:var(--bg-surface); border-radius:10px; border:1px solid var(--border-subtle);">
        <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">Alternatif Doğru Dizilim:</div>
        <div style="font-size:0.88rem; font-weight:700; color:var(--text-primary); line-height:1.4;">${escapeHtml(data.alternative)}</div>
      </div>` : ''}

      <div style="font-size:0.86rem; color:var(--text-secondary); line-height:1.5; margin-top:6px;">
        <strong style="color:var(--text-primary);">AI Gramer &amp; Çekim Analizi:</strong> ${escapeHtml(data.analysis)}
      </div>
    `;

    resEl.classList.remove('hidden');
    resEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    $('btn-satz-speak-corrected')?.addEventListener('click', () => {
      if (window.wmTTS && window.wmTTS.speak) {
        window.wmTTS.speak(data.corrected, 'de-DE');
      }
    });
  }

  // ============================================================================
  // MOD 2: BELGEDEN / METİNDEN CÜMLE DAĞITICI (PDF, DOCX, TXT, GÖRSEL VEYA METİN)
  // ============================================================================
  function setExtractStatus(msg, isError = false) {
    const el = $('satz-extract-status');
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.color = isError ? 'var(--palette-red)' : 'var(--brand-blue-hover)';
  }

  async function handleExtractFile(file) {
    if (!file) return;
    const name = file.name || 'dosya';
    const lower = name.toLowerCase();
    setExtractStatus('Dosya okunuyor...');

    try {
      if (file.type.startsWith('image/')) {
        state.file = { mime: 'image/jpeg', data: await window.coachHelper.downscaleImage(file) };
      } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDF en fazla 4.5 MB olabilir.');
        state.file = { mime: 'application/pdf', data: await window.coachHelper.readAsBase64(file) };
      } else if (lower.endsWith('.docx')) {
        if (!window.mammoth) throw new Error('DOCX ayrıştırıcı hazır değil.');
        const res = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        $('satz-extract-text-input').value = (res.value || '').slice(0, 25000);
        state.file = null;
      } else if (lower.endsWith('.txt')) {
        $('satz-extract-text-input').value = (await file.text()).slice(0, 25000);
        state.file = null;
      } else {
        throw new Error('Desteklenen dosya türleri: Görsel (PNG/JPG), PDF, DOCX veya TXT.');
      }

      state.fileName = name;
      if (state.file) {
        $('satz-extract-file-name').textContent = name;
        $('satz-extract-file-chip').classList.remove('hidden');
      } else {
        $('satz-extract-file-chip').classList.add('hidden');
      }
      setExtractStatus('');
    } catch (e) {
      state.file = null;
      $('satz-extract-file-chip').classList.add('hidden');
      setExtractStatus(e.message || 'Dosya işlenemedi.', true);
    }
  }

  async function extractScrambledSentencesFromDoc() {
    if (state.busy) return;
    const text = ($('satz-extract-text-input')?.value || '').trim();
    if (!text && !state.file) {
      setExtractStatus('Lütfen bir metin yapıştırın veya belge/görsel yükleyin.', true);
      return;
    }

    state.busy = true;
    const btn = $('btn-satz-extract-generate');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Cümleler Dağıtılıyor &amp; Çekimsizleştiriliyor...</span>';
    }
    setExtractStatus('Yapay zeka belgedeki cümleleri çekimsiz (yalın) ve karışık "Sätze bilden" formatına dönüştürüyor...');

    try {
      const payload = {
        deckMode: 'quiz',
        instruction: `BU BİR 'SÄTZE BILDEN' (DAĞINIK VE ÇEKİMSİZ KELİMELERDEN CÜMLE KURMA) ÜRETİM GÖREVİDİR.
Belgedeki veya metindeki cümleleri incele (eğer yalnız konu veya kelimeler verildiyse B1-B2 seviyesinde zengin cümleler kur).
Her madde için:
1) lemma alanına: Cümlenin ana fiilini veya kalıbını yaz (Örn: "Maßnahmen treffen", "sich vor etwas hüten", "einbiegen in etwas").
2) sourceSentence alanına: Cümledeki tüm kelimeleri ÇEKİMSİZ YALIN HALDE (İsimleri Nominativ tekil/çoğul artikeliyle örn. 'der Lehrer', fiilleri mastar Infinitiv halinde örn. 'wollen / schlagen', sıfatları eksiz yalın halde örn. 'fleißig / schön', edatları 'auf / wegen / in') ve KARIŞIK SIRADA '/' işaretiyle ayırarak yaz (Örn: "Der Lehrer / wollen / die Schülerin / fleißig / die Schulter / auf / schlagen / wegen / schön / die Handschrift").
3) contextMeaning alanına: Bu kelimelerle kurulabilecek doğru ve çekimlenmiş tam Almanca cümleyi yaz.`
      };
      if (text) payload.text = text;
      if (state.file) payload.file = state.file;

      const out = await window.coachRequest('deck', payload);
      const rawList = (out && Array.isArray(out.words) && out.words.length)
        ? out.words
        : (out && Array.isArray(out.cards) ? out.cards : []);

      const generated = rawList.map((w, idx) => {
        const topic = cleanStr(w.front || w.lemma || `Cümle ${idx + 1}`);
        const sampleAnswer = cleanStr(w.back || w.contextMeaning || '');
        let rawWords = cleanStr(w.hint || w.sourceSentence || '');

        // Eğer sourceSentence içinde '/' yoksa sampleAnswer'dan otomatik dağıt
        if (!rawWords.includes('/') && sampleAnswer) {
          rawWords = sampleAnswer
            .replace(/[.,!?;:"]/g, '')
            .split(/\s+/)
            .filter(Boolean)
            .sort(() => Math.random() - 0.5)
            .join(' / ');
        }

        return {
          id: `custom-${Date.now()}-${idx}`,
          num: idx + 1,
          topic,
          rawWords,
          sampleAnswer,
          grammarTip: 'Belgeden üretilen cümle: Kelimeleri uygun artikel, hal (Kasus) ve fiil çekimleriyle anlamlı bir cümleye dönüştürün.'
        };
      }).filter((item) => item.rawWords && item.rawWords.includes('/'));

      if (!generated.length) {
        throw new Error('Belgeden uygun cümle çıkarılamadı. Lütfen daha uzun bir metin veya belge deneyin.');
      }

      state.customExercises = generated;
      saveCustomExercises();
      state.sourceSet = 'custom';
      state.currentIndex = 0;

      setExtractStatus('');
      toast(`${generated.length} adet cümle dağınık ve çekimsiz hale getirilerek oyuna yüklendi!`);
      switchSatzTab('play');
    } catch (e) {
      setExtractStatus(e.message || 'Cümleler üretilemedi.', true);
    } finally {
      state.busy = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Belgeden Dağınık Cümleler Üret ve Oyuna Başla</span>';
      }
    }
  }

  function openSatzBuilderModal() {
    loadState();
    const modal = $('modal-satz-builder');
    if (!modal) return;
    switchSatzTab('play');
    modal.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function closeSatzBuilderModal() {
    $('modal-satz-builder')?.classList.add('hidden');
  }

  function init() {
    loadState();

    // 1. Çalış sekmesindeki karttan açma & kapatma
    $('btn-open-satz-builder-card')?.addEventListener('click', openSatzBuilderModal);
    $('btn-close-satz-builder')?.addEventListener('click', closeSatzBuilderModal);

    // 2. Üst Sekmeler (Oyun Alanı vs Belgeden Cümle Dağıt)
    $('tab-btn-satz-play')?.addEventListener('click', () => switchSatzTab('play'));
    $('tab-btn-satz-extract')?.addEventListener('click', () => switchSatzTab('extract'));

    // 3. Veri Seti & Soru Seçiciler
    $('satz-source-set-select')?.addEventListener('change', (e) => {
      state.sourceSet = e.target.value === 'custom' ? 'custom' : 'builtin';
      state.currentIndex = 0;
      renderExercise();
    });

    $('satz-question-select')?.addEventListener('change', (e) => {
      state.currentIndex = parseInt(e.target.value, 10) || 0;
      renderExercise();
    });

    // 4. Önceki / Sonraki / Rastgele / Karıştır
    $('btn-satz-prev')?.addEventListener('click', () => {
      state.currentIndex -= 1;
      renderExercise();
    });
    $('btn-satz-next')?.addEventListener('click', () => {
      state.currentIndex += 1;
      renderExercise();
    });
    $('btn-satz-random')?.addEventListener('click', () => {
      const list = getActiveList();
      if (list.length > 1) {
        let nextIdx = state.currentIndex;
        while (nextIdx === state.currentIndex) {
          nextIdx = Math.floor(Math.random() * list.length);
        }
        state.currentIndex = nextIdx;
      }
      renderExercise();
    });
    $('btn-satz-shuffle-words')?.addEventListener('click', () => {
      renderExercise(true);
    });

    // 5. Kontrol Et, İpucu, Temizle
    $('btn-satz-check')?.addEventListener('click', evaluateUserSentence);
    $('btn-satz-hint')?.addEventListener('click', toggleHint);
    $('btn-satz-clear')?.addEventListener('click', () => {
      const inputEl = $('satz-user-input');
      if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
      }
      document.querySelectorAll('#satz-word-chips .satz-token-chip').forEach((c) => {
        c.style.opacity = '1';
        c.style.borderColor = 'var(--border-medium)';
      });
    });

    // 6. Belgeden Cümle Dağıtma Olayları
    $('btn-satz-extract-pick')?.addEventListener('click', () => $('satz-extract-file-input')?.click());
    $('satz-extract-file-input')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleExtractFile(e.target.files[0]);
        e.target.value = '';
      }
    });
    $('btn-satz-extract-file-remove')?.addEventListener('click', () => {
      state.file = null;
      $('satz-extract-file-chip')?.classList.add('hidden');
    });
    $('btn-satz-extract-generate')?.addEventListener('click', extractScrambledSentencesFromDoc);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.openSatzBuilder = openSatzBuilderModal;
})();
