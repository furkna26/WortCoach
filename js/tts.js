/**
 * WortCoach — Dil Kilitli Ses Motoru (tts.js v3.1.0)
 * KESİN KURAL: Almanca kelimeler daima saf Almanca (de-DE) sesiyle okunur.
 * Türkçe TTS motorunun Almanca kelimeleri telaffuz etmesi KESİNLİKLE engellenir.
 * Cihazda yerel Almanca ses paketi yoksa, anında otantik ana dili Almanca olan
 * ses akışına (Native German Audio) düşer; ASLA TÜRKÇE SES İLE OKUMA YAPMAZ.
 */

class WortMeisterTTS {
  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    if (this.synth) {
      this.loadVoices();
      if (typeof this.synth.onvoiceschanged !== 'undefined') {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.synth) return [];
    this.voices = this.synth.getVoices() || [];
    return this.voices;
  }

  getStrictGermanVoice() {
    const list = this.synth ? (this.synth.getVoices() || []) : [];
    if (!list || list.length === 0) return null;

    // 1. Doğrudan de-DE yerel sesi veya Google Deutsch
    let v = list.find(
      (x) =>
        x.lang &&
        (x.lang.toLowerCase() === 'de-de' || x.lang.toLowerCase() === 'de_de') &&
        !x.lang.toLowerCase().startsWith('tr')
    );
    if (v) return v;

    // 2. Herhangi bir Almanca varyantı (de-AT, de-CH)
    v = list.find(
      (x) => x.lang && x.lang.toLowerCase().startsWith('de') && !x.lang.toLowerCase().startsWith('tr')
    );
    if (v) return v;

    // 3. İsmi German / Deutsch / Stefan / Katja / Hedda / Marlene olan sesler
    v = list.find(
      (x) =>
        /german|deutsch|stefan|katja|hedda|marlene/i.test(x.name || '') &&
        !/turkish|türkçe|tolga|emel/i.test(x.name || '')
    );
    if (v) return v;

    return null;
  }

  speak(text, lang = 'de-DE') {
    if (!text) return;
    const clean = String(text).trim();
    if (!clean) return;

    const targetLang = (lang || 'de-DE').toLowerCase();
    const isGerman = targetLang.startsWith('de');

    // Almanca telaffuz için KESİN ALMANCA KİLİDİ:
    if (isGerman) {
      if (this.synth) {
        this.synth.cancel();
        const deVoice = this.getStrictGermanVoice();

        // Yalnızca ve yalnızca gerçek bir Almanca ses bulunduysa Web Speech API kullan
        if (deVoice) {
          const utterance = new SpeechSynthesisUtterance(clean);
          utterance.lang = 'de-DE';
          utterance.voice = deVoice;
          utterance.rate = 0.90;
          utterance.pitch = 1.0;
          if (navigator.vibrate) navigator.vibrate(10);
          this.synth.speak(utterance);
          return;
        }
      }

      // Cihazda yerel Almanca ses yoksa: Otantik ana dili Almanca olan ses akışını çal
      // (ASLA ve ASLA Türkçe ses motoruna düşmez!)
      this.playNativeGermanAudio(clean);
      return;
    }

    // İngilizce seslendirme
    if (this.synth) {
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = targetLang.startsWith('en') ? 'en-US' : 'tr-TR';
      utterance.rate = 0.92;
      this.synth.speak(utterance);
    }
  }

  playNativeGermanAudio(text) {
    try {
      const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=de&q=${encodeURIComponent(text)}`;
      const audio = new Audio(audioUrl);
      if (navigator.vibrate) navigator.vibrate(10);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Fallback stream: gtx client
          const altUrl = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=de&q=${encodeURIComponent(text)}`;
          const altAudio = new Audio(altUrl);
          altAudio.play().catch(() => {
            // ASLA Türkçe ses motoruna DÜŞME. Sessizce logla.
            console.warn("Almanca ses akışı engellendi, Türkçe okuma KESİNLİKLE engellendi.");
          });
        });
      }
    } catch (_) {}
  }
}

window.wmTTS = new WortMeisterTTS();
