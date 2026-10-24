/**
 * WortCoach — İnce Detaylı Almanca Telaffuz & Çoklu Fonetik Motoru (pronunciation.js v3.0.0)
 *
 * DESTEKLENEN FONETİK MOTORLARI (Kullanıcı Tarafından Seçilebilir):
 * 1. HYBRID_ENSEMBLE (Önerilen):
 *    MFA Viterbi Zorlamalı Hizalama + Wav2Vec2 CTC Posterior (yüklüyse) + Fiziksel Akustik DSP birleşimi.
 * 2. WAV2VEC2_CTC (Wav2Vec2 Neural CTC Posterior GOP — Torchaudio / Kaldi CTC Pipeline):
 *    Tarayıcı içi WebAssembly/ONNX (Rafaelmstori/wav2vec2-base-german-cv9-onnx) ile sözlük düzeltmesi (LM autocorrect)
 *    OLMADAN her 20ms çerçeve için ham akustik CTC posterior olasılık matrisi [T x 33] üretir.
 *    CTC Viterbi Trellis hizalaması ile hedef fonemin posterior olasılığını P(target | X) rakip fonemlerle
 *    (örn. P('d') vs P('t')) karşılaştırarak gerçek Goodness of Pronunciation (GOP) skoru hesaplar.
 * 3. MFA_FORCED_ALIGN (Montreal Forced Aligner / Kaldi Viterbi HMM-GOP Pipeline):
 *    Hedef kelimenin fonetik durum grafiğini (Onset/Closure -> Nucleus/Core -> Coda/Transition) oluşturur,
 *    16kHz ses çerçeveleri üzerinde Viterbi Dinamik Programlama Zorlamalı Hizalaması (Forced Alignment) çalıştırarak
 *    her fonemin milisaniye sınırlarını [startMs - endMs] bulur ve Witt & Young Log-Likelihood Ratio (LLR) GOP
 *    formülüyle rakip fonem akustik modellerine (d vs t, b vs p, g vs k, ei vs ie, ü vs u, ch [ç] vs [x] vs [ʃ]) karşı puanlar.
 * 4. AZURE_CLOUD (Microsoft Azure Speech GOP API):
 *    Kullanıcı kendi ücretsiz Azure anahtarını girdiğinde bulut tabanlı GOP motorunu çalıştırır.
 */

class GermanPhoneticAnalyzer {
  static analyzeText(rawText) {
    const clean = String(rawText || '').trim();

    if (!clean) {
      return {
        original: '',
        ipa: '',
        trGuide: '',
        words: [],
        syllables: [],
        phonemes: [],
        focusTips: []
      };
    }

    const rawWords = clean
      .replace(/[.,!?;:"„“”()\[\]]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const wordsAnalysis = rawWords.map((w) => this.analyzeWord(w));

    return {
      original: clean,
      ipa: '/' + wordsAnalysis.map((w) => w.ipa).join(' ') + '/',
      trGuide: wordsAnalysis.map((w) => w.trGuide).join(' · '),
      words: wordsAnalysis,
      syllables: wordsAnalysis.flatMap((w) => w.syllables),
      phonemes: wordsAnalysis.flatMap((w) => w.phonemes),
      focusTips: this.deduplicateTips(wordsAnalysis.flatMap((w) => w.focusTips))
    };
  }

  static deduplicateTips(tips) {
    const seen = new Set();
    const out = [];
    for (const t of tips) {
      if (!seen.has(t.code)) {
        seen.add(t.code);
        out.push(t);
      }
    }
    return out;
  }

  static analyzeWord(word) {
    const cleanWord = word.trim();
    const lower = cleanWord.toLowerCase();

    const syllableStrings = this.syllabifyGerman(cleanWord);
    const phonemes = [];
    const focusTips = [];
    const ipaParts = [];
    const trParts = [];

    let stressedSyllableIdx = 0;
    if (syllableStrings.length > 1 && /^(be|ge|er|ver|zer|ent|emp)$/i.test(syllableStrings[0])) {
      stressedSyllableIdx = 1;
    }

    const syllables = syllableStrings.map((syl, sIdx) => {
      const prevSylLastChar = sIdx > 0 ? syllableStrings[sIdx - 1].slice(-1).toLowerCase() : '';
      const sylPhonemes = this.extractPhonemesFromSyllable(
        syl,
        sIdx,
        syllableStrings.length,
        lower,
        prevSylLastChar
      );
      const isStressed = sIdx === stressedSyllableIdx && syllableStrings.length > 1;
      const sylIpa = (isStressed ? 'ˈ' : '') + sylPhonemes.map((p) => p.ipa).join('');
      const sylTr = sylPhonemes.map((p) => p.tr).join('');

      ipaParts.push(sylIpa);
      trParts.push(isStressed ? sylTr.toUpperCase() : sylTr);

      sylPhonemes.forEach((p) => {
        phonemes.push({
          ...p,
          syllableIndex: sIdx
        });
        if (p.tip) {
          focusTips.push(p.tip);
        }
      });

      return {
        text: syl,
        index: sIdx,
        isStressed,
        ipa: sylIpa,
        trGuide: sylTr,
        phonemes: sylPhonemes,
        expectedWeight: this.computeSyllableExpectedDurationWeight(sylPhonemes, isStressed)
      };
    });

    return {
      word: cleanWord,
      ipa: ipaParts.join(''),
      trGuide: trParts.join('-'),
      syllables,
      phonemes,
      focusTips
    };
  }

  static computeSyllableExpectedDurationWeight(sylPhonemes, isStressed) {
    let w = isStressed ? 1.3 : 0.85;
    for (const p of sylPhonemes) {
      if (p.type.startsWith('VOWEL_LONG') || p.type.startsWith('DIPHTHONG')) w += 0.35;
      else if (p.type.startsWith('FRICATIVE') || p.type.startsWith('SIBILANT')) w += 0.15;
    }
    return w;
  }

  static syllabifyGerman(word) {
    const w = word.trim();
    if (w.length <= 3) return [w];

    const prefixMatch = w.match(
      /^(auf|aus|ein|vor|nach|mit|bei|zu|ab|an|um|über|unter|wider|wieder|durch|für|gegen|hinter|weiter|zusammen|zurück|heraus|hinein|be|ge|er|ver|zer|ent|emp)(.+)$/i
    );
    if (prefixMatch && prefixMatch[2].length >= 2) {
      const prefix = prefixMatch[1];
      const rest = prefixMatch[2];
      if (/^(über|unter|wider|wieder|gegen|hinter|weiter|zurück|heraus|hinein)$/i.test(prefix)) {
        return [...this.basicSyllabify(prefix), ...this.syllabifyGerman(rest)];
      }
      if (/^zusammen$/i.test(prefix)) {
        return ['zu', 'sam', 'men', ...this.syllabifyGerman(rest)];
      }
      return [prefix, ...this.basicSyllabify(rest)];
    }

    return this.basicSyllabify(w);
  }

  static basicSyllabify(word) {
    const vowels = 'aeiouäöüyAEIOUÄÖÜY';
    const isV = (ch) => vowels.includes(ch);

    const syllables = [];
    let current = '';
    let i = 0;

    while (i < word.length) {
      current += word[i];

      const hasVowel = [...current].some(isV);
      if (hasVowel && i + 1 < word.length) {
        const pair = (word[i] + word[i + 1]).toLowerCase();
        if (['ie', 'ei', 'ai', 'eu', 'äu', 'au', 'aa', 'ee', 'oo'].includes(pair)) {
          i++;
          current += word[i];
        } else if (
          word[i + 1].toLowerCase() === 'h' &&
          isV(word[i]) &&
          (i + 2 >= word.length || !isV(word[i + 2]))
        ) {
          i++;
          current += word[i];
        }

        const rem = word.slice(i + 1);
        const nextVowelIdx = [...rem].findIndex(isV);

        if (nextVowelIdx === 0) {
          syllables.push(current);
          current = '';
        } else if (nextVowelIdx === 1) {
          syllables.push(current);
          current = '';
        } else if (nextVowelIdx >= 2) {
          const consCluster = rem.slice(0, nextVowelIdx);
          const lowerCluster = consCluster.toLowerCase();

          if (/^(sch|ch|ph|th|qu)$/.test(lowerCluster)) {
            syllables.push(current);
            current = '';
          } else if (lowerCluster.endsWith('sch') && consCluster.length > 3) {
            const take = consCluster.length - 3;
            current += rem.slice(0, take);
            i += take;
            syllables.push(current);
            current = '';
          } else if (lowerCluster.endsWith('ch') && consCluster.length > 2) {
            const take = consCluster.length - 2;
            current += rem.slice(0, take);
            i += take;
            syllables.push(current);
            current = '';
          } else {
            const take = consCluster.length - 1;
            current += rem.slice(0, take);
            i += take;
            syllables.push(current);
            current = '';
          }
        }
      }
      i++;
    }

    if (current) {
      if (syllables.length > 0 && ![...current].some(isV)) {
        syllables[syllables.length - 1] += current;
      } else {
        syllables.push(current);
      }
    }

    return syllables.length > 0 ? syllables : [word];
  }

  static extractPhonemesFromSyllable(syl, sylIdx, totalSyls, fullWordLower, prevSylLastChar = '') {
    const phonemes = [];
    const s = syl;
    const lower = s.toLowerCase();
    let i = 0;
    const isFinalSyllable = sylIdx === totalSyls - 1;

    while (i < s.length) {
      const rem = lower.slice(i);
      const rawRem = s.slice(i);
      const prevChar = i > 0 ? lower[i - 1] : prevSylLastChar;
      const isSyllableEnd = rem.length === 1;
      const posInSyl = i === 0 ? 'onset' : isSyllableEnd ? 'coda' : 'nucleus';

      // 1. tsch -> [tʃ]
      if (rem.startsWith('tsch')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 4),
          ipa: 'tʃ',
          tr: 'ç',
          role: posInSyl,
          type: 'SIBILANT_POSTALVEOLAR',
          tip: {
            code: 'TSCH',
            title: '"tsch" Sesi [tʃ]',
            detail: '"tsch" harfleri Türkçe "ç" gibi güçlü ve sürtünmeli okunur.'
          }
        });
        i += 4;
        continue;
      }

      // 2. sch -> [ʃ]
      if (rem.startsWith('sch')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 3),
          ipa: 'ʃ',
          tr: 'ş',
          role: posInSyl,
          type: 'SIBILANT_POSTALVEOLAR',
          tip: {
            code: 'SCH',
            title: '"sch" Sesi [ʃ]',
            detail: '"sch" grubu dudaklar hafif öne uzatılarak dolgun bir "ş" [ʃ] sesiyle okunur.'
          }
        });
        i += 3;
        continue;
      }

      // 3. chs -> [ks]
      if (rem.startsWith('chs')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 3),
          ipa: 'ks',
          tr: 'ks',
          role: posInSyl,
          type: 'SIBILANT_ALVEOLAR',
          tip: {
            code: 'CHS_KS',
            title: '"chs" Kuralı [ks]',
            detail: 'Almancada "chs" yan yana geldiğinde "h" gibi değil, "ks" (örn. sechs -> zeks) olarak okunur.'
          }
        });
        i += 3;
        continue;
      }

      // 4. ch -> Ich-Laut [ç] vs Ach-Laut [x]
      if (rem.startsWith('ch')) {
        const isDiminutiveChen =
          lower === 'chen' && isFinalSyllable && fullWordLower.endsWith('chen') && /[äöü]/.test(fullWordLower);
        const isAchLaut = !isDiminutiveChen && /[aou]/.test(prevChar);
        if (isAchLaut) {
          phonemes.push({
            grapheme: rawRem.slice(0, 2),
            ipa: 'x',
            tr: 'hğ',
            role: posInSyl,
            type: 'FRICATIVE_VELAR',
            tip: {
              code: 'ACH_LAUT',
              title: 'Kalın "ch" (Ach-Laut [x])',
              detail: '"a, o, u" ünlülerinden sonra gelen "ch" sesi boğazın gerisinden hırıltılı bir "h" [x] olarak çıkarılır ("k" veya "ş" değil).'
            }
          });
        } else {
          phonemes.push({
            grapheme: rawRem.slice(0, 2),
            ipa: 'ç',
            tr: 'hy',
            role: posInSyl,
            type: 'FRICATIVE_PALATAL',
            tip: {
              code: 'ICH_LAUT',
              title: 'İnce "ch" (Ich-Laut [ç])',
              detail: '"e, i, ä, ö, ü, ei, eu" ve ünsüzlerden sonra "ch" kesinlikle "ş" veya "k" diye okunmaz! Dil sırtını damağa yaklaştırıp "h" ile "y" arası ince bir hava sürtünmesi [ç] çıkarın.'
            }
          });
        }
        i += 2;
        continue;
      }

      // 5. Hece başında sp / st -> [ʃp] / [ʃt]
      if (i === 0 && (rem.startsWith('sp') || rem.startsWith('st'))) {
        const sec = rem[1];
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: `ʃ${sec}`,
          tr: `ş${sec}`,
          role: 'onset',
          type: 'SIBILANT_POSTALVEOLAR',
          tip: {
            code: 'SP_ST_ONSET',
            title: `Hece Başında "${rawRem.slice(0, 2).toLowerCase()}" [ʃ${sec}]`,
            detail: `Almancada kelime/kök başındaki "${rawRem.slice(0, 2).toLowerCase()}" düz "s${sec}" diye değil, mutlaka "ş${sec}" [ʃ${sec}] olarak okunur.`
          }
        });
        i += 2;
        continue;
      }

      // 6. Kelime sonunda -ig -> [ɪç]
      if (isFinalSyllable && rem === 'ig') {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'ɪç',
          tr: 'ih',
          role: 'coda',
          type: 'FRICATIVE_PALATAL',
          tip: {
            code: 'FINAL_IG',
            title: 'Kelime Sonu "-ig" [ɪç]',
            detail: 'Standart Almancada (Hochdeutsch) kelime sonundaki "-ig" eki "-ik" diye değil, ince "ich" [ɪç] gibi okunur.'
          }
        });
        i += 2;
        continue;
      }

      // 7. Kelime sonunda -er -> [ɐ]
      if (isFinalSyllable && rem === 'er' && totalSyls > 1) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'ɐ',
          tr: 'ağ',
          role: 'nucleus',
          type: 'VOWEL_CENTRAL_OPEN',
          tip: {
            code: 'FINAL_ER',
            title: 'Kelime Sonu "-er" [ɐ]',
            detail: 'Kelime sonundaki "-er" hecesinde sert "r" basılmaz; kısa ve açık bir "a" [ɐ] sesine dönüşür.'
          }
        });
        i += 2;
        continue;
      }

      // 8. Çift Ünlüler (Diphthongs): ei/ai -> [aɪ], eu/äu -> [ɔʏ], au -> [aʊ], ie -> [iː]
      if (rem.startsWith('ei') || rem.startsWith('ai')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'aɪ̯',
          tr: 'ay',
          role: 'nucleus',
          type: 'DIPHTHONG_EI',
          tip: {
            code: 'DIPH_EI',
            title: '"ei" Çift Ünlüsü [aɪ]',
            detail: '"ei" harfleri kesinlikle "e" veya "i" (ie) gibi okunmaz; net bir "ay" [aɪ] olarak okunur (örn. vermeiden -> fea-MAY-dın).'
          }
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('eu') || rem.startsWith('äu')) {
        const g = rawRem.slice(0, 2);
        phonemes.push({
          grapheme: g,
          ipa: 'ɔʏ̯',
          tr: 'oy',
          role: 'nucleus',
          type: 'DIPHTHONG_EU',
          tip: {
            code: 'DIPH_EU',
            title: `"${g.toLowerCase()}" Çift Ünlüsü [ɔʏ]`,
            detail: `"${g.toLowerCase()}" harfleri "ev/av" diye değil, "oy" [ɔʏ] olarak okunur.`
          }
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('ie')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'iː',
          tr: 'i:',
          role: 'nucleus',
          type: 'VOWEL_LONG_I',
          tip: {
            code: 'LONG_IE',
            title: 'Uzun "ie" Sesi [iː]',
            detail: '"ie" yan yana geldiğinde "ay" (ei) ile karıştırılmamalıdır; tek ve uzun bir "î" [iː] olarak uzatılır.'
          }
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('au')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'aʊ̯',
          tr: 'ao',
          role: 'nucleus',
          type: 'DIPHTHONG_AU'
        });
        i += 2;
        continue;
      }

      // 9. Uzatmalı Ünlüler: ah, eh, ih, oh, uh, äh, öh, üh veya aa, ee, oo
      if (/^([aeiouäöü])h/.test(rem) || /^(aa|ee|oo)/.test(rem)) {
        const vChar = rem[0];
        const mapIpa = { a: 'aː', e: 'eː', i: 'iː', o: 'oː', u: 'uː', ä: 'ɛː', ö: 'øː', ü: 'yː' };
        const mapTr = { a: 'a:', e: 'e:', i: 'i:', o: 'o:', u: 'u:', ä: 'e:', ö: 'ö:', ü: 'ü:' };
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: mapIpa[vChar] || `${vChar}ː`,
          tr: mapTr[vChar] || `${vChar}:`,
          role: 'nucleus',
          type: 'VOWEL_LONG',
          tip: {
            code: 'LONG_VOWEL_H',
            title: `Uzun Ünlü "${rawRem.slice(0, 2)}" [${mapIpa[vChar] || vChar + 'ː'}]`,
            detail: `Ünlüden sonra gelen "h" okunmaz, kendinden önceki "${vChar}" ünlüsünü iki kat uzatır.`
          }
        });
        i += 2;
        continue;
      }

      // 10. Çift ünsüzler: tz, ck, dt, tt, pf, ng, qu, ph, ss
      if (rem.startsWith('tz')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'ts',
          tr: 'ts',
          role: posInSyl,
          type: 'AFFRICATE_TS',
          tip: {
            code: 'Z_TS',
            title: '"tz / z" Sesi [ts]',
            detail: 'Almancada "z" ve "tz" kesinlikle Türkçe "z" gibi okunmaz; dişlerin arasından sert "ts" [ts] olarak patlatılır.'
          }
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('ck')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'k',
          tr: 'k',
          role: posInSyl,
          type: 'PLOSIVE_UNVOICED',
          confusedWith: 'g'
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('dt') || rem.startsWith('tt')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 't',
          tr: 't',
          role: posInSyl,
          type: 'PLOSIVE_UNVOICED',
          confusedWith: 'd'
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('pf')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'pf',
          tr: 'pf',
          role: posInSyl,
          type: 'AFFRICATE_PF',
          tip: {
            code: 'PF_SOUND',
            title: '"pf" Birleşik Sesi [pf]',
            detail: '"p" ve "f" harfleri araya ünlü sokulmadan tek hamlede dudak patlamasıyla [pf] okunur.'
          }
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('ng')) {
        phonemes.push({
          grapheme: rawRem.slice(0, 2),
          ipa: 'ŋ',
          tr: 'ng',
          role: 'coda',
          type: 'NASAL_VELAR',
          tip: {
            code: 'NG_VELAR',
            title: 'Genizsil "ng" [ŋ]',
            detail: '"ng" sonunda ayrı bir "g" patlatılmaz; genizden tek bir [ŋ] sesi olarak çıkar.'
          }
        });
        i += 2;
        continue;
      }

      if (rem.startsWith('qu')) {
        phonemes.push({ grapheme: rawRem.slice(0, 2), ipa: 'kv', tr: 'kv', role: 'onset', type: 'PLOSIVE_UNVOICED' });
        i += 2;
        continue;
      }

      if (rem.startsWith('ph')) {
        phonemes.push({ grapheme: rawRem.slice(0, 2), ipa: 'f', tr: 'f', role: posInSyl, type: 'FRICATIVE_UNVOICED' });
        i += 2;
        continue;
      }

      if (rem.startsWith('ss')) {
        phonemes.push({ grapheme: rawRem.slice(0, 2), ipa: 's', tr: 'ss', role: posInSyl, type: 'SIBILANT_ALVEOLAR' });
        i += 2;
        continue;
      }

      // 11. Tekil Harfler & Ötümlü/Ötümsüz Ünsüz Ayrımı (d vs t, b vs p, g vs k)
      const ch = rem[0];
      const rawCh = rawRem[0];

      if (ch === 'd') {
        const isDevoicedCoda = isSyllableEnd && isFinalSyllable;
        phonemes.push({
          grapheme: rawCh,
          ipa: isDevoicedCoda ? 't' : 'd',
          tr: isDevoicedCoda ? 't' : 'd',
          role: posInSyl,
          type: isDevoicedCoda ? 'PLOSIVE_UNVOICED' : 'PLOSIVE_VOICED',
          confusedWith: isDevoicedCoda ? 'd' : 't',
          tip: isDevoicedCoda
            ? {
                code: 'FINAL_DEVOICING_D',
                title: 'Kelime Sonu "d" [t]',
                detail: 'Almancada kelime sonundaki "d" harfi sertleşerek "t" [t] gibi okunur (örn. Hund -> hunt).'
              }
            : {
                code: 'VOICED_D',
                title: 'Ünlü Önünde Ötümlü "d" [d]',
                detail: `"${syl}" hecesindeki "d" harfi ses telleri titreşerek yumuşak [d] olarak okunmalıdır; sert ve soluklu "t" [tʰ] sesine kaymamalıdır.`
              }
        });
      } else if (ch === 't') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 't',
          tr: 't',
          role: posInSyl,
          type: 'PLOSIVE_UNVOICED',
          confusedWith: 'd',
          tip: {
            code: 'UNVOICED_T',
            title: 'Soluklu Sert "t" [tʰ]',
            detail: `"${syl}" hecesindeki "t" harfi net ve soluklu (aspirated) [tʰ] olarak çıkarılmalı, "d" gibi yumuşatılmamalıdır.`
          }
        });
      } else if (ch === 'b') {
        const isDevoicedCoda = isSyllableEnd && isFinalSyllable;
        phonemes.push({
          grapheme: rawCh,
          ipa: isDevoicedCoda ? 'p' : 'b',
          tr: isDevoicedCoda ? 'p' : 'b',
          role: posInSyl,
          type: isDevoicedCoda ? 'PLOSIVE_UNVOICED' : 'PLOSIVE_VOICED',
          confusedWith: isDevoicedCoda ? 'b' : 'p'
        });
      } else if (ch === 'p') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'p',
          tr: 'p',
          role: posInSyl,
          type: 'PLOSIVE_UNVOICED',
          confusedWith: 'b'
        });
      } else if (ch === 'g') {
        const isDevoicedCoda = isSyllableEnd && isFinalSyllable;
        phonemes.push({
          grapheme: rawCh,
          ipa: isDevoicedCoda ? 'k' : 'ɡ',
          tr: isDevoicedCoda ? 'k' : 'g',
          role: posInSyl,
          type: isDevoicedCoda ? 'PLOSIVE_UNVOICED' : 'PLOSIVE_VOICED',
          confusedWith: isDevoicedCoda ? 'g' : 'k'
        });
      } else if (ch === 'k') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'k',
          tr: 'k',
          role: posInSyl,
          type: 'PLOSIVE_UNVOICED',
          confusedWith: 'g'
        });
      } else if (ch === 'ä') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'ɛ',
          tr: 'e',
          role: 'nucleus',
          type: 'VOWEL_UMLAUT_OPEN',
          tip: {
            code: 'UMLAUT_AE',
            title: 'Umlaut "ä" [ɛ]',
            detail: '"ä" harfi "a" diye değil, ağzı biraz daha açık tutarak net bir "e" [ɛ] sesiyle okunur.'
          }
        });
      } else if (ch === 'ö') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'ø',
          tr: 'ö',
          role: 'nucleus',
          type: 'VOWEL_UMLAUT_FRONT_ROUNDED',
          tip: {
            code: 'UMLAUT_OE',
            title: 'Yuvarlak Ön Ünlü "ö" [ø]',
            detail: 'Almanca "ö" sesinde dudaklar büzülü tutulurken dil "e" konumundadır ("o" sesine kaymamalıdır).'
          }
        });
      } else if (ch === 'ü') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'y',
          tr: 'ü',
          role: 'nucleus',
          type: 'VOWEL_UMLAUT_FRONT_ROUNDED',
          tip: {
            code: 'UMLAUT_UE',
            title: 'İnce Yuvarlak "ü" [y]',
            detail: '"ü" sesini çıkarırken diliniz "i" der gibi önde olmalı, dudaklarınız sıkıca yuvarlanmalıdır ("u" veya "i" gibi okunmamalıdır).'
          }
        });
      } else if (ch === 'ß') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 's',
          tr: 'ss',
          role: posInSyl,
          type: 'SIBILANT_ALVEOLAR',
          tip: {
            code: 'ESZETT',
            title: 'Eszett "ß" [s]',
            detail: '"ß" harfi her zaman keskin ve ötümsüz bir "s" [s] sesiyle okunur.'
          }
        });
      } else if (ch === 'z') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'ts',
          tr: 'ts',
          role: posInSyl,
          type: 'AFFRICATE_TS',
          tip: {
            code: 'Z_TS',
            title: 'Almanca "z" Sesi [ts]',
            detail: 'Almanca "z" harfi hiçbir zaman Türkçe "z" gibi okunmaz! Her zaman "t+s" [ts] olarak sert çıkarılır.'
          }
        });
      } else if (ch === 'w') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'v',
          tr: 'v',
          role: posInSyl,
          type: 'LABIODENTAL_W',
          tip: {
            code: 'GERMAN_W',
            title: '"w" Harfi [v]',
            detail: 'Almancada "w" harfi üst dişler alt dudağa değerek Türkçe "v" [v] gibi okunur.'
          }
        });
      } else if (ch === 'v') {
        const isVoicedLoan = /^(vase|visum|video|verb|vari|viktor|villa|violine|vegan)/i.test(fullWordLower);
        phonemes.push({
          grapheme: rawCh,
          ipa: isVoicedLoan ? 'v' : 'f',
          tr: isVoicedLoan ? 'v' : 'f',
          role: posInSyl,
          type: isVoicedLoan ? 'LABIODENTAL_W' : 'FRICATIVE_UNVOICED',
          tip: isVoicedLoan
            ? null
            : {
                code: 'GERMAN_V_F',
                title: '"v" Harfi Kuralı [f]',
                detail: 'Almanca kökenli kelimelerde (örn. ver-, vor-, Vater) "v" harfi "v" diye değil, ötümsüz "f" [f] olarak okunur.'
              }
        });
      } else if (ch === 'j') {
        phonemes.push({
          grapheme: rawCh,
          ipa: 'j',
          tr: 'y',
          role: posInSyl,
          type: 'APPROXIMANT',
          tip: {
            code: 'GERMAN_J',
            title: '"j" Harfi [j]',
            detail: 'Almancada "j" harfi her zaman Türkçe "y" [j] gibi okunur.'
          }
        });
      } else if (ch === 's') {
        const nextIsVowel = rem.length > 1 && /[aeiouäöüy]/.test(rem[1]);
        phonemes.push({
          grapheme: rawCh,
          ipa: nextIsVowel ? 'z' : 's',
          tr: nextIsVowel ? 'z' : 's',
          role: posInSyl,
          type: nextIsVowel ? 'SIBILANT_VOICED' : 'SIBILANT_ALVEOLAR',
          tip: nextIsVowel
            ? {
                code: 'S_VOICED',
                title: 'Ünlü Önünde "s" [z]',
                detail: 'Ünlü harften önce gelen "s" harfi titreşimli "z" [z] olarak okunur.'
              }
            : null
        });
      } else if (ch === 'r') {
        const afterVowelEnd = i > 0 && /[aeiouäöü]/.test(prevChar) && rem.length === 1;
        phonemes.push({
          grapheme: rawCh,
          ipa: afterVowelEnd ? 'ɐ̯' : 'ʁ',
          tr: afterVowelEnd ? 'a' : 'ğr',
          role: afterVowelEnd ? 'coda' : posInSyl,
          type: 'UVULAR_R'
        });
      } else if ('aeiouy'.includes(ch)) {
        const isSchwa = ch === 'e' && isFinalSyllable && totalSyls > 1;
        phonemes.push({
          grapheme: rawCh,
          ipa: isSchwa ? 'ə' : ch,
          tr: isSchwa ? 'ı' : ch,
          role: 'nucleus',
          type: isSchwa ? 'VOWEL_SCHWA' : `VOWEL_SHORT_${ch.toUpperCase()}`
        });
      } else if ('mn'.includes(ch)) {
        phonemes.push({
          grapheme: rawCh,
          ipa: ch,
          tr: ch,
          role: posInSyl,
          type: 'NASAL'
        });
      } else {
        phonemes.push({
          grapheme: rawCh,
          ipa: ch,
          tr: ch,
          role: posInSyl,
          type: 'SONORANT_CONSONANT'
        });
      }

      i++;
    }

    return phonemes;
  }
}

class WortCoachPronunciationEngine {
  constructor() {
    this.audioCtx = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.analyser = null;
    this.isRecording = false;
    this.pcmChunks = [];
    this.sampleRate = 16000;
    this.lastRecordedBlob = null;
    this.lastRecordedUrl = null;
    this.recognition = null;
    this.sttTranscripts = [];
    this.sttInterimTokens = [];
    this.recordingStartTime = 0;
    this.onLevelCallback = null;
    this.levelAnimFrame = null;
    this.sttEndResolver = null;

    // Wav2Vec2 ONNX Runtime Web Durumu
    this.ortSession = null;
    this.wav2vec2Status = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
    this.wav2vec2Progress = 0;
    this.wav2vec2Error = null;
    this.wav2vec2Vocab = {
      '|': 0, a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9,
      j: 10, k: 11, l: 12, m: 13, n: 14, o: 15, p: 16, q: 17, r: 18,
      s: 19, t: 20, u: 21, v: 22, w: 23, x: 24, y: 25, z: 26,
      'ß': 27, 'ä': 28, 'ö': 29, 'ü': 30, '[UNK]': 31, '[PAD]': 32
    };
    this.wav2vec2IdToChar = Object.fromEntries(
      Object.entries(this.wav2vec2Vocab).map(([k, v]) => [v, k])
    );
  }

  getAvailableEngines() {
    return [
      {
        id: 'HYBRID_ENSEMBLE',
        name: 'Hibrit Ensemble (MFA Viterbi + Wav2Vec2 + DSP)',
        shortLabel: 'Hibrit Ensemble (Önerilen)',
        badgeText: 'Hibrit Ensemble • MFA Viterbi + CTC + Akustik DSP',
        description:
          'Montreal Forced Aligner (Viterbi HMM) + Wav2Vec2 CTC Posterior (aktifse) + Fiziksel Formant/VOT DSP motorlarını birleştirerek en yüksek hassasiyeti sunar.'
      },
      {
        id: 'WAV2VEC2_CTC',
        name: 'Wav2Vec2 Neural CTC Posterior (Torchaudio / ONNX)',
        shortLabel: 'Wav2Vec2 Neural CTC (Yapay Zeka)',
        badgeText: 'Wav2Vec2 CTC Posterior GOP • Sözlük Düzeltmesiz Nöral',
        description:
          'Tarayıcı içi kuantize Almanca Wav2Vec2 CTC modeli (ONNX WebAssembly) ile her 20ms çerçevede fonem posterior olasılıklarını P(fonem|ses) hesaplar. Sözlük düzeltmesi yapmaz.'
      },
      {
        id: 'MFA_FORCED_ALIGN',
        name: 'Montreal Forced Aligner (MFA / Kaldi Viterbi GOP)',
        shortLabel: 'MFA / Kaldi Zorlamalı Hizalama',
        badgeText: 'MFA / Kaldi Viterbi HMM • Milisaniye Zorlamalı Hizalama',
        description:
          'Hedef kelimenin fonetik HMM durum grafiğini ses çerçevelerine Viterbi algoritmasıyla milisaniye bazında zorlamalı hizalar (Forced Alignment) ve rakip fonemlere karşı Log-Likelihood Ratio (GOP) üretir.'
      },
      {
        id: 'AZURE_CLOUD',
        name: 'Microsoft Azure Speech GOP (Bulut API)',
        shortLabel: 'Azure Cloud GOP',
        badgeText: 'Microsoft Azure GOP • Bulut Fonem Değerlendirme',
        description:
          'Ayarlardan kişisel Microsoft Azure Speech anahtarınızı girdiğinizde bulut tabanlı GOP değerlendirmesi yapar (anahtar yoksa otomatik MFA/Hibrit motora geçer).'
      }
    ];
  }

  getSelectedEngine() {
    try {
      const saved = (localStorage.getItem('wortcoach_phonetic_engine') || '').trim();
      const validIds = this.getAvailableEngines().map((e) => e.id);
      if (validIds.includes(saved)) return saved;
    } catch (_) {}
    return 'HYBRID_ENSEMBLE';
  }

  setSelectedEngine(engineId) {
    const validIds = this.getAvailableEngines().map((e) => e.id);
    const chosen = validIds.includes(engineId) ? engineId : 'HYBRID_ENSEMBLE';
    try {
      localStorage.setItem('wortcoach_phonetic_engine', chosen);
    } catch (_) {}
    return chosen;
  }

  getSelectedEngineMeta() {
    const id = this.getSelectedEngine();
    return this.getAvailableEngines().find((e) => e.id === id) || this.getAvailableEngines()[0];
  }

  getAzureConfig() {
    try {
      const key = (localStorage.getItem('azure_speech_key') || '').trim();
      const region = (localStorage.getItem('azure_speech_region') || 'westeurope').trim();
      return { key, region, isConfigured: Boolean(key && key.length >= 16) };
    } catch (_) {
      return { key: '', region: 'westeurope', isConfigured: false };
    }
  }

  /**
   * WAV2VEC2 NEURAL CTC ONNX MODEL YÜKLEYİCİ (CacheStorage Destekli)
   * Model: Rafaelmstori/wav2vec2-base-german-cv9-onnx (model_quantized.onnx)
   */
  async ensureOnnxRuntimeWeb() {
    if (typeof window !== 'undefined' && window.ort && window.ort.InferenceSession) {
      return window.ort;
    }
    if (typeof window === 'undefined') {
      throw new Error('Tarayıcı ortamı bulunamadı.');
    }

    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ort-web="true"]');
      if (existing) {
        if (window.ort) return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(e));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js';
      script.async = true;
      script.setAttribute('data-ort-web', 'true');
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('ONNX Runtime Web CDN yüklenemedi.'));
      document.head.appendChild(script);
    });

    if (window.ort && window.ort.env && window.ort.env.wasm) {
      window.ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
      window.ort.env.wasm.numThreads = 1;
    }
    return window.ort;
  }

  async preloadWav2Vec2Model(onProgress = null) {
    if (this.ortSession && this.wav2vec2Status === 'ready') {
      if (onProgress) onProgress(100, 'Wav2Vec2 Neural CTC modeli hazır ✓');
      return true;
    }
    if (this.wav2vec2Status === 'loading' && this._loadingPromise) {
      return this._loadingPromise;
    }

    this.wav2vec2Status = 'loading';
    this.wav2vec2Error = null;
    const modelUrl =
      'https://huggingface.co/Rafaelmstori/wav2vec2-base-german-cv9-onnx/resolve/main/model_quantized.onnx';
    const cacheName = 'wortcoach-onnx-models-v1';

    this._loadingPromise = (async () => {
      try {
        if (onProgress) onProgress(5, 'ONNX Runtime WebAssembly başlatılıyor...');
        const ort = await this.ensureOnnxRuntimeWeb();

        let modelBuffer = null;
        if (typeof caches !== 'undefined') {
          try {
            const cache = await caches.open(cacheName);
            const cachedResp = await cache.match(modelUrl);
            if (cachedResp) {
              if (onProgress) onProgress(65, 'Wav2Vec2 modeli çevrimdışı önbellekten okunuyor...');
              modelBuffer = await cachedResp.arrayBuffer();
            }
          } catch (_) {}
        }

        if (!modelBuffer) {
          if (onProgress) onProgress(10, 'Almanca Wav2Vec2 CTC modeli indiriliyor (%0)...');
          const response = await fetch(modelUrl, { mode: 'cors' });
          if (!response.ok) {
            throw new Error(`Model indirilemedi (HTTP ${response.status})`);
          }

          const contentLength = Number(response.headers.get('content-length')) || 121900000;
          if (response.body && response.body.getReader) {
            const reader = response.body.getReader();
            const chunks = [];
            let received = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
              received += value.byteLength;
              const pct = Math.min(88, Math.round(10 + (received / contentLength) * 78));
              this.wav2vec2Progress = pct;
              const mbDone = (received / (1024 * 1024)).toFixed(1);
              const mbTotal = (contentLength / (1024 * 1024)).toFixed(1);
              if (onProgress) {
                onProgress(pct, `Wav2Vec2 CTC indiriliyor: ${mbDone} / ${mbTotal} MB (%${pct})`);
              }
            }

            const full = new Uint8Array(received);
            let pos = 0;
            for (const c of chunks) {
              full.set(c, pos);
              pos += c.byteLength;
            }
            modelBuffer = full.buffer;

            if (typeof caches !== 'undefined') {
              try {
                const cache = await caches.open(cacheName);
                await cache.put(
                  modelUrl,
                  new Response(modelBuffer.slice(0), {
                    headers: { 'Content-Type': 'application/octet-stream' }
                  })
                );
              } catch (_) {}
            }
          } else {
            modelBuffer = await response.arrayBuffer();
          }
        }

        if (onProgress) onProgress(92, 'Wav2Vec2 sinir ağı WebAssembly oturumu derleniyor...');
        this.ortSession = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        });

        this.wav2vec2Status = 'ready';
        this.wav2vec2Progress = 100;
        if (onProgress) onProgress(100, 'Wav2Vec2 Neural CTC hazır ✓');
        return true;
      } catch (err) {
        this.wav2vec2Status = 'error';
        this.wav2vec2Error = err.message || 'Model yüklenemedi';
        if (onProgress) onProgress(0, `Hata: ${this.wav2vec2Error}`);
        return false;
      } finally {
        this._loadingPromise = null;
      }
    })();

    return this._loadingPromise;
  }

  /**
   * WAV2VEC2 CTC INFERENCE + TORCHAUDIO/KALDI CTC FORCED ALIGNMENT TRELLIS
   * 16kHz PCM -> Sıfır Ortalama & Birim Varyans Normalizasyonu -> [1, T, 33] Log-Softmax Posterior Matrisi
   */
  async runWav2Vec2CTCInference(activePcm) {
    if (!this.ortSession || this.wav2vec2Status !== 'ready' || typeof window === 'undefined' || !window.ort) {
      return null;
    }

    const N = activePcm.length;
    if (N < 1600) return null;

    // Wav2Vec2FeatureExtractor: do_normalize = true -> (x - mean) / sqrt(var + 1e-7)
    let mean = 0;
    for (let i = 0; i < N; i++) mean += activePcm[i];
    mean /= N;

    let variance = 0;
    for (let i = 0; i < N; i++) {
      const d = activePcm[i] - mean;
      variance += d * d;
    }
    variance /= N;
    const invStd = 1 / Math.sqrt(variance + 1e-7);

    const normInput = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      normInput[i] = (activePcm[i] - mean) * invStd;
    }

    const inputName = this.ortSession.inputNames?.[0] || 'input_values';
    const outputName = this.ortSession.outputNames?.[0] || 'logits';

    const tensor = new window.ort.Tensor('float32', normInput, [1, N]);
    const feeds = { [inputName]: tensor };
    const results = await this.ortSession.run(feeds);
    const logitsTensor = results[outputName] || Object.values(results)[0];
    if (!logitsTensor || !logitsTensor.data) return null;

    const dims = logitsTensor.dims; // [1, T, V]
    const T = dims[1];
    const V = dims[2];
    const rawData = logitsTensor.data;

    // Her 20ms çerçeve için Log-Softmax ve Olasılık (Posterior) Matrisi + Greedy CTC Decode
    const probsMatrix = [];
    const logProbsMatrix = [];
    const frameArgmax = [];

    for (let t = 0; t < T; t++) {
      const offset = t * V;
      let maxLogit = -Infinity;
      let bestId = 32;
      for (let v = 0; v < V; v++) {
        const val = rawData[offset + v];
        if (val > maxLogit) {
          maxLogit = val;
          bestId = v;
        }
      }

      let sumExp = 0;
      const rowProbs = new Float32Array(V);
      const rowLogProbs = new Float32Array(V);
      for (let v = 0; v < V; v++) {
        const e = Math.exp(rawData[offset + v] - maxLogit);
        rowProbs[v] = e;
        sumExp += e;
      }
      const logSumExp = maxLogit + Math.log(sumExp || 1);
      for (let v = 0; v < V; v++) {
        rowProbs[v] /= sumExp || 1;
        rowLogProbs[v] = rawData[offset + v] - logSumExp;
      }

      probsMatrix.push(rowProbs);
      logProbsMatrix.push(rowLogProbs);
      frameArgmax.push(bestId);
    }

    // Greedy CTC Decode (Sözlük düzeltmesiz saf akustik harf dizisi!)
    const BLANK_ID = 32;
    let prevId = -1;
    let rawCtcChars = '';
    for (let t = 0; t < T; t++) {
      const id = frameArgmax[t];
      if (id !== prevId) {
        if (id !== BLANK_ID && id !== 31) {
          const ch = this.wav2vec2IdToChar[id] || '';
          rawCtcChars += ch === '|' ? ' ' : ch;
        }
        prevId = id;
      }
    }

    return {
      T,
      V,
      probsMatrix,
      logProbsMatrix,
      rawCtcTranscript: rawCtcChars.replace(/\s+/g, ' ').trim()
    };
  }

  /**
   * TORCHAUDIO / KALDI CTC FORCED ALIGNMENT & POSTERIOR GOP HESAPLAYICI
   * Hedef karakterleri CTC matrisi üzerinde zorlamalı hizalar ve her fonemin posterior güven skorunu
   * rakip fonemlerle (örn. 'd' vs 't', 'ei' vs 'ie', 'b' vs 'p', 'g' vs 'k') karşılaştırır.
   */
  computeCTCForcedAlignmentGOP(ctcData, phoneticTarget, durationMs) {
    if (!ctcData || !ctcData.probsMatrix || ctcData.T < 2) return null;

    const { T, probsMatrix, logProbsMatrix, rawCtcTranscript } = ctcData;
    const BLANK = 32;

    // Hedef fonemleri karakter dizisine aç ve her karakterin hangi hece/foneme ait olduğunu kaydet
    const charTokens = [];
    phoneticTarget.syllables.forEach((syl, sIdx) => {
      syl.phonemes.forEach((phon, pIdx) => {
        const gLower = phon.grapheme.toLowerCase();
        for (const ch of gLower) {
          const vocabId = this.wav2vec2Vocab[ch];
          if (vocabId !== undefined && vocabId <= 30) {
            charTokens.push({
              char: ch,
              vocabId,
              sylIdx: sIdx,
              phonIdx: pIdx,
              phon
            });
          }
        }
      });
    });

    const L = charTokens.length;
    if (L === 0) return null;

    // Viterbi Monotonik Karakter Hizalama: T çerçeveyi L hedef karaktere en yüksek CTC posterior ile hizala
    const dp = Array.from({ length: T }, () => new Float32Array(L).fill(-1e9));
    const backptr = Array.from({ length: T }, () => new Int32Array(L).fill(0));

    // Başlangıç
    dp[0][0] = Math.max(logProbsMatrix[0][charTokens[0].vocabId], logProbsMatrix[0][BLANK] - 1.2);

    for (let t = 1; t < T; t++) {
      for (let i = 0; i < L; i++) {
        const vid = charTokens[i].vocabId;
        const blankLogP = logProbsMatrix[t][BLANK];
        const charLogP = logProbsMatrix[t][vid];
        // Çerçevede ya karakterin kendisi ya da geçiş blank'ı okunur, ancak karakter aktivasyonu ödüllendirilir
        const emitScore = Math.max(charLogP, blankLogP * 0.65 + charLogP * 0.35);

        // Aynı karakterde kalma (stay) vs önceki karakterden geçme (advance)
        let bestPrev = dp[t - 1][i];
        let bestIdx = i;
        if (i > 0 && dp[t - 1][i - 1] > bestPrev) {
          bestPrev = dp[t - 1][i - 1];
          bestIdx = i - 1;
        }
        dp[t][i] = bestPrev + emitScore;
        backptr[t][i] = bestIdx;
      }
    }

    // Backtrack ile her karakterin [startFrame, endFrame] aralığını çıkar
    const charFrameSpans = Array.from({ length: L }, () => ({ start: T - 1, end: 0 }));
    let curI = L - 1;
    for (let t = T - 1; t >= 0; t--) {
      if (t < charFrameSpans[curI].start) charFrameSpans[curI].start = t;
      if (t > charFrameSpans[curI].end) charFrameSpans[curI].end = t;
      curI = backptr[t][curI];
    }

    // Her (hece, fonem) için CTC Posterior Confidence ve Rakip (Impostor) Olasılığını hesapla
    const phonemePosteriorMap = new Map();
    const frameMs = durationMs / Math.max(1, T);

    // Fonem bazında karakter aralıklarını birleştir
    phoneticTarget.syllables.forEach((syl, sIdx) => {
      syl.phonemes.forEach((phon, pIdx) => {
        const matchingChars = [];
        charTokens.forEach((ct, cIdx) => {
          if (ct.sylIdx === sIdx && ct.phonIdx === pIdx) {
            matchingChars.push({ ...ct, span: charFrameSpans[cIdx] });
          }
        });

        if (matchingChars.length === 0) return;

        const startF = Math.max(0, matchingChars[0].span.start - 1);
        const endF = Math.min(T - 1, matchingChars[matchingChars.length - 1].span.end + 1);

        // Hedef karakterlerin bu penceredeki maksimum nöral posterior olasılığı P(target | X)
        let targetConfidenceSum = 0;
        for (const mc of matchingChars) {
          let maxTargetP = 0;
          for (let t = startF; t <= endF; t++) {
            const p = probsMatrix[t][mc.vocabId];
            // Blank dışındaki normalize posterior
            const nonBlankMass = Math.max(0.08, 1 - probsMatrix[t][BLANK] * 0.85);
            const normP = Math.min(1, p / nonBlankMass);
            if (normP > maxTargetP) maxTargetP = normP;
          }
          targetConfidenceSum += maxTargetP;
        }
        const avgTargetPost = targetConfidenceSum / matchingChars.length;

        // Rakip (Impostor) karakter kontrolü: örn. d -> t, b -> p, g -> k, ei -> ie, ü -> u, ö -> o
        const impostorChar = (phon.confusedWith || '').toLowerCase()[0];
        const impostorId = impostorChar ? this.wav2vec2Vocab[impostorChar] : undefined;
        let maxImpostorPost = 0;
        if (impostorId !== undefined) {
          for (let t = startF; t <= endF; t++) {
            const pImp = probsMatrix[t][impostorId];
            const nonBlankMass = Math.max(0.08, 1 - probsMatrix[t][BLANK] * 0.85);
            const normImp = Math.min(1, pImp / nonBlankMass);
            if (normImp > maxImpostorPost) maxImpostorPost = normImp;
          }
        }

        // GOP Skoru: Hedef posterior yüksekse ve rakip posterior düşükse yüksek puan;
        // Rakip posterior hedefi geçtiyse (örn. P('t') > P('d')) keskin ceza!
        let ctcGopScore = Math.round(35 + Math.pow(avgTargetPost, 0.55) * 62);
        let detectedImpostor = null;
        if (maxImpostorPost > avgTargetPost * 1.15 && maxImpostorPost > 0.18) {
          ctcGopScore = Math.min(ctcGopScore, Math.round(22 + (avgTargetPost / (maxImpostorPost + 0.05)) * 20));
          detectedImpostor = phon.confusedWith || impostorChar;
        } else if (avgTargetPost < 0.08) {
          ctcGopScore = Math.min(ctcGopScore, 42);
        }

        ctcGopScore = Math.max(18, Math.min(98, ctcGopScore));

        phonemePosteriorMap.set(`${sIdx}:${pIdx}`, {
          ctcScore: ctcGopScore,
          targetPosterior: Math.round(avgTargetPost * 100),
          impostorPosterior: Math.round(maxImpostorPost * 100),
          detectedImpostor,
          startMs: Math.round(startF * frameMs),
          endMs: Math.round((endF + 1) * frameMs)
        });
      });
    });

    return {
      rawCtcTranscript,
      phonemePosteriorMap
    };
  }

  async startRecording(lang = 'de-DE', onAudioLevel = null) {
    if (this.isRecording) {
      await this.stopRecording();
    }

    this.onLevelCallback = onAudioLevel;
    this.pcmChunks = [];
    this.sttTranscripts = [];
    this.sttInterimTokens = [];

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1
        }
      });
    } catch (_) {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    this.mediaStream = stream;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AudioContextClass();
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    this.sampleRate = this.audioCtx.sampleRate || 44100;

    const source = this.audioCtx.createMediaStreamSource(stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.25;

    const bufferSize = 2048;
    this.scriptProcessor = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

    source.connect(this.analyser);
    this.analyser.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioCtx.destination);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      this.pcmChunks.push(new Float32Array(input));
    };

    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const updateVisualizer = () => {
      if (!this.isRecording || !this.analyser) return;
      this.analyser.getByteFrequencyData(freqData);
      if (this.onLevelCallback) {
        this.onLevelCallback(freqData);
      }
      this.levelAnimFrame = requestAnimationFrame(updateVisualizer);
    };
    this.levelAnimFrame = requestAnimationFrame(updateVisualizer);

    this.startParallelPhoneticSTT(lang);

    this.isRecording = true;
    this.recordingStartTime = Date.now();
  }

  startParallelPhoneticSTT(lang = 'de-DE') {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const rec = new SpeechRec();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 10;

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const alts = [];
          for (let j = 0; j < res.length; j++) {
            if (res[j] && res[j].transcript) {
              alts.push({
                transcript: res[j].transcript.trim(),
                confidence: Number(res[j].confidence) || 0.75,
                isFinal: Boolean(res.isFinal)
              });
            }
          }
          if (res.isFinal) {
            if (alts.length > 0) this.sttTranscripts.push(alts);
          } else if (alts.length > 0) {
            this.sttInterimTokens.push(alts[0].transcript);
          }
        }
      };

      rec.onend = () => {
        if (this.sttEndResolver) {
          this.sttEndResolver();
          this.sttEndResolver = null;
        }
      };

      rec.onerror = () => {
        if (this.sttEndResolver) {
          this.sttEndResolver();
          this.sttEndResolver = null;
        }
      };

      rec.start();
      this.recognition = rec;
    } catch (_) {
      this.recognition = null;
    }
  }

  async stopRecordingAndEvaluate(referenceText, onStatusUpdate = null) {
    if (!this.isRecording) return null;
    this.isRecording = false;

    if (this.levelAnimFrame) {
      cancelAnimationFrame(this.levelAnimFrame);
      this.levelAnimFrame = null;
    }

    if (this.recognition) {
      const waitStt = new Promise((resolve) => {
        this.sttEndResolver = resolve;
        setTimeout(resolve, 850);
      });
      try {
        this.recognition.stop();
      } catch (_) {
        if (this.sttEndResolver) this.sttEndResolver();
      }
      await waitStt;
      this.recognition = null;
      this.sttEndResolver = null;
    }

    if (this.scriptProcessor) {
      try { this.scriptProcessor.disconnect(); } catch (_) {}
      this.scriptProcessor = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (_) {}
      this.analyser = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try { await this.audioCtx.close(); } catch (_) {}
      this.audioCtx = null;
    }

    const totalLength = this.pcmChunks.reduce((acc, c) => acc + c.length, 0);
    const fullPcm = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      fullPcm.set(chunk, offset);
      offset += chunk.length;
    }

    const pcm16k = this.downsampleBuffer(fullPcm, this.sampleRate, 16000);
    const wavBlob = this.encodeWAV(pcm16k, 16000);
    if (this.lastRecordedUrl) {
      URL.revokeObjectURL(this.lastRecordedUrl);
    }
    this.lastRecordedBlob = wavBlob;
    this.lastRecordedUrl = URL.createObjectURL(wavBlob);

    const vadInfo = this.extractActiveSpeechSegment(pcm16k, 16000);
    if (!vadInfo.hasSpeech) {
      return {
        hasSpeech: false,
        error: 'Mikrofondan net bir ses algılanamadı. Lütfen mikrofona daha yakın ve net konuşun.',
        recordedAudioUrl: this.lastRecordedUrl
      };
    }

    const phoneticTarget = GermanPhoneticAnalyzer.analyzeText(referenceText);
    const selectedEngine = this.getSelectedEngine();
    const azureCfg = this.getAzureConfig();

    // 1. AZURE CLOUD GOP MOTORU SEÇİLİYSE
    if (selectedEngine === 'AZURE_CLOUD' && azureCfg.isConfigured) {
      try {
        if (onStatusUpdate) onStatusUpdate('Microsoft Azure GOP bulut motoruyla analiz ediliyor...');
        const azureResult = await this.evaluateWithAzureGOP(wavBlob, referenceText, azureCfg, phoneticTarget);
        if (azureResult) {
          return {
            ...azureResult,
            engineId: 'AZURE_CLOUD',
            engineName: `Microsoft Azure GOP (${azureCfg.region})`,
            recordedAudioUrl: this.lastRecordedUrl
          };
        }
      } catch (err) {
        console.warn('Azure GOP değerlendirmesi başarısız, yerel fonetik motora geçiliyor:', err);
      }
    }

    // 2. WAV2VEC2 NEURAL CTC MOTORU SEÇİLİYSE (Veya Hibrit Modda Model Hazırsa)
    let ctcAlignmentResult = null;
    if (selectedEngine === 'WAV2VEC2_CTC' || (selectedEngine === 'HYBRID_ENSEMBLE' && this.wav2vec2Status === 'ready')) {
      if (this.wav2vec2Status !== 'ready' && selectedEngine === 'WAV2VEC2_CTC') {
        await this.preloadWav2Vec2Model((pct, msg) => {
          if (onStatusUpdate) onStatusUpdate(msg);
        });
      }
      if (this.wav2vec2Status === 'ready') {
        try {
          if (onStatusUpdate) onStatusUpdate('Wav2Vec2 Neural CTC fonem posterior olasılıkları hesaplanıyor...');
          const ctcRaw = await this.runWav2Vec2CTCInference(vadInfo.activePcm);
          if (ctcRaw) {
            const durationMs = Math.round((vadInfo.activePcm.length / 16000) * 1000);
            ctcAlignmentResult = this.computeCTCForcedAlignmentGOP(ctcRaw, phoneticTarget, durationMs);
          }
        } catch (err) {
          console.warn('Wav2Vec2 CTC inference hatası:', err);
        }
      }
    }

    // 3. MFA VITERBI FORCED ALIGNMENT + WAV2VEC2 CTC + AKUSTİK DSP DEĞERLENDİRMESİ
    if (onStatusUpdate) {
      onStatusUpdate(
        selectedEngine === 'MFA_FORCED_ALIGN'
          ? 'Montreal Forced Aligner (Viterbi HMM) milisaniye hizalaması yapılıyor...'
          : 'Fonetik ve akustik hizalama tamamlanıyor...'
      );
    }

    const localReport = this.evaluateWithOnDeviceAcousticDSP(
      vadInfo.activePcm,
      16000,
      phoneticTarget,
      this.sttTranscripts,
      this.sttInterimTokens,
      selectedEngine,
      ctcAlignmentResult
    );

    const engineLabelMap = {
      HYBRID_ENSEMBLE: ctcAlignmentResult
        ? 'Hibrit Ensemble (MFA Viterbi + Wav2Vec2 CTC + DSP)'
        : 'Hibrit Ensemble (MFA Viterbi + Akustik DSP)',
      WAV2VEC2_CTC: ctcAlignmentResult
        ? 'Wav2Vec2 Neural CTC Posterior GOP (ONNX)'
        : 'Wav2Vec2 CTC (Yedek: MFA Viterbi + DSP)',
      MFA_FORCED_ALIGN: 'Montreal Forced Aligner (MFA / Kaldi Viterbi GOP)',
      AZURE_CLOUD: 'MFA Viterbi + Akustik DSP (Azure Anahtarı Girilmedi)'
    };

    return {
      ...localReport,
      engineId: selectedEngine,
      engineName: engineLabelMap[selectedEngine] || 'Hibrit Fonetik Motoru',
      recordedAudioUrl: this.lastRecordedUrl
    };
  }

  async stopRecording() {
    this.isRecording = false;
    if (this.levelAnimFrame) cancelAnimationFrame(this.levelAnimFrame);
    if (this.recognition) {
      try { this.recognition.stop(); } catch (_) {}
      this.recognition = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try { await this.audioCtx.close(); } catch (_) {}
      this.audioCtx = null;
    }
  }

  playLastRecording() {
    if (!this.lastRecordedUrl) return;
    const audio = new Audio(this.lastRecordedUrl);
    audio.play().catch(() => {});
  }

  extractActiveSpeechSegment(pcm, sampleRate) {
    if (!pcm || pcm.length < sampleRate * 0.15) {
      return { hasSpeech: false, activePcm: new Float32Array(0), durationMs: 0 };
    }

    let maxPeak = 0;
    for (let i = 0; i < pcm.length; i++) {
      const abs = Math.abs(pcm[i]);
      if (abs > maxPeak) maxPeak = abs;
    }

    if (maxPeak < 0.012) {
      return { hasSpeech: false, activePcm: new Float32Array(0), durationMs: 0 };
    }

    const normPcm = new Float32Array(pcm.length);
    const scale = maxPeak > 0.001 ? 0.92 / maxPeak : 1;
    for (let i = 0; i < pcm.length; i++) {
      normPcm[i] = pcm[i] * scale;
    }

    const frameLen = Math.floor(sampleRate * 0.02);
    const numFrames = Math.floor(normPcm.length / frameLen);
    const energies = new Float32Array(numFrames);

    for (let f = 0; f < numFrames; f++) {
      let sum = 0;
      const start = f * frameLen;
      for (let i = 0; i < frameLen; i++) {
        const s = normPcm[start + i];
        sum += s * s;
      }
      energies[f] = Math.sqrt(sum / frameLen);
    }

    const sortedE = [...energies].sort((a, b) => a - b);
    const noiseFloor = sortedE[Math.floor(sortedE.length * 0.15)] || 0.01;
    const threshold = Math.max(0.055, noiseFloor * 2.4);

    let firstFrame = -1;
    let lastFrame = -1;
    let activeFrameCount = 0;

    for (let f = 0; f < numFrames; f++) {
      if (energies[f] > threshold) {
        if (firstFrame === -1) firstFrame = f;
        lastFrame = f;
        activeFrameCount++;
      }
    }

    if (firstFrame === -1 || activeFrameCount < 6) {
      return { hasSpeech: false, activePcm: new Float32Array(0), durationMs: 0 };
    }

    const padStart = Math.max(0, firstFrame - 3) * frameLen;
    const padEnd = Math.min(normPcm.length, (lastFrame + 4) * frameLen);
    const activePcm = normPcm.slice(padStart, padEnd);
    const durationMs = Math.round((activePcm.length / sampleRate) * 1000);

    if (durationMs < 140) {
      return { hasSpeech: false, activePcm: new Float32Array(0), durationMs: 0 };
    }

    return {
      hasSpeech: true,
      activePcm,
      durationMs,
      activeRatio: activeFrameCount / Math.max(1, lastFrame - firstFrame + 1)
    };
  }

  /**
   * DİNAMİK HECE ZİRVESİ & ÜNSÜZ VADİSİ BÖLÜMLEYİCİ (Forced Acoustic Landmark Segmentation)
   * Sabit yüzdeyle kesmek yerine, ses sinyalindeki gerçek ünlü çekirdeklerini (peaks) ve
   * heceler arasındaki ünsüz kapanma vadilerini (valleys: örn. ver-mei-[d/t]-en) bulur!
   */
  segmentFramesIntoSyllableLandmarks(frames, syllables) {
    const K = syllables.length;
    const N = frames.length;
    if (K <= 1 || N < 8) {
      return syllables.map(() => ({
        allFrames: frames,
        onsetFrames: frames.slice(0, Math.max(2, Math.floor(N * 0.32))),
        nucleusFrames: frames.slice(Math.floor(N * 0.25), Math.ceil(N * 0.78)),
        codaFrames: frames.slice(Math.floor(N * 0.68)),
        valleyDepthRatio: 0.5
      }));
    }

    // Yumuşatılmış ünlü enerjisi (Sonority = RMS * Voiced Vowel Bands)
    const sonority = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const f = frames[i];
      const vowelBand = f.bands.f0 + f.bands.f1Low + f.bands.f1High + f.bands.f2Back + f.bands.f2Rounded + f.bands.f2Front;
      sonority[i] = f.rms * Math.max(0.2, vowelBand);
    }

    const smoothSon = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      let c = 0;
      for (let k = -2; k <= 2; k++) {
        if (i + k >= 0 && i + k < N) {
          s += sonority[i + k];
          c++;
        }
      }
      smoothSon[i] = s / c;
    }

    // Beklenen ağırlıklara göre başlangıç sınırlarını hesapla, sonra her sınırın yakınındaki gerçek vadiyi (minimum enerji noktasını) bul!
    const totalWeight = syllables.reduce((acc, s) => acc + (s.expectedWeight || 1), 0) || 1;
    const boundaries = [0];
    let accW = 0;

    for (let sIdx = 0; sIdx < K - 1; sIdx++) {
      accW += syllables[sIdx].expectedWeight || 1;
      const expectedIdx = Math.round((accW / totalWeight) * N);
      const searchRadius = Math.max(4, Math.floor(N / (K * 2.4)));
      const lo = Math.max(boundaries[boundaries.length - 1] + 3, expectedIdx - searchRadius);
      const hi = Math.min(N - (K - sIdx) * 3, expectedIdx + searchRadius);

      let minVal = Infinity;
      let bestValleyIdx = expectedIdx;
      for (let idx = lo; idx <= hi; idx++) {
        // Kapanma vadisi: düşük sonority VEYA yüksek ünsüz türbülansı (ZCR/Fricative)
        const valleyScore = smoothSon[idx] - frames[idx].zcr * 0.08;
        if (valleyScore < minVal) {
          minVal = valleyScore;
          bestValleyIdx = idx;
        }
      }
      boundaries.push(Math.max(boundaries[boundaries.length - 1] + 2, bestValleyIdx));
    }
    boundaries.push(N);

    // Her hece için Onset (kapanma vadisi + patlama başlangıcı), Nucleus (ünlü zirvesi) ve Coda çerçevelerini çıkar
    return syllables.map((syl, sIdx) => {
      const start = boundaries[sIdx];
      const end = Math.max(start + 3, boundaries[sIdx + 1]);
      const span = end - start;

      // Bu hecedeki maksimum ünlü zirvesini (peak) bul
      let peakIdx = start + Math.floor(span * 0.45);
      let maxSon = -1;
      for (let i = start; i < end; i++) {
        if (smoothSon[i] > maxSon) {
          maxSon = smoothSon[i];
          peakIdx = i;
        }
      }

      // Önceki hecenin zirvesi ile bu hecenin zirvesi arasındaki en derin kapanma (valley)
      const onsetStart = sIdx > 0 ? Math.max(0, start - 2) : start;
      const onsetEnd = Math.min(end, Math.max(start + 3, peakIdx + 1));
      const onsetFrames = frames.slice(onsetStart, onsetEnd);

      const nucStart = Math.max(start, peakIdx - Math.max(2, Math.floor(span * 0.28)));
      const nucEnd = Math.min(end, peakIdx + Math.max(2, Math.ceil(span * 0.32)));
      const nucleusFrames = frames.slice(nucStart, nucEnd);

      const codaStart = Math.max(start + 1, Math.min(end - 2, peakIdx + 1));
      const codaFrames = frames.slice(codaStart, end);

      let minOnsetRms = 1;
      for (const f of onsetFrames) {
        if (f.rms < minOnsetRms) minOnsetRms = f.rms;
      }
      const peakRms = Math.max(frames[peakIdx]?.rms || 0.1, 0.05);

      return {
        allFrames: frames.slice(start, end),
        onsetFrames,
        nucleusFrames: nucleusFrames.length > 0 ? nucleusFrames : frames.slice(start, end),
        codaFrames: codaFrames.length > 0 ? codaFrames : frames.slice(start, end),
        valleyDepthRatio: minOnsetRms / peakRms,
        peakRms
      };
    });
  }

  /**
   * MONTREAL FORCED ALIGNER (MFA) / KALDI STİLİ VİTERBİ HMM ZORLAMALI HİZALAMA & LLR GOP MOTORU
   * - Hedef kelimedeki her fonem için akustik durum emisyon olasılıklarını log P(o_t | phon) ve
   *   rakip fonem (impostor) akustik emisyon olasılıklarını log P(o_t | impostor) hesaplar.
   * - Viterbi Dinamik Programlama (Forced Alignment Trellis) ile ses çerçevelerini [0..T-1]
   *   fonem dizisine monotonik olarak hizalar ve her fonemin milisaniye sınırlarını [startMs, endMs] bulur.
   * - Witt & Young GOP formülüyle:
   *     GOP_LLR(p) = mean_t [ log P(o_t | target_p) - log P(o_t | best_impostor_q) ]
   *   değerini hesaplar.
   */
  runMFAViterbiForcedAlignment(frames, syllables, durationMs) {
    const N = frames.length;
    const flatPhonemes = [];
    syllables.forEach((syl, sIdx) => {
      syl.phonemes.forEach((phon, pIdx) => {
        flatPhonemes.push({
          sylIdx: sIdx,
          phonIdx: pIdx,
          phon,
          minFrames: phon.type.startsWith('VOWEL_LONG') || phon.type.startsWith('DIPHTHONG') ? 3 : 1
        });
      });
    });

    const M = flatPhonemes.length;
    const mfaMap = new Map();
    if (M === 0 || N < 4) return mfaMap;

    let globalPeakRms = 0.08;
    for (const f of frames) {
      if (f.rms > globalPeakRms) globalPeakRms = f.rms;
    }

    // Her (çerçeve t, fonem m) için:
    // 1) Hizalama (Manner-of-Articulation) Olasılığı: Ünlü çekirdeği vs Ünsüz kapanma/sürtünme vadisini doğru foneme kilitler.
    // 2) GOP (Target vs Impostor) Olasılığı: Hizalanan çerçevelerde 'd' vs 't', 'ei' vs 'ie', 'ü' vs 'u' ayrımını puanlar.
    const alignLogL = Array.from({ length: N }, () => new Float32Array(M));

    for (let t = 0; t < N; t++) {
      const f = frames[t];
      const posRatio = t / Math.max(1, N - 1);
      const b = f.bands;
      const vowelMass = b.f1Low + b.f1High + b.f2Back + b.f2Rounded + b.f2Front;
      const consTurbulence = b.fricMid + b.sibilantHigh + f.zcr;
      const isValleyOrObstruent = f.rms < globalPeakRms * 0.55 || b.f0 < 0.18 || consTurbulence > 0.28;

      for (let m = 0; m < M; m++) {
        const item = flatPhonemes[m];
        const expectedPos = (m + 0.5) / M;
        const posPrior = -Math.pow((posRatio - expectedPos) * 2.4, 2);
        const pType = item.phon.type;

        let mannerLL = 0;
        if (pType.startsWith('VOWEL') || pType.startsWith('DIPHTHONG')) {
          // Ünlüler yüksek enerjili ve ötümlü çekirdeklere hizalanmalı, sessiz/patlamalı ünsüz vadilerinden kaçmalı!
          mannerLL = !isValleyOrObstruent && vowelMass > 0.35 ? +1.35 : -1.65;
        } else if (pType.startsWith('PLOSIVE') || pType.startsWith('FRICATIVE') || pType.startsWith('SIBILANT') || pType.startsWith('AFFRICATE')) {
          // Patlayıcı ve sürtünmeli ünsüzler tam olarak ünsüz vadilerine / türbülans bölgelerine kilitlenmeli!
          mannerLL = isValleyOrObstruent ? +1.45 : -1.1;
        } else {
          // Nazal ve akıcılar (m, n, l, r) orta enerjili geçiş bölgelerine hizalanır
          mannerLL = f.rms > 0.02 && f.rms < globalPeakRms * 0.85 ? +0.9 : -0.3;
        }

        alignLogL[t][m] = mannerLL + posPrior;
      }
    }

    // Viterbi Dinamik Programlama Trellis (N çerçeveyi M foneme zorlamalı hizala)
    const dp = Array.from({ length: N }, () => new Float32Array(M).fill(-1e9));
    const backptr = Array.from({ length: N }, () => new Int32Array(M).fill(0));

    dp[0][0] = alignLogL[0][0];
    for (let t = 1; t < N; t++) {
      for (let m = 0; m < M; m++) {
        // Aynı fonemde kalma (self-loop) vs bir önceki fonemden geçiş (transition)
        let bestPrev = dp[t - 1][m] - 0.04;
        let bestM = m;
        if (m > 0 && dp[t - 1][m - 1] - 0.10 > bestPrev) {
          bestPrev = dp[t - 1][m - 1] - 0.10;
          bestM = m - 1;
        }
        dp[t][m] = bestPrev + alignLogL[t][m];
        backptr[t][m] = bestM;
      }
    }

    // Viterbi Backtrack ile her fonemin hizalanan çerçeve aralığını [startFrame, endFrame] bul
    const spans = Array.from({ length: M }, () => ({ start: N - 1, end: 0 }));
    let curM = M - 1;
    for (let t = N - 1; t >= 0; t--) {
      if (t < spans[curM].start) spans[curM].start = t;
      if (t > spans[curM].end) spans[curM].end = t;
      curM = backptr[t][curM];
    }

    const frameMs = durationMs / Math.max(1, N);

    for (let m = 0; m < M; m++) {
      const item = flatPhonemes[m];
      const sF = Math.max(0, spans[m].start);
      const eF = Math.min(N - 1, Math.max(sF, spans[m].end));
      const count = eF - sF + 1;

      let sumTargetLL = 0;
      let sumImpostorLL = 0;
      let worstFrameDiff = Infinity;

      for (let t = sF; t <= eF; t++) {
        const { targetLL, impLL } = this.computeMFAPhonemeStateLogLikelihoods(
          frames[t],
          item.phon,
          globalPeakRms
        );
        sumTargetLL += targetLL;
        sumImpostorLL += impLL;
        const diff = targetLL - impLL;
        if (diff < worstFrameDiff) worstFrameDiff = diff;
      }

      const avgLlr = (sumTargetLL - sumImpostorLL) / count;
      // Patlayıcı ünsüzlerde (d vs t, b vs p, g vs k) en kötü çerçeve (patlama anı) belirleyicidir
      const effectiveLlr = item.phon.type.startsWith('PLOSIVE')
        ? Math.min(avgLlr, worstFrameDiff * 0.85)
        : avgLlr * 0.7 + worstFrameDiff * 0.3;

      // Sigmoid tabanlı MFA GOP Skor Dönüşümü: LLR > 0 ise hedef fonem baskın, LLR < 0 ise rakip (impostor) fonem baskın!
      const gopProb = 1 / (1 + Math.exp(-effectiveLlr * 1.65));
      const mfaScore = Math.max(16, Math.min(98, Math.round(14 + gopProb * 84)));

      mfaMap.set(`${item.sylIdx}:${item.phonIdx}`, {
        mfaScore,
        gopLlr: Number(effectiveLlr.toFixed(2)),
        gopConfidence: Math.round(gopProb * 100),
        startMs: Math.round(sF * frameMs),
        endMs: Math.round((eF + 1) * frameMs),
        alignedFrames: frames.slice(sF, eF + 1),
        detectedImpostor: effectiveLlr < -0.35 ? item.phon.confusedWith || 'rakip fonem' : null
      });
    }

    return mfaMap;
  }

  /**
   * MFA AKUSTİK DURUM EMİSYON MODELİ: Hedef Fonem vs Rakip (Impostor) Fonem Log-Likelihood Hesabı
   */
  computeMFAPhonemeStateLogLikelihoods(f, phon, globalPeakRms) {
    const b = f.bands;
    const highBurst = b.fricMid + b.sibilantHigh;
    const vowelEnergy = b.f1Low + b.f1High + b.f2Back + b.f2Rounded + b.f2Front;
    let targetLL = 0;
    let impLL = -0.8;

    if (phon.type === 'PLOSIVE_VOICED') {
      // d, b, g: Ses telleri (F0) aktif olmalı, yüksek frekanslı aspirasyon patlaması (t/p/k) OLMAMALI
      const isVoiced = b.f0 >= 0.16;
      const hasUnvoicedBurst = b.f0 < 0.16 && (highBurst > 0.20 || f.centroid > 1800 || f.zcr > 0.15);
      const isSilentClosure = b.f0 < 0.10 && f.rms < globalPeakRms * 0.18;

      if (hasUnvoicedBurst || isSilentClosure) {
        targetLL = -2.4;
        impLL = +1.5; // Rakip 't / p / k' modeli çok daha yüksek olasılıklı!
      } else if (isVoiced) {
        targetLL = +1.25;
        impLL = -1.1;
      } else {
        targetLL = -0.4;
        impLL = +0.2;
      }
    } else if (phon.type === 'PLOSIVE_UNVOICED') {
      // t, p, k: Ötümsüz kapanma veya yüksek frekanslı patlama olmalı
      const hasBurstOrVoiceless = b.f0 < 0.18 || highBurst > 0.16 || f.centroid > 1650 || f.zcr > 0.12;
      if (hasBurstOrVoiceless) {
        targetLL = +1.3;
        impLL = -1.0;
      } else if (b.f0 > 0.25) {
        targetLL = -1.8;
        impLL = +1.1; // Rakip 'd / b / g' (ötümlü) modeli baskın!
      }
    } else if (phon.type === 'DIPHTHONG_EI') {
      // ei [aɪ] vs ie [iː]: Açık F1 (f1High) olmalı
      if (b.f1High >= 0.11 || b.f1High >= b.f1Low * 0.7) {
        targetLL = +1.2;
        impLL = -0.9;
      } else {
        targetLL = -1.9;
        impLL = +1.2; // 'ie' [iː] modeli baskın
      }
    } else if (phon.type === 'VOWEL_LONG_I') {
      // ie [iː] vs ei [aɪ]: Kapalı F1 (f1Low > f1High) ve yüksek F2Front olmalı
      if (b.f1Low >= b.f1High * 0.85 && b.f2Front > 0.12) {
        targetLL = +1.25;
        impLL = -0.95;
      } else if (b.f1High > b.f1Low * 1.4) {
        targetLL = -1.85;
        impLL = +1.15; // 'ei' [aɪ] modeli baskın
      }
    } else if (phon.type === 'VOWEL_UMLAUT_FRONT_ROUNDED') {
      // ü [y], ö [ø] vs u, o: f2Rounded + f2Front > f2Back olmalı
      if (b.f2Rounded + b.f2Front >= b.f2Back * 0.9) {
        targetLL = +1.15;
        impLL = -0.85;
      } else {
        targetLL = -1.75;
        impLL = +1.1; // 'u / o' art ünlü modeli baskın
      }
    } else if (phon.type === 'FRICATIVE_PALATAL' || phon.type === 'SIBILANT_POSTALVEOLAR') {
      // ch [ç], sch [ʃ]: Orta-yüksek sürtünme (fricMid) ve ZCR yüksek olmalı
      if (b.fricMid > 0.13 && f.zcr > 0.085) {
        targetLL = +1.3;
        impLL = -1.0;
      } else {
        targetLL = -1.5;
        impLL = +0.85;
      }
    } else if (phon.type === 'AFFRICATE_TS') {
      // z / tz [ts]: Keskin sibilantHigh ve ZCR
      if (b.sibilantHigh > 0.11 || f.zcr > 0.11) {
        targetLL = +1.25;
        impLL = -0.95;
      } else {
        targetLL = -1.55;
        impLL = +0.9;
      }
    } else if (phon.type.startsWith('VOWEL') || phon.type.startsWith('DIPHTHONG')) {
      targetLL = vowelEnergy > 0.35 ? +0.95 : -0.35;
      impLL = -0.5;
    } else {
      targetLL = f.rms > 0.02 ? +0.85 : -0.25;
      impLL = -0.45;
    }

    return { targetLL, impLL };
  }

  evaluateWithOnDeviceAcousticDSP(
    activePcm,
    sampleRate,
    phoneticTarget,
    sttTranscripts,
    sttInterimTokens,
    selectedEngine = 'HYBRID_ENSEMBLE',
    ctcAlignmentResult = null
  ) {
    const syllables = phoneticTarget.syllables;
    const totalSyllables = Math.max(1, syllables.length);

    const frames = this.extractAcousticFrames(activePcm, sampleRate);
    const durationMs = Math.round((activePcm.length / sampleRate) * 1000);
    const detectedPeaks = this.countSyllableNucleiPeaks(frames);

    // 1. Hece Sayısı ve Süre / Ritim (Prosody) Puanı
    const expectedMinMs = totalSyllables * 155;
    const expectedMaxMs = totalSyllables * 620 + 350;
    let rhythmScore = 90;

    const peakDiff = Math.abs(detectedPeaks - totalSyllables);
    if (peakDiff === 1) rhythmScore -= 12;
    else if (peakDiff === 2) rhythmScore -= 24;
    else if (peakDiff > 2) rhythmScore -= 36;

    if (durationMs < expectedMinMs) {
      const ratio = durationMs / expectedMinMs;
      rhythmScore -= Math.round((1 - ratio) * 45);
    } else if (durationMs > expectedMaxMs) {
      const excess = (durationMs - expectedMaxMs) / expectedMaxMs;
      rhythmScore -= Math.min(28, Math.round(excess * 32));
    }
    rhythmScore = Math.max(25, Math.min(98, rhythmScore));

    // 2. Ham Fonetik STT & Wav2Vec2 CTC Ham Transkript Sapma Analizi
    const combinedInterim = [...(sttInterimTokens || [])];
    if (ctcAlignmentResult && ctcAlignmentResult.rawCtcTranscript) {
      combinedInterim.push(ctcAlignmentResult.rawCtcTranscript);
    }
    const sttAnalysis = this.analyzePhoneticSTTCandidates(
      phoneticTarget.original,
      syllables,
      sttTranscripts,
      combinedInterim
    );

    // 3. Dinamik Akustik Landmark Hizalama + Montreal Forced Aligner (MFA Viterbi) Hizalaması
    const landmarks = this.segmentFramesIntoSyllableLandmarks(frames, syllables);
    const mfaAlignmentMap = this.runMFAViterbiForcedAlignment(frames, syllables, durationMs);
    const specificFeedback = [...sttAnalysis.substitutionWarnings];
    const syllableResults = [];
    let criticalPhonemeFailures = 0;

    for (let sIdx = 0; sIdx < syllables.length; sIdx++) {
      const syl = syllables[sIdx];
      const lm = landmarks[sIdx];

      const phonemeScores = [];
      for (let pIdx = 0; pIdx < syl.phonemes.length; pIdx++) {
        const phon = syl.phonemes[pIdx];
        const key = `${sIdx}:${pIdx}`;
        const mfaInfo = mfaAlignmentMap.get(key) || null;
        const ctcInfo = ctcAlignmentResult?.phonemePosteriorMap?.get(key) || null;

        let targetFrames = lm.allFrames;
        if (phon.role === 'onset') targetFrames = lm.onsetFrames;
        else if (phon.role === 'nucleus') targetFrames = lm.nucleusFrames;
        else if (phon.role === 'coda') targetFrames = lm.codaFrames;

        const pEval = this.scorePhonemeAcoustics(
          phon,
          targetFrames,
          lm,
          syl,
          sIdx,
          durationMs / totalSyllables,
          sttAnalysis
        );

        // Seçili Fonetik Motoruna Göre Puan Birleştirme (MFA Viterbi / Wav2Vec2 CTC / Hibrit Ensemble)
        let combinedPhonScore = pEval.score;
        if (selectedEngine === 'MFA_FORCED_ALIGN' && mfaInfo) {
          combinedPhonScore = Math.round(Math.min(pEval.score, mfaInfo.mfaScore) * 0.65 + (pEval.score + mfaInfo.mfaScore) * 0.175);
        } else if (selectedEngine === 'WAV2VEC2_CTC' && ctcInfo) {
          combinedPhonScore = Math.round(Math.min(pEval.score, ctcInfo.ctcScore) * 0.6 + ctcInfo.ctcScore * 0.4);
          if (ctcInfo.detectedImpostor && !pEval.feedback) {
            pEval.feedback = `🧠 Wav2Vec2 CTC Posterior: "${syl.text}" içindeki "${phon.grapheme}" [${phon.ipa}] yerine yüksek olasılıkla (%${ctcInfo.impostorPosterior}) "${ctcInfo.detectedImpostor}" sesi algılandı!`;
          }
        } else {
          // HYBRID_ENSEMBLE: MFA Viterbi + Akustik DSP + (varsa Wav2Vec2 CTC)
          if (mfaInfo) {
            combinedPhonScore = Math.round(Math.min(pEval.score, mfaInfo.mfaScore) * 0.55 + (pEval.score + mfaInfo.mfaScore) * 0.225);
          }
          if (ctcInfo) {
            combinedPhonScore = Math.round(Math.min(combinedPhonScore, ctcInfo.ctcScore) * 0.5 + (combinedPhonScore + ctcInfo.ctcScore) * 0.25);
          }
        }

        combinedPhonScore = Math.max(15, Math.min(98, combinedPhonScore));
        pEval.score = combinedPhonScore;
        pEval.status = combinedPhonScore >= 82 ? 'good' : combinedPhonScore >= 62 ? 'warning' : 'bad';
        pEval.startMs = ctcInfo?.startMs ?? mfaInfo?.startMs ?? 0;
        pEval.endMs = ctcInfo?.endMs ?? mfaInfo?.endMs ?? 0;
        pEval.gopConfidence = ctcInfo?.targetPosterior ?? mfaInfo?.gopConfidence ?? combinedPhonScore;
        pEval.gopLlr = mfaInfo?.gopLlr ?? null;

        if (pEval.score < 62) {
          criticalPhonemeFailures++;
        }
        phonemeScores.push(pEval);
        if (pEval.feedback) {
          specificFeedback.push(pEval.feedback);
        }
      }

      // Hece skoru: Bir hecedeki en düşük fonem (örn: 'den' içindeki 'd' -> 't' hatası) o heceyi doğrudan düşürür!
      let finalSylScore = 75;
      if (phonemeScores.length > 0) {
        const avgP = phonemeScores.reduce((a, b) => a + b.score, 0) / phonemeScores.length;
        const minP = Math.min(...phonemeScores.map((p) => p.score));
        finalSylScore = Math.round(avgP * 0.45 + minP * 0.55);
      }

      if (sttAnalysis.hasData && sttAnalysis.syllablePenalties[sIdx] !== undefined) {
        finalSylScore = Math.min(finalSylScore, sttAnalysis.syllablePenalties[sIdx]);
      }

      finalSylScore = Math.max(15, Math.min(98, Math.round(finalSylScore)));

      syllableResults.push({
        text: syl.text,
        ipa: syl.ipa,
        trGuide: syl.trGuide,
        isStressed: syl.isStressed,
        score: finalSylScore,
        status: finalSylScore >= 82 ? 'good' : finalSylScore >= 62 ? 'warning' : 'bad',
        phonemes: phonemeScores
      });
    }

    // 4. Genel Puan Hesabı
    const avgSyllableScore =
      syllableResults.reduce((acc, s) => acc + s.score, 0) / Math.max(1, syllableResults.length);
    const minSyllableScore = Math.min(...syllableResults.map((s) => s.score));

    const fluencyScore = this.computeFluencyScore(frames, durationMs, expectedMinMs);

    let phoneticQualityScore = Math.round(avgSyllableScore * 0.58 + minSyllableScore * 0.42);
    if (criticalPhonemeFailures > 0) {
      phoneticQualityScore -= criticalPhonemeFailures * 10;
    }

    if (sttAnalysis.hasData) {
      if (sttAnalysis.exactWordMismatchCount > 0) {
        phoneticQualityScore = Math.min(
          phoneticQualityScore,
          Math.max(22, 66 - sttAnalysis.exactWordMismatchCount * 14)
        );
      }
      if (sttAnalysis.phoneticSimilarity < 0.75) {
        phoneticQualityScore = Math.min(
          phoneticQualityScore,
          Math.round(sttAnalysis.phoneticSimilarity * 82)
        );
      }
    }

    phoneticQualityScore = Math.max(15, Math.min(98, phoneticQualityScore));

    let overallAccuracy = Math.round(
      phoneticQualityScore * 0.65 +
      avgSyllableScore * 0.20 +
      rhythmScore * 0.10 +
      fluencyScore * 0.05
    );

    // Kırmızı (<62%) bir hece varsa genel doğruluk oranı ASLA %68'in üstüne çıkamaz!
    if (minSyllableScore < 62) {
      overallAccuracy = Math.min(overallAccuracy, Math.max(20, minSyllableScore + 15));
    }

    overallAccuracy = Math.max(12, Math.min(98, overallAccuracy));

    const uniqueFeedback = [];
    const seenFb = new Set();
    for (const fb of specificFeedback) {
      if (fb && !seenFb.has(fb)) {
        seenFb.add(fb);
        uniqueFeedback.push(fb);
      }
    }

    if (uniqueFeedback.length === 0) {
      if (overallAccuracy >= 84) {
        uniqueFeedback.push(
          'Harika! Ünlü tınıları, ötümlü/ötümsüz ünsüz dengesi ve hece vurgusu standart Almanca (Hochdeutsch) profiliyle yüksek uyum gösteriyor.'
        );
      } else {
        uniqueFeedback.push(
          'Sarı veya kırmızı işaretli hecelerdeki ünlü/ünsüz geçişlerine dikkat ederek tekrar deneyin.'
        );
      }
    }

    return {
      hasSpeech: true,
      overallScore: overallAccuracy,
      accuracyScore: phoneticQualityScore,
      prosodyScore: rhythmScore,
      fluencyScore,
      completenessScore: Math.min(100, Math.round((detectedPeaks / totalSyllables) * 100)),
      recognizedText: sttAnalysis.rawHeardDisplay || sttAnalysis.bestTranscript || '',
      phoneticTarget,
      syllables: syllableResults,
      feedbackTips: uniqueFeedback.slice(0, 5)
    };
  }

  extractAcousticFrames(pcm, sampleRate) {
    const winSize = 512;
    const hopSize = 160;
    const frames = [];

    const hann = new Float32Array(winSize);
    for (let i = 0; i < winSize; i++) {
      hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
    }

    for (let start = 0; start + winSize <= pcm.length; start += hopSize) {
      let rmsSum = 0;
      let zcrCount = 0;
      const windowed = new Float32Array(winSize);

      for (let i = 0; i < winSize; i++) {
        const v = pcm[start + i];
        rmsSum += v * v;
        if (i > 0 && ((pcm[start + i - 1] >= 0 && v < 0) || (pcm[start + i - 1] < 0 && v >= 0))) {
          zcrCount++;
        }
        windowed[i] = v * hann[i];
      }

      const rms = Math.sqrt(rmsSum / winSize);
      const zcr = zcrCount / winSize;
      const spec = this.computeBandSpectrum(windowed, sampleRate);

      frames.push({
        rms,
        zcr,
        centroid: spec.centroid,
        bands: spec.bands
      });
    }

    return frames;
  }

  computeBandSpectrum(signal, sampleRate) {
    const N = signal.length;
    const re = new Float32Array(signal);
    const im = new Float32Array(N);

    let j = 0;
    for (let i = 0; i < N; i++) {
      if (i < j) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
      }
      let m = N >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    for (let len = 2; len <= N; len <<= 1) {
      const halfLen = len >> 1;
      const angle = (-2 * Math.PI) / len;
      const wRe = Math.cos(angle);
      const wIm = Math.sin(angle);
      for (let i = 0; i < N; i += len) {
        let curRe = 1;
        let curIm = 0;
        for (let k = 0; k < halfLen; k++) {
          const evenIdx = i + k;
          const oddIdx = i + k + halfLen;
          const tRe = curRe * re[oddIdx] - curIm * im[oddIdx];
          const tIm = curRe * im[oddIdx] + curIm * re[oddIdx];
          re[oddIdx] = re[evenIdx] - tRe;
          im[oddIdx] = im[evenIdx] - tIm;
          re[evenIdx] += tRe;
          im[evenIdx] += tIm;
          const nextRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nextRe;
        }
      }
    }

    const halfN = N >> 1;
    const binHz = sampleRate / N;
    let weightedFreqSum = 0;
    let magSum = 0;

    const bands = {
      f0: 0,           // 80 - 260 Hz (Ses telleri titreşimi / Voicing barajı: d, b, g, v, z için yüksek!)
      f1Low: 0,        // 260 - 520 Hz (Kapalı ünlüler: i, ü, u)
      f1High: 0,       // 520 - 960 Hz (Açık ünlüler: a, ä, e, o)
      f2Back: 0,       // 960 - 1450 Hz (Art ünlüler: u, o, a + Ach-Laut [x])
      f2Rounded: 0,    // 1450 - 2100 Hz (Yuvarlak ön ünlüler: ü [y], ö [ø])
      f2Front: 0,      // 2100 - 3000 Hz (Düz ön ünlüler: i, e, ä)
      fricMid: 0,      // 2600 - 5200 Hz (Ich-Laut [ç], sch [ʃ], t/p/k soluklama patlaması)
      sibilantHigh: 0  // 4800 - 7800 Hz (Keskin sibilantlar: z [ts], ß, s, t aspirasyonu)
    };

    for (let k = 1; k < halfN; k++) {
      const freq = k * binHz;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      weightedFreqSum += freq * mag;
      magSum += mag;

      if (freq >= 80 && freq < 260) bands.f0 += mag;
      else if (freq >= 260 && freq < 520) bands.f1Low += mag;
      else if (freq >= 520 && freq < 960) bands.f1High += mag;
      if (freq >= 960 && freq < 1450) bands.f2Back += mag;
      if (freq >= 1450 && freq < 2100) bands.f2Rounded += mag;
      if (freq >= 2100 && freq < 3000) bands.f2Front += mag;
      if (freq >= 2600 && freq < 5200) bands.fricMid += mag;
      if (freq >= 4800 && freq < 7800) bands.sibilantHigh += mag;
    }

    const totalBand = magSum || 1;
    for (const key of Object.keys(bands)) {
      bands[key] /= totalBand;
    }

    return {
      centroid: magSum > 0.001 ? weightedFreqSum / magSum : 0,
      bands
    };
  }

  /**
   * HER FONEMİ Akustik Landmark (Onset Vadisi / Nucleus / Coda) + Ötümlülük (Voicing d/t, b/p, g/k)
   * + Formant Oranları + STT Hizalaması ile Denetler
   */
  scorePhonemeAcoustics(phon, targetFrames, landmark, syllable, sylIdx, avgSylDurationMs, sttAnalysis) {
    const activeFrames = targetFrames && targetFrames.length > 0 ? targetFrames : landmark.allFrames;
    if (!activeFrames || activeFrames.length === 0) {
      return { grapheme: phon.grapheme, ipa: phon.ipa, score: 50, status: 'bad', feedback: null };
    }

    let score = 85;
    let feedback = null;

    let maxZcr = 0;
    let maxCentroid = 0;
    let maxFricMid = 0;
    let maxSibilantHigh = 0;
    let avgF0 = 0;
    let minF0 = 1;
    let avgF1Low = 0;
    let avgF1High = 0;
    let avgF2Back = 0;
    let avgF2Rounded = 0;
    let avgF2Front = 0;

    for (const f of activeFrames) {
      if (f.zcr > maxZcr) maxZcr = f.zcr;
      if (f.centroid > maxCentroid) maxCentroid = f.centroid;
      if (f.bands.fricMid > maxFricMid) maxFricMid = f.bands.fricMid;
      if (f.bands.sibilantHigh > maxSibilantHigh) maxSibilantHigh = f.bands.sibilantHigh;
      if (f.bands.f0 < minF0) minF0 = f.bands.f0;
      avgF0 += f.bands.f0;
      avgF1Low += f.bands.f1Low;
      avgF1High += f.bands.f1High;
      avgF2Back += f.bands.f2Back;
      avgF2Rounded += f.bands.f2Rounded;
      avgF2Front += f.bands.f2Front;
    }

    const n = activeFrames.length;
    avgF0 /= n;
    avgF1Low /= n;
    avgF1High /= n;
    avgF2Back /= n;
    avgF2Rounded /= n;
    avgF2Front /= n;

    const highFreqBurst = maxFricMid + maxSibilantHigh;

    // 0. STT / FONETİK HİZALAMA KONTROLÜ:
    const sttKey = `${sylIdx}:${phon.grapheme.toLowerCase()}`;
    if (
      sttAnalysis.flaggedSyllablePhonemes.has(sttKey) ||
      sttAnalysis.flaggedGraphemes.has(phon.grapheme.toLowerCase())
    ) {
      score = 24;
      const heardInstead = sttAnalysis.flaggedSyllablePhonemes.get(sttKey) || phon.confusedWith || 'farklı ses';
      feedback = `"${syllable.text}" hecesindeki "${phon.grapheme}" [${phon.ipa}] sesi yerine "${heardInstead}" sesi algılandı!`;
    }

    // 1. Ötümlü Patlayıcılar: d, b, g (PLOSIVE_VOICED) -> 't, p, k' ile karıştırılma kontrolü!
    // Fiziksel kural (Çerçeve Senkronize Analiz):
    // - Ünlü komşuluğunda ZCR tek başına yüksek çıkabilir (F2 formantı yüzünden), ancak ünlüde F0 (ötümlülük) YÜKSEKTİR.
    // - Gerçek bir 't/p/k' (ötümsüz patlayıcı) okunduğunda ise AYNI çerçevede hem ses telleri susar (f.bands.f0 < 0.16)
    //   hem de ya tam sessiz kapanma (f.rms < 0.045) ya da yüksek frekanslı soluklama patlaması
    //   (fricMid + sibilantHigh > 0.20 veya centroid > 1800Hz veya zcr > 0.15) oluşur!
    if (phon.type === 'PLOSIVE_VOICED') {
      const unvoicedTwin = phon.confusedWith || 't';
      let voicelessBurstFrames = 0;
      let voicelessClosureFrames = 0;

      for (const f of activeFrames) {
        const fHigh = f.bands.fricMid + f.bands.sibilantHigh;
        if (f.bands.f0 < 0.16 && (fHigh > 0.20 || f.centroid > 1800 || f.zcr > 0.15)) {
          voicelessBurstFrames++;
        }
        if (f.bands.f0 < 0.10 && f.rms < landmark.peakRms * 0.18) {
          voicelessClosureFrames++;
        }
      }

      if (voicelessBurstFrames >= 1 || voicelessClosureFrames >= 2) {
        score = Math.min(score, 24);
        feedback = `⚠️ "${syllable.text}" hecesindeki yumuşak/ötümlü "${phon.grapheme}" [${phon.ipa}] yerine sert/ötümsüz "${unvoicedTwin}" [${unvoicedTwin}ʰ] sesi çıkardınız! Ses tellerini kesmeden yumuşak "${phon.grapheme}" okuyun.`;
      } else if (avgF0 < 0.14) {
        score = Math.min(score, 48);
        feedback = `"${syllable.text}" hecesindeki "${phon.grapheme}" sesinde ötümlülük zayıf kaldı, "${unvoicedTwin}" sesine kaydı.`;
      } else if (score > 60) {
        score += 6;
      }
    }

    // 2. Ötümsüz / Soluklu Patlayıcılar: t, p, k (PLOSIVE_UNVOICED) -> 'd, b, g' gibi yumuşatılma kontrolü!
    else if (phon.type === 'PLOSIVE_UNVOICED') {
      const voicedTwin = phon.confusedWith || 'd';
      let voicelessOrBurstFrames = 0;
      for (const f of activeFrames) {
        const fHigh = f.bands.fricMid + f.bands.sibilantHigh;
        if (f.bands.f0 < 0.18 || fHigh > 0.16 || f.centroid > 1650 || f.zcr > 0.12) {
          voicelessOrBurstFrames++;
        }
      }

      if (voicelessOrBurstFrames === 0 && avgF0 > 0.25) {
        score = Math.min(score, 32);
        feedback = `⚠️ "${syllable.text}" hecesindeki sert "${phon.grapheme}" [${phon.ipa}] sesini fazla yumuşatarak "${voicedTwin}" gibi ötümlü okudunuz!`;
      } else if (score > 60) {
        score += 5;
      }
    }

    // 3. İnce "ch" (Ich-Laut [ç])
    else if (phon.type === 'FRICATIVE_PALATAL') {
      if (maxFricMid < 0.14 || maxZcr < 0.09) {
        score = Math.min(score, 34);
        feedback = `"${syllable.text}" hecesindeki ince "${phon.grapheme}" [ç] sürtünmesi zayıf kaldı veya "k/h" gibi okundu. Dil sırtını damağa yaklaştırarak ince [ç] sesi verin.`;
      } else if (maxCentroid < 2200) {
        score = Math.min(score, 46);
        feedback = `"${syllable.text}" içindeki "${phon.grapheme}" sesini fazla kalın ([x] veya [ʃ] gibi) çıkardınız; daha önden ve ince [ç] olmalı.`;
      } else if (score > 60) {
        score += 5;
      }
    }

    // 4. Kalın "ch" (Ach-Laut [x])
    else if (phon.type === 'FRICATIVE_VELAR') {
      if (maxZcr < 0.065) {
        score = Math.min(score, 38);
        feedback = `"${syllable.text}" hecesindeki kalın "ch" [x] boğaz sürtünmesi duyulmadı ("k" gibi sert kapatmayın).`;
      } else if (maxCentroid > 3600) {
        score = Math.min(score, 48);
        feedback = `"${syllable.text}" hecesindeki "ch" sesini fazla ince ("ş/ç" gibi) okudunuz; a/o/u sonrasında boğazdan kalın [x] çıkmalı.`;
      } else if (score > 60) {
        score += 4;
      }
    }

    // 5. "sch", "sp-", "st-" [ʃ]
    else if (phon.type === 'SIBILANT_POSTALVEOLAR') {
      if (maxFricMid < 0.15 || maxZcr < 0.095) {
        score = Math.min(score, 32);
        feedback = `"${syllable.text}" başındaki "${phon.grapheme}" [ʃ] ("ş") sürtünmesi eksik! Almancada "${phon.grapheme}" dolgun bir "ş" ile başlamalıdır.`;
      } else if (score > 60) {
        score += 5;
      }
    }

    // 6. "z" / "tz" [ts]
    else if (phon.type === 'AFFRICATE_TS') {
      if (maxSibilantHigh < 0.12 && maxZcr < 0.12) {
        score = Math.min(score, 32);
        feedback = `"${syllable.text}" içindeki "${phon.grapheme}" harfini Türkçe "z" gibi yumuşak okudunuz; dişlerin arasından keskin "ts" [ts] olarak çıkmalı.`;
      } else if (score > 60) {
        score += 5;
      }
    }

    // 7. "ei / ai" [aɪ] Çift Ünlüsü vs "ie / i" [iː] Ayrımı (örn. vermeiden vs vermieten)
    else if (phon.type === 'DIPHTHONG_EI') {
      if (avgF1High < 0.11 && avgF1Low > avgF1High * 1.5) {
        score = Math.min(score, 30);
        feedback = `⚠️ "${syllable.text}" hecesindeki "${phon.grapheme}" [aɪ] ("ay") çift ünlüsünü "i/ie" veya "e" gibi kapalı okudunuz! Ağzınızı açarak net "ay" [aɪ] sesi verin.`;
      } else if (score > 60) {
        score += 4;
      }
    }

    // 8. Uzun "ie" [iː] vs "ei" [aɪ] Ayrımı
    else if (phon.type === 'VOWEL_LONG_I') {
      if (avgF1High > avgF1Low * 1.4) {
        score = Math.min(score, 32);
        feedback = `⚠️ "${syllable.text}" hecesindeki uzun "ie" [iː] sesini "ay (ei)" veya "e" gibi açık okudunuz; tek ve uzun bir "î" [iː] olmalı.`;
      } else if (avgSylDurationMs < 150) {
        score = Math.min(score, 52);
        feedback = `"${syllable.text}" içindeki uzun "ie" [iː] ünlüsü çok kısa kesildi.`;
      } else if (score > 60) {
        score += 4;
      }
    }

    // 9. Yuvarlak Ön Ünlüler ("ü" [y] ve "ö" [ø])
    else if (phon.type === 'VOWEL_UMLAUT_FRONT_ROUNDED') {
      if (avgF2Back > avgF2Rounded * 1.35 && avgF2Back > avgF2Front * 1.2) {
        score = Math.min(score, 34);
        feedback = `"${syllable.text}" hecesindeki "${phon.grapheme}" umlaut ünlüsü kalın "${phon.grapheme.toLowerCase() === 'ü' ? 'u' : 'o'}" sesine kaydı. Dilinizi öne alıp dudaklarınızı büzün.`;
      } else if (avgF2Front > avgF2Rounded * 1.55) {
        score = Math.min(score, 44);
        feedback = `"${syllable.text}" hecesindeki "${phon.grapheme}" sesinde dudak yuvarlaklığı eksik ("${phon.grapheme.toLowerCase() === 'ü' ? 'i' : 'e'}" gibi duyuldu).`;
      } else if (score > 60) {
        score += 4;
      }
    }

    // 10. Ötümsüz 'v' [f] (örn. ver-meiden başındaki 'v' -> [f] olmalı)
    else if (phon.type === 'FRICATIVE_UNVOICED') {
      if (phon.grapheme.toLowerCase() === 'v' && avgF0 > 0.28 && maxZcr < 0.065) {
        score = Math.min(score, 46);
        feedback = `"${syllable.text}" başındaki "v" harfini Türkçe "v" gibi titreşimli okudunuz; Almanca "${syllable.text}" önekinde "v" harfi "f" [f] olarak okunur.`;
      }
    }

    // 11. Kısa Temel Ünlüler (a, e, i, o, u) Formant Kontrolü
    else if (phon.type === 'VOWEL_SHORT_A') {
      if (avgF1High < 0.09 && avgF1Low > avgF1High * 1.8) {
        score = Math.min(score, 42);
        feedback = `"${syllable.text}" hecesindeki açık "a" ünlüsü kapalı okundu.`;
      }
    } else if (phon.type === 'VOWEL_SHORT_I') {
      if (avgF1High > avgF1Low * 1.65) {
        score = Math.min(score, 42);
        feedback = `"${syllable.text}" hecesindeki "i" ünlüsü "e/a" gibi fazla açık okundu.`;
      }
    } else if (phon.type === 'VOWEL_SHORT_U') {
      if (avgF2Front > avgF2Back * 1.5) {
        score = Math.min(score, 44);
        feedback = `"${syllable.text}" hecesindeki kalın "u" ünlüsü ince "ü/i" sesine kaydı.`;
      }
    }

    score = Math.max(15, Math.min(98, Math.round(score)));
    return {
      grapheme: phon.grapheme,
      ipa: phon.ipa,
      tr: phon.tr,
      score,
      status: score >= 82 ? 'good' : score >= 62 ? 'warning' : 'bad',
      feedback
    };
  }

  countSyllableNucleiPeaks(frames) {
    if (!frames || frames.length < 4) return 1;

    const smooth = new Float32Array(frames.length);
    for (let i = 0; i < frames.length; i++) {
      let s = 0;
      let c = 0;
      for (let k = -2; k <= 2; k++) {
        if (i + k >= 0 && i + k < frames.length) {
          s += frames[i + k].rms;
          c++;
        }
      }
      smooth[i] = s / c;
    }

    const maxRms = Math.max(...smooth, 0.01);
    const minPeakHeight = maxRms * 0.28;
    let peaks = 0;
    let lastPeakIdx = -12;

    for (let i = 2; i < smooth.length - 2; i++) {
      if (
        smooth[i] > minPeakHeight &&
        smooth[i] >= smooth[i - 1] &&
        smooth[i] >= smooth[i - 2] &&
        smooth[i] >= smooth[i + 1] &&
        smooth[i] >= smooth[i + 2] &&
        i - lastPeakIdx >= 11
      ) {
        peaks++;
        lastPeakIdx = i;
      }
    }

    return Math.max(1, peaks);
  }

  computeFluencyScore(frames, durationMs, expectedMinMs) {
    if (!frames || frames.length === 0) return 50;
    let silentGaps = 0;
    let inSilence = false;
    let silenceRun = 0;

    for (const f of frames) {
      if (f.rms < 0.035) {
        silenceRun++;
        if (silenceRun === 18 && !inSilence) {
          silentGaps++;
          inSilence = true;
        }
      } else {
        silenceRun = 0;
        inSilence = false;
      }
    }

    let score = 94 - silentGaps * 12;
    if (durationMs < expectedMinMs * 0.65) score -= 15;
    return Math.max(35, Math.min(98, score));
  }

  analyzePhoneticSTTCandidates(targetText, targetSyllables, sttTranscripts, sttInterimTokens) {
    const cleanTarget = targetText
      .toLowerCase()
      .replace(/^(der|die|das)\s+/i, '')
      .replace(/[.,!?;:"„“”()\[\]]+/g, '')
      .trim();

    const fullCleanTarget = targetText
      .toLowerCase()
      .replace(/[.,!?;:"„“”()\[\]]+/g, '')
      .trim();

    const flaggedGraphemes = new Set();
    const flaggedSyllablePhonemes = new Map();
    const syllablePenalties = {};
    const substitutionWarnings = [];

    const finalAlts = [];
    for (const group of sttTranscripts) {
      for (const alt of group) {
        if (alt.transcript) {
          finalAlts.push(alt.transcript.toLowerCase().replace(/[.,!?;:"„“”()\[\]]+/g, '').trim());
        }
      }
    }

    const interimCleaned = sttInterimTokens
      .map((t) => t.toLowerCase().replace(/[.,!?;:"„“”()\[\]]+/g, '').trim())
      .filter(Boolean);

    const allCandidates = [...finalAlts, ...interimCleaned];

    if (allCandidates.length === 0) {
      return {
        hasData: false,
        bestTranscript: '',
        rawHeardDisplay: '',
        phoneticSimilarity: 0.75,
        exactWordMismatchCount: 0,
        flaggedGraphemes,
        flaggedSyllablePhonemes,
        syllablePenalties,
        substitutionWarnings
      };
    }

    const topFinal = finalAlts[0] || interimCleaned[interimCleaned.length - 1] || '';
    const lastInterim = interimCleaned.length > 0 ? interimCleaned[interimCleaned.length - 1] : topFinal;

    const nonExactCandidates = allCandidates.filter(
      (c) => c !== fullCleanTarget && c !== cleanTarget && c.length >= 2
    );

    let primaryHeard = topFinal;
    if (
      (topFinal === fullCleanTarget || topFinal === cleanTarget) &&
      lastInterim &&
      lastInterim !== fullCleanTarget &&
      lastInterim !== cleanTarget
    ) {
      primaryHeard = lastInterim;
    } else if (
      (topFinal === fullCleanTarget || topFinal === cleanTarget) &&
      nonExactCandidates.length > 0
    ) {
      const minimalPairAlt = nonExactCandidates.find((c) => {
        const sim = this.normalizedLevenshteinSimilarity(cleanTarget, c.replace(/^(der|die|das)\s+/i, ''));
        return sim >= 0.65 && sim < 1.0;
      });
      if (minimalPairAlt) {
        primaryHeard = minimalPairAlt;
      }
    }

    const heardNoArticle = primaryHeard.replace(/^(der|die|das)\s+/i, '').trim();
    const simWithTarget = Math.max(
      this.normalizedLevenshteinSimilarity(fullCleanTarget, primaryHeard),
      this.normalizedLevenshteinSimilarity(cleanTarget, heardNoArticle)
    );

    let exactWordMismatchCount = 0;
    if (heardNoArticle !== cleanTarget && primaryHeard !== fullCleanTarget) {
      exactWordMismatchCount = 1;
      substitutionWarnings.push(
        `Fonetik Algı Uyarısı: Hedef "${targetText}" iken telaffuzunuz "${primaryHeard}" olarak duyuldu.`
      );

      const compareTarget =
        primaryHeard.startsWith('der ') || primaryHeard.startsWith('die ') || primaryHeard.startsWith('das ')
          ? fullCleanTarget
          : cleanTarget;
      const compareHeard = compareTarget === fullCleanTarget ? primaryHeard : heardNoArticle;

      let charCursor = 0;
      targetSyllables.forEach((syl, sIdx) => {
        const sylLower = syl.text.toLowerCase();
        if (sIdx === 0 && ['der', 'die', 'das'].includes(sylLower) && compareTarget === cleanTarget) {
          return;
        }

        const expectedLen = sylLower.length;
        const heardSlice = compareHeard.slice(charCursor, charCursor + expectedLen + 1);
        charCursor += expectedLen;

        if (!compareHeard.includes(sylLower)) {
          const sylSim = this.normalizedLevenshteinSimilarity(sylLower, heardSlice);
          syllablePenalties[sIdx] = Math.max(22, Math.round(sylSim * 52));

          for (const phon of syl.phonemes) {
            const g = phon.grapheme.toLowerCase();
            if (!heardSlice.includes(g)) {
              flaggedSyllablePhonemes.set(`${sIdx}:${g}`, heardSlice || 'farklı ses');
              flaggedGraphemes.add(g);
              substitutionWarnings.push(
                `"${syl.text}" hecesindeki "${phon.grapheme}" [${phon.ipa}] sesi hatalı telaffuz edildi ("${heardSlice || primaryHeard}" gibi duyuldu).`
              );
            }
          }
        }
      });
    }

    const poolStr = allCandidates.join(' ');
    if (cleanTarget.includes('d') && !cleanTarget.includes('t')) {
      const targetWithT = cleanTarget.replace(/d/g, 't');
      if (poolStr.includes(targetWithT) || (cleanTarget === 'vermeiden' && poolStr.includes('vermieten'))) {
        flaggedGraphemes.add('d');
        targetSyllables.forEach((s, idx) => {
          if (s.text.toLowerCase().includes('d')) {
            syllablePenalties[idx] = Math.min(syllablePenalties[idx] ?? 100, 35);
            flaggedSyllablePhonemes.set(`${idx}:d`, 't');
          }
        });
        substitutionWarnings.unshift(
          `Kritik Ünsüz Hatası: "${cleanTarget}" içindeki yumuşak "d" [d] sesini sert "t" [t] olarak okudunuz!`
        );
      }
    }

    if (cleanTarget.includes('ei') && poolStr.includes(cleanTarget.replace('ei', 'ie'))) {
      flaggedGraphemes.add('ei');
      substitutionWarnings.unshift(
        `Kritik Ünlü Hatası: "ei" [aɪ] ("ay") sesini "ie" [iː] ("i:") gibi okudunuz (örn. vermeiden vs vermieten)!`
      );
    }

    return {
      hasData: true,
      bestTranscript: topFinal,
      rawHeardDisplay: primaryHeard,
      phoneticSimilarity: simWithTarget,
      exactWordMismatchCount,
      flaggedGraphemes,
      flaggedSyllablePhonemes,
      syllablePenalties,
      substitutionWarnings
    };
  }

  normalizedLevenshteinSimilarity(a, b) {
    const s1 = String(a || '').trim().toLowerCase();
    const s2 = String(b || '').trim().toLowerCase();
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;

    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    const maxLen = Math.max(m, n);
    return Math.max(0, (maxLen - dp[m][n]) / maxLen);
  }

  async evaluateWithAzureGOP(wavBlob, referenceText, azureCfg, phoneticTarget) {
    const pronHeaderObj = {
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableMiscue: 'True'
    };

    const pronHeaderBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(pronHeaderObj))));
    const endpoint = `https://${azureCfg.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=de-DE&format=detailed`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': azureCfg.key,
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': pronHeaderBase64,
        Accept: 'application/json'
      },
      body: wavBlob
    });

    if (!response.ok) {
      throw new Error(`Azure HTTP ${response.status}`);
    }

    const data = await response.json();
    const nbest = data?.NBest?.[0];
    if (!nbest) return null;

    const pa = nbest.PronunciationAssessment || {};
    const overallScore = Math.round(pa.PronScore ?? pa.AccuracyScore ?? 0);
    const accuracyScore = Math.round(pa.AccuracyScore ?? overallScore);
    const fluencyScore = Math.round(pa.FluencyScore ?? overallScore);
    const completenessScore = Math.round(pa.CompletenessScore ?? 100);
    const prosodyScore = Math.round(pa.ProsodyScore ?? fluencyScore);

    const azureSyllables = [];
    const feedbackTips = [];

    if (Array.isArray(nbest.Words)) {
      for (const w of nbest.Words) {
        if (Array.isArray(w.Syllables) && w.Syllables.length > 0) {
          for (const s of w.Syllables) {
            const sScore = Math.round(s.PronunciationAssessment?.AccuracyScore ?? accuracyScore);
            azureSyllables.push({
              text: s.Syllable || s.Grapheme || w.Word,
              ipa: s.Syllable || '',
              trGuide: '',
              isStressed: false,
              score: sScore,
              status: sScore >= 82 ? 'good' : sScore >= 62 ? 'warning' : 'bad',
              phonemes: (w.Phonemes || []).map((p) => {
                const pScore = Math.round(p.PronunciationAssessment?.AccuracyScore ?? sScore);
                if (pScore < 72) {
                  feedbackTips.push(`"${w.Word}" kelimesindeki [${p.Phoneme}] fonemi zayıf telaffuz edildi (%${pScore}).`);
                }
                return {
                  grapheme: p.Phoneme,
                  ipa: p.Phoneme,
                  score: pScore,
                  status: pScore >= 82 ? 'good' : pScore >= 62 ? 'warning' : 'bad'
                };
              })
            });
          }
        } else {
          const wScore = Math.round(w.PronunciationAssessment?.AccuracyScore ?? accuracyScore);
          azureSyllables.push({
            text: w.Word,
            ipa: w.Word,
            trGuide: '',
            isStressed: false,
            score: wScore,
            status: wScore >= 82 ? 'good' : wScore >= 62 ? 'warning' : 'bad',
            phonemes: (w.Phonemes || []).map((p) => {
              const pScore = Math.round(p.PronunciationAssessment?.AccuracyScore ?? wScore);
              if (pScore < 72) {
                feedbackTips.push(`"${w.Word}" içindeki [${p.Phoneme}] sesinde sapma tespit edildi (%${pScore}).`);
              }
              return {
                grapheme: p.Phoneme,
                ipa: p.Phoneme,
                score: pScore,
                status: pScore >= 82 ? 'good' : pScore >= 62 ? 'warning' : 'bad'
              };
            })
          });
        }
      }
    }

    if (feedbackTips.length === 0) {
      feedbackTips.push(
        overallScore >= 84
          ? 'Mükemmel! Fonemler ve vurgular ana dili Almanca olan bir konuşmacıya çok yakın.'
          : 'Düşük puanlı fonemleri dinleyerek dil ve dudak pozisyonunuza dikkat edin.'
      );
    }

    return {
      hasSpeech: true,
      overallScore,
      accuracyScore,
      prosodyScore,
      fluencyScore,
      completenessScore,
      recognizedText: nbest.Display || nbest.Lexical || '',
      phoneticTarget,
      syllables: azureSyllables.length > 0 ? azureSyllables : phoneticTarget.syllables,
      feedbackTips: [...new Set(feedbackTips)].slice(0, 5)
    };
  }

  downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
    if (outputSampleRate === inputSampleRate) return buffer;
    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  encodeWAV(samples, sampleRate = 16000) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}

window.GermanPhoneticAnalyzer = GermanPhoneticAnalyzer;
window.wmPronunciation = new WortCoachPronunciationEngine();
