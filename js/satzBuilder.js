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
      sampleAnswer: 'Der alte Lehrer will der kleinen, fleißigen Schülerin wegen der schönen Handschrift in den Hausaufgaben auf die Schulter schlagen.',
      grammarTip: 'jemandem (Dativ: der kleinen, fleißigen Schülerin) auf die Schulter (Akkusativ) schlagen/klopfen; wegen + Genitiv (wegen der schönen Handschrift); in + Dativ (in den Hausaufgaben).'
    },
    {
      id: 'b-2',
      num: 2,
      topic: 'einbiegen in etwas',
      rawWords: 'Das Kind / wollen / die Gasse / in / dunkel / einbiegen / abends / nicht / die Hunde / bellend / krank / wegen / dick',
      sampleAnswer: 'Das kranke Kind will abends wegen der dicken, bellenden Hunde nicht in die dunkle Gasse einbiegen.',
      grammarTip: 'in etwas (Akkusativ - yönelme: in die dunkle Gasse) einbiegen; wegen + Genitiv Plural (wegen der dicken, bellenden Hunde).'
    },
    {
      id: 'b-3',
      num: 3,
      topic: 'zählen',
      rawWords: 'Der Verkäufer / die Bleistifte / die Schublade / in / zählen / der Morgen / an / der Laden / in / groß / neu / rot / eng / in',
      sampleAnswer: 'Der neue Verkäufer zählt an dem Morgen in dem großen Laden die roten Bleistifte in der engen Schublade.',
      grammarTip: 'an dem Morgen (am Morgen); in + Dativ (in dem großen Laden / in der engen Schublade); die roten Bleistifte (Akkusativ Plural).'
    },
    {
      id: 'b-4',
      num: 4,
      topic: 'ahnen',
      rawWords: 'Die Lehrerin / der Fehler / in / das Schulbuch / schnell / alt / ahnen / groß / nicht / die Bilder / mit / das Lesen / bei',
      sampleAnswer: 'Die alte Lehrerin ahnt bei dem Lesen den großen Fehler in dem Schulbuch mit den Bildern nicht schnell.',
      grammarTip: 'etwas (Akkusativ: den großen Fehler) ahnen; bei dem Lesen (beim Lesen); in dem Schulbuch mit den Bildern (Dativ).'
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
      sampleAnswer: 'Dem kranken, schwerkranken Mann mit der bekannten COPD-Erkrankung fehlt in dem Krankenhaus wegen der COPD-Erkrankung plötzlich der Atem.',
      grammarTip: 'jemandem (Dativ: Dem kranken, schwerkranken Mann) fehlt etwas (Nominativ: der Atem); wegen / mit der bekannten COPD-Erkrankung.'
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

  // ============================================================================
  // SIKI KELİME DENETÇİSİ (Olmayan Kelime Eklemeyi ve Eksik Kelime Bırakmayı Engeller)
  // ============================================================================
  const GRAMMAR_ARTICLES = new Set([
    'der', 'die', 'das', 'den', 'dem', 'des',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'mein', 'meine', 'meiner', 'meinen', 'meinem', 'meines',
    'ihr', 'ihre', 'ihrer', 'ihren', 'ihrem', 'ihres',
    'sein', 'seine', 'seiner', 'seinen', 'seinem', 'seines',
    'dies', 'diese', 'dieser', 'dieses', 'diesem', 'diesen',
    'sich'
  ]);

  const IRREGULAR_STEM_MAP = {
    wollen: ['woll', 'will'],
    können: ['könn', 'kann', 'konnt', 'koenn'],
    sollen: ['soll'],
    sein: ['sein', 'ist', 'sind', 'war', 'wär', 'sei'],
    haben: ['hab', 'hat', 'hätt'],
    werden: ['werd', 'wird', 'wurd', 'word'],
    fahren: ['fahr', 'fähr', 'faehr', 'fuhr', 'gefahr'],
    schlagen: ['schlag', 'schläg', 'schlaeg', 'schlug', 'geschlag', 'klopf'],
    klopfen: ['klopf', 'schlag', 'schläg', 'schlug'],
    treffen: ['treff', 'triff', 'traf', 'getroff'],
    kommen: ['komm', 'kam', 'gekomm'],
    verleihen: ['verleih', 'verlieh'],
    scheinen: ['schein', 'schien'],
    kriechen: ['kriech', 'kroch', 'gekroch'],
    einbiegen: ['einbieg', 'einbog', 'eingebog', 'bieg', 'bog'],
    abschneiden: ['abschneid', 'abschnitt', 'abgeschnitt', 'schneid', 'schnitt'],
    überlegen: ['überleg', 'ueberleg'],
    vertragen: ['vertrag', 'verträg', 'vertraeg', 'vertrug'],
    ertragen: ['ertrag', 'erträg', 'ertraeg', 'ertrug'],
    hüten: ['hüt', 'huet'],
    erkälten: ['erkält', 'erkaelt'],
    beugen: ['beug'],
    strömen: ['ström', 'stroem'],
    zählen: ['zähl', 'zaehl'],
    warnen: ['warn'],
    ahnen: ['ahn'],
    schmecken: ['schmeck'],
    sorgen: ['sorg'],
    melden: ['meld'],
    horchen: ['horch'],
    finden: ['find', 'fand', 'gefund'],
    fehlen: ['fehl'],
    brauchen: ['brauch'],
    waschen: ['wasch', 'wäsch', 'wusch', 'gewasch'],
    groß: ['groß', 'gross', 'größ', 'groess'],
    alt: ['alt', 'ält', 'aelt'],
    jung: ['jung', 'jüng', 'jueng'],
    lang: ['lang', 'läng', 'laeng'],
    krank: ['krank', 'kränk'],
    rachen: ['rach', 'roch'],
    mann: ['mann', 'männ'],
    haus: ['haus', 'häus'],
    buch: ['buch', 'büch'],
    laden: ['laden', 'läden'],
    stadt: ['stadt', 'städt'],
    nacht: ['nacht', 'nächt'],
    hand: ['hand', 'händ'],
    schuh: ['schuh'],
    winterschuhe: ['winterschuh']
  };

  const SEPARABLE_PREFIXES = ['ein', 'ab', 'auf', 'an', 'aus', 'mit', 'nach', 'vor', 'zu', 'unter', 'über'];

  function expandContractions(text) {
    return String(text || '')
      .replace(/\bim\b/gi, 'in dem')
      .replace(/\bins\b/gi, 'in das')
      .replace(/\bam\b/gi, 'an dem')
      .replace(/\bans\b/gi, 'an das')
      .replace(/\bbeim\b/gi, 'bei dem')
      .replace(/\bvom\b/gi, 'von dem')
      .replace(/\bzum\b/gi, 'zu dem')
      .replace(/\bzur\b/gi, 'zu der')
      .replace(/\bübers\b/gi, 'über das')
      .replace(/\bunterm\b/gi, 'unter dem')
      .replace(/\bvorm\b/gi, 'vor dem');
  }

  function cleanWordToken(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/[.,!?;:"„“”'«»()[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildStemsForWord(w) {
    const lower = w.toLowerCase().trim();
    if (!lower) return [];
    if (IRREGULAR_STEM_MAP[lower]) return IRREGULAR_STEM_MAP[lower];

    const stems = new Set([lower]);
    // Mastar / çoğul / sıfat eklerini kırparak kök üret
    let base = lower;
    if (base.length > 4 && base.endsWith('en')) base = base.slice(0, -2);
    else if (base.length > 4 && (base.endsWith('er') || base.endsWith('es') || base.endsWith('em'))) base = base.slice(0, -2);
    else if (base.length > 3 && (base.endsWith('e') || base.endsWith('n') || base.endsWith('s'))) base = base.slice(0, -1);

    stems.add(base);
    // -el / -er ile biten sıfatlarda çekimde iç 'e' düşmesi (dunkel -> dunkle/dunklen, teuer -> teure/teuren)
    if (lower.length >= 5 && lower.endsWith('el')) {
      stems.add(lower.slice(0, -2) + 'l');
    }
    if (lower.length >= 5 && lower.endsWith('er')) {
      stems.add(lower.slice(0, -2) + 'r');
    }
    // Umlaut varyasyonları
    stems.add(base.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u'));
    stems.add(base.replace(/a/g, 'ä').replace(/o/g, 'ö').replace(/u/g, 'ü'));

    // Ayrılabilen fiil kontrolü (örn. einbiegen -> bieg, abschneiden -> schneid)
    for (const pref of SEPARABLE_PREFIXES) {
      if (lower.startsWith(pref) && lower.length >= pref.length + 4) {
        const rest = lower.slice(pref.length);
        if (IRREGULAR_STEM_MAP[rest]) {
          IRREGULAR_STEM_MAP[rest].forEach((s) => stems.add(s));
        } else {
          const restBase = rest.endsWith('en') ? rest.slice(0, -2) : rest;
          if (restBase.length >= 3) stems.add(restBase);
        }
      }
    }

    return Array.from(stems).filter((s) => s.length >= 2);
  }

  function doesSentenceWordMatchStem(sentWord, stems, exactShortWord = '') {
    if (!sentWord) return false;
    if (exactShortWord && sentWord === exactShortWord) return true;
    // Kısa edat/zarflar için tam eşleşme (in, an, auf, vor, mit, bei, zu, für, nach, und,ไม่)
    if (exactShortWord && exactShortWord.length <= 3 && !IRREGULAR_STEM_MAP[exactShortWord]) {
      return sentWord === exactShortWord || sentWord.startsWith(exactShortWord + 'e') || sentWord.startsWith(exactShortWord + 's');
    }
    for (const st of stems) {
      if (sentWord === st) return true;
      if (st.length >= 3 && sentWord.startsWith(st)) return true;
      // Partizip II 'ge-' öneki veya birleşik kelime içi eşleşme
      if (st.length >= 4 && sentWord.includes(st)) return true;
    }
    return false;
  }

  /**
   * Verilen dağınık kelimeler (ex.rawWords) ile kurulan cümleyi (sentenceStr) birebir denetler:
   * - missingWords: Verilen kelimelerden cümlede HİÇ KULLANILMAYANLAR
   * - extraWords: Verilen kelimelerde OLMAYIP cümleye dışarıdan EKLENEN kelimeler
   */
  function auditWordUsage(ex, sentenceStr) {
    const expandedSent = expandContractions(sentenceStr);
    const sentWords = cleanWordToken(expandedSent).split(' ').filter(Boolean);

    // 1. rawWords içindeki her bir öğeyi ayrıştır
    const rawChunks = parseTokens(ex.rawWords);
    const requiredItems = [];
    const allowedLexicalSubwords = [];

    // Başlıktaki kelimeleri de (örn. klopfen / schlagen) izinli havuza ekle
    cleanWordToken(ex.topic || '')
      .split(' ')
      .filter((w) => w.length >= 3 && !GRAMMAR_ARTICLES.has(w) && w !== 'etwas' && w !== 'jemandem' && w !== 'irgendwohin' && w !== 'dativ' && w !== 'akk')
      .forEach((w) => {
        allowedLexicalSubwords.push({ raw: w, stems: buildStemsForWord(w) });
      });

    const seenChunkKeys = new Set();
    rawChunks.forEach((chunk) => {
      // Parantez içi alternatifleri temizle: "die(meine) Freundin" -> ["die", "meine", "freundin"]
      const subTokens = cleanWordToken(chunk).split(' ').filter(Boolean);
      const contentWords = subTokens.filter((w) => !GRAMMAR_ARTICLES.has(w));
      const effectiveWords = contentWords.length > 0 ? contentWords : subTokens;

      effectiveWords.forEach((w) => {
        const stems = buildStemsForWord(w);
        allowedLexicalSubwords.push({ raw: w, stems });
        // Ayrılabilen fiil öneklerini de izinli havuza ekle (einbiegen -> ein, abschneiden -> ab)
        for (const pref of SEPARABLE_PREFIXES) {
          if (w.startsWith(pref) && w.length >= pref.length + 4) {
            allowedLexicalSubwords.push({ raw: pref, stems: [pref] });
          }
        }
      });

      const chunkKey = effectiveWords.join('_');
      if (!chunkKey || seenChunkKeys.has(chunkKey)) return;
      seenChunkKeys.add(chunkKey);

      requiredItems.push({
        label: chunk.trim(),
        words: effectiveWords.map((w) => ({ raw: w, stems: buildStemsForWord(w) }))
      });
    });

    // 2. Eksik (Kullanılmayan) Kelimeleri Bul
    const missingWords = [];
    requiredItems.forEach((item) => {
      // Öğenin içindeki ana kelimelerden en az biri (veya çok kelimeliyse hepsi) cümlede geçiyor mu?
      const allMatched = item.words.every((wObj) =>
        sentWords.some((sw) => doesSentenceWordMatchStem(sw, wObj.stems, wObj.raw))
      );
      if (!allMatched) {
        missingWords.push(item.label);
      }
    });

    // 3. Listede Olmayan (Fazladan Eklenen) Kelimeleri Bul
    const extraWords = [];
    sentWords.forEach((sw) => {
      if (GRAMMAR_ARTICLES.has(sw)) return;
      const isAllowed = allowedLexicalSubwords.some((allowObj) =>
        doesSentenceWordMatchStem(sw, allowObj.stems, allowObj.raw)
      );
      if (!isAllowed) {
        extraWords.push(sw);
      }
    });

    return {
      missingWords,
      extraWords: Array.from(new Set(extraWords)),
      isCompleteAndStrict: missingWords.length === 0 && extraWords.length === 0
    };
  }

  // Yapay zekanın önerdiği Duzeltme/Alternatif cümlelerde listede olmayan kelime varsa temizler
  function sanitizeAiSuggestedSentence(ex, candidateSentence) {
    if (!candidateSentence) return ex.sampleAnswer || '';
    const audit = auditWordUsage(ex, candidateSentence);
    // Eğer AI listede olmayan kelime uydurduysa veya kelimeleri atladıysa doğrudan orijinal sampleAnswer'ı döndür
    if (audit.extraWords.length > 0 || audit.missingWords.length > 1) {
      return ex.sampleAnswer || candidateSentence;
    }
    return candidateSentence;
  }

  // Çevrimdışı veya API Yedek Değerlendirici (Sıkı Kelime & Çekim Denetimi)
  function fallbackLocalEvaluation(ex, userSentence) {
    const audit = auditWordUsage(ex, userSentence);
    const totalReq = Math.max(1, parseTokens(ex.rawWords).length);
    const usedRatio = Math.max(0, (totalReq - audit.missingWords.length) / totalReq);

    let score = Math.round(usedRatio * 92);
    if (audit.extraWords.length > 0) {
      score = Math.max(15, score - audit.extraWords.length * 20);
    }
    if (audit.missingWords.length > 0) {
      score = Math.min(65, score);
    }

    const isCorrect = audit.isCompleteAndStrict && score >= 80;
    const isPartial = !isCorrect && score >= 45;

    let analysisMsg = ex.grammarTip || 'Cümleniz verilen kelimeler ve örnek çekim yapısıyla karşılaştırıldı.';
    if (audit.missingWords.length > 0) {
      analysisMsg = `Verilen şu kelimeleri cümlenizde kullanmadınız: ${audit.missingWords.join(', ')}. Tüm verilen kelimeler eksiksiz kullanılmalıdır. ` + analysisMsg;
    }
    if (audit.extraWords.length > 0) {
      analysisMsg = `Verilen kelimeler listesinde olmayan şu kelimeleri eklediniz: ${audit.extraWords.join(', ')}. Sadece verilen kelimeleri kullanmalısınız. ` + analysisMsg;
    }

    return {
      isCorrect,
      isPartial,
      score,
      userSentence,
      corrected: ex.sampleAnswer || userSentence,
      alternative: '',
      analysis: analysisMsg,
      missingWords: audit.missingWords,
      extraWords: audit.extraWords
    };
  }

  // Yapay Zeka Destekli Cümle Değerlendirme (Sıkı kelime kontrolü + çoklu doğru dizilim desteği)
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

    // Önce yerel sıkı kelime denetçisini çalıştır (Eksik veya listede olmayan kelime var mı?)
    const userAudit = auditWordUsage(ex, userSentence);

    const evalPrompt = `SÄTZE BILDEN CÜMLE KONTROLÜ (Not: Yanıt şemasında exercise.type değerini 'NONE' yap, değerlendirmeyi reply içine yaz):
Hedef Kalıp: ${ex.topic}
Verilen Çekimsiz Kelimeler: ${ex.rawWords}
Referans Cümle: ${ex.sampleAnswer || ''}
Kullanıcının Yazdığı Cümle: ${userSentence}
${userAudit.missingWords.length ? `Kullanıcının KULLANMADIĞI (Eksik) Kelimeler: ${userAudit.missingWords.join(', ')}` : ''}
${userAudit.extraWords.length ? `Kullanıcının Listede Olmadığı Halde EKLEDİĞİ Fazla Kelimeler: ${userAudit.extraWords.join(', ')}` : ''}

KESİN KURALLAR:
1. OLMAYAN KELİME EKLEME YASAĞI: Hem kullanıcının cümlesinde hem de senin yazacağın "Duzeltme" ve "Alternatif" cümlelerinde SADECE "Verilen Çekimsiz Kelimeler" listesindeki kelimeler (ve zorunlu artikel/hal çekimleri) kullanılabilir. Listede olmayan hiçbir kelime, zarf, sıfat, bağlaç veya fiil ASLA eklenemez!
2. TÜM KELİMELERİ KULLANMA ZORUNLULUĞU: Verilen kelimelerin TAMAMI cümlede eksiksiz kullanılmak zorundadır. Kullanıcı verilen kelimelerden birini bile kullanmadıysa veya listede olmayan kelime eklediyse Durum kesinlikle DOGRU olamaz (YANLIS veya KISMEN olmalıdır).
3. Almancada aynı kelimelerle birden fazla doğru söz dizimi (Wortstellung) ve sıfat-isim eşleştirmesi mümkündür; kullanıcı tüm verilen kelimeleri eksiksiz ve dışarıdan kelime eklemeden gramerce doğru kullandıysa farklı dizilimleri DOGRU kabul et.
4. reply metninin en sonuna mutlaka şu formatta tek satır ekle:
[SATZ_EVAL] Durum: DOGRU veya KISMEN veya YANLIS | Puan: 0-100 | Duzeltme: sadece verilen kelimelerle kurulan kusursuz Almanca cümle | Alternatif: sadece verilen kelimelerle kurulan alternatif doğru dizilim | Analiz: Türkçe gramer, çekim ve eksik/fazla kelime açıklaması [/SATZ_EVAL]`;

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
        let alternative = '';
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
        } else if (/tebrik|doğru|kusursuz|harika|başarılı/i.test(rawReply) && !/hatalı|yanlış|eksik/i.test(rawReply)) {
          status = 'DOGRU';
          score = 95;
        }

        // Yapay zekanın Duzeltme ve Alternatif cümlelerini denetle: listede olmayan kelime eklediyse anında engelle!
        corrected = sanitizeAiSuggestedSentence(ex, corrected);
        if (alternative) {
          const altAudit = auditWordUsage(ex, alternative);
          if (altAudit.extraWords.length > 0 || altAudit.missingWords.length > 0) {
            alternative = '';
          }
        }

        let isCorrect = status.includes('DOGRU') || status.includes('DOĞRU') || score >= 80;

        // KESİN ENGEL: Kullanıcı verilen kelimelerden birini bile kullanmadıysa veya listede olmayan kelime eklediyse DOĞRU kabul edilemez!
        if (!userAudit.isCompleteAndStrict) {
          isCorrect = false;
          if (userAudit.extraWords.length > 0) {
            score = Math.min(score, 45);
          }
          if (userAudit.missingWords.length > 0) {
            score = Math.min(score, 60);
          }
        }

        const isPartial = !isCorrect && (status.includes('KISMEN') || score >= 45);

        evalData = {
          isCorrect,
          isPartial,
          score,
          userSentence,
          corrected,
          alternative,
          analysis: analysis || ex.grammarTip || 'Cümle yapısı incelendi.',
          missingWords: userAudit.missingWords,
          extraWords: userAudit.extraWords
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

    const hasMissing = Array.isArray(data.missingWords) && data.missingWords.length > 0;
    const hasExtra = Array.isArray(data.extraWords) && data.extraWords.length > 0;

    const borderColor = data.isCorrect ? '#10B981' : (data.isPartial ? '#F59E0B' : '#EF4444');
    const bgColor = data.isCorrect ? 'rgba(16,185,129,0.1)' : (data.isPartial ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)');
    const titleColor = data.isCorrect ? '#34D399' : (data.isPartial ? '#FBBF24' : '#F87171');

    let statusLabel = data.isCorrect
      ? `Doğru Cümle! (${data.score} / 100 Puan)`
      : (data.isPartial ? `Kısmen Doğru / Küçük Çekim Hatası (${data.score} / 100 Puan)` : `Gramer / Çekim Düzeltmesi Gerekli (${data.score} / 100 Puan)`);

    if (hasMissing || hasExtra) {
      statusLabel = `Kelime Eksik veya Fazla! (${data.score} / 100 Puan)`;
    }

    resEl.style.border = `1px solid ${borderColor}`;
    resEl.style.background = bgColor;
    resEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <div style="font-weight:900; font-size:1rem; color:${titleColor};">${statusLabel}</div>
        <button type="button" id="btn-satz-speak-corrected" class="btn-secondary-compact" style="padding:4px 10px; font-size:0.76rem; font-weight:800;">
          <span>Cümleyi Dinle</span>
        </button>
      </div>

      ${hasMissing ? `
      <div style="margin-bottom:8px; padding:9px 12px; background:rgba(239,68,68,0.14); border-radius:10px; border:1px solid rgba(239,68,68,0.45);">
        <div style="font-size:0.74rem; font-weight:900; color:#F87171; text-transform:uppercase; margin-bottom:2px;">Kullanılmayan (Eksik) Kelimeler:</div>
        <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary);">${escapeHtml(data.missingWords.join(' / '))}</div>
        <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">Verilen tüm kelimeleri kullanmadan cümle doğru kabul edilmez.</div>
      </div>` : ''}

      ${hasExtra ? `
      <div style="margin-bottom:8px; padding:9px 12px; background:rgba(245,158,11,0.14); border-radius:10px; border:1px solid rgba(245,158,11,0.45);">
        <div style="font-size:0.74rem; font-weight:900; color:#FBBF24; text-transform:uppercase; margin-bottom:2px;">Listede Olmayan (Fazladan Eklenen) Kelimeler:</div>
        <div style="font-size:0.88rem; font-weight:800; color:var(--text-primary);">${escapeHtml(data.extraWords.join(', '))}</div>
        <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:2px;">Verilen kelimeler dışından cümleye ekstra kelime eklenemez.</div>
      </div>` : ''}

      <div style="margin-bottom:8px; padding:10px 12px; background:var(--bg-surface); border-radius:10px; border:1px solid var(--border-subtle);">
        <div style="font-size:0.72rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:3px;">Sadece Verilen Kelimelerle Doğru Hali:</div>
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

  // Metin içinde halihazırda '/' ile ayrılmış Sätze bilden formatı varsa doğrudan (AI kelime değiştirmeden) ayrıştırır
  function parseDirectSlashExercises(rawText) {
    const lines = String(rawText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const directItems = [];
    let pendingTopic = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const slashCount = (line.match(/\//g) || []).length;
      if (slashCount >= 3) {
        const cleanRaw = line
          .split('/')
          .map((t) => t.trim())
          .filter(Boolean)
          .join(' / ');
        const topic = pendingTopic
          ? pendingTopic.replace(/^\d+[\s.)-]*/, '').replace(/^\.+/, '').trim()
          : `Cümle ${directItems.length + 1}`;
        directItems.push({
          id: `custom-direct-${Date.now()}-${directItems.length}`,
          num: directItems.length + 1,
          topic: topic || `Cümle ${directItems.length + 1}`,
          rawWords: cleanRaw,
          sampleAnswer: '',
          grammarTip: 'Verilen tüm kelimeleri eksiksiz ve dışarıdan kelime eklemeden çekimleyerek kurun.'
        });
        pendingTopic = '';
      } else {
        pendingTopic = line;
      }
    }
    return directItems;
  }

  // Belgeden üretilen rawWords ile sampleAnswer arasında 1'e 1 kelime uyumu sağlar (olmayan kelimeyi siler, eksik kelimeyi ekler)
  function enforceStrictTokensOnExtractedItem(rawWords, sampleAnswer) {
    if (!sampleAnswer) return rawWords;
    const expandedSample = expandContractions(sampleAnswer);
    const sampleTokens = cleanWordToken(expandedSample).split(' ').filter(Boolean);

    let chunks = parseTokens(rawWords);
    // 1. sampleAnswer içinde kökü hiç geçmeyen (AI tarafından uydurulmuş) kelimeleri rawWords'ten çıkar
    chunks = chunks.filter((chunk) => {
      const subTokens = cleanWordToken(chunk).split(' ').filter((w) => !GRAMMAR_ARTICLES.has(w));
      const checkWords = subTokens.length ? subTokens : cleanWordToken(chunk).split(' ').filter(Boolean);
      return checkWords.every((w) => {
        const stems = buildStemsForWord(w);
        return sampleTokens.some((sw) => doesSentenceWordMatchStem(sw, stems, w));
      });
    });

    // 2. sampleAnswer içinde olup da rawWords'e konulmamış kelimeleri tespit et ve ekle
    const dummyEx = { topic: '', rawWords: chunks.join(' / '), sampleAnswer };
    const audit = auditWordUsage(dummyEx, sampleAnswer);
    if (audit.extraWords.length > 0) {
      audit.extraWords.forEach((missingFromRaw) => {
        chunks.push(missingFromRaw);
      });
    }

    return chunks.join(' / ');
  }

  async function extractScrambledSentencesFromDoc() {
    if (state.busy) return;
    const text = ($('satz-extract-text-input')?.value || '').trim();
    if (!text && !state.file) {
      setExtractStatus('Lütfen bir metin yapıştırın veya belge/görsel yükleyin.', true);
      return;
    }

    // Eğer kullanıcı doğrudan "/" ile ayrılmış hazır Sätze bilden listesi yapıştırdıysa AI'nın kelime eklemesine izin vermeden birebir yükle
    if (text && !state.file) {
      const directParsed = parseDirectSlashExercises(text);
      if (directParsed.length >= 1) {
        state.customExercises = directParsed;
        saveCustomExercises();
        state.sourceSet = 'custom';
        state.currentIndex = 0;
        setExtractStatus('');
        toast(`${directParsed.length} adet cümle hiçbir kelime değiştirilmeden birebir yüklendi!`);
        switchSatzTab('play');
        return;
      }
    }

    state.busy = true;
    const btn = $('btn-satz-extract-generate');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Cümleler Dağıtılıyor &amp; Çekimsizleştiriliyor...</span>';
    }
    setExtractStatus('Belgedeki cümleler dışarıdan kelime eklenmeden çekimsiz ve karışık hale getiriliyor...');

    try {
      const payload = {
        deckMode: 'quiz',
        instruction: `BU BİR 'SÄTZE BILDEN' (BELGEDEKİ CÜMLELERİ KELİME EKLEMEDEN DAĞITMA) GÖREVİDİR.
KESİN KURALLAR:
1) Belgede veya metinde OLMAYAN hiçbir kelimeyi, sıfatı, zarfı veya cümleyi ASLA EKLEME ve UYDURMA! Neyse doğrudan o cümleyi al.
2) Her madde için:
   - lemma alanına: Cümlenin ana fiilini veya kalıbını yaz.
   - contextMeaning alanına: Belgedeki orijinal Almanca cümleyi HİÇBİR KELİME EKLEMEDEN olduğu gibi yaz.
   - sourceSentence alanına: SADECE contextMeaning içindeki kelimeleri çekimsiz yalın halde (isimleri yalın artikeliyle, fiilleri mastar halinde, sıfatları eksiz halde) '/' işaretiyle ayırarak karışık sırada yaz. Cümlede olmayan tek bir kelime bile ekleme!`
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

        if (!rawWords.includes('/') && sampleAnswer) {
          rawWords = sampleAnswer
            .replace(/[.,!?;:"]/g, '')
            .split(/\s+/)
            .filter(Boolean)
            .sort(() => Math.random() - 0.5)
            .join(' / ');
        } else if (rawWords.includes('/') && sampleAnswer) {
          // AI'nın cümlede olmayan kelime eklemesini kesin olarak filtrele
          rawWords = enforceStrictTokensOnExtractedItem(rawWords, sampleAnswer);
        }

        return {
          id: `custom-${Date.now()}-${idx}`,
          num: idx + 1,
          topic,
          rawWords,
          sampleAnswer,
          grammarTip: 'Verilen tüm kelimeleri eksiksiz ve dışarıdan kelime eklemeden çekimleyerek anlamlı bir cümleye dönüştürün.'
        };
      }).filter((item) => item.rawWords && item.rawWords.includes('/'));

      if (!generated.length) {
        throw new Error('Belgeden uygun cümle çıkarılamadı. Lütfen geçerli Almanca cümleler içeren bir metin veya belge deneyin.');
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
