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
    this.currentAudio = null;
    this.isPlaying = false;
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

  stop() {
    this.isPlaying = false;
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (_) {}
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (_) {}
      this.currentAudio = null;
    }
  }

  speak(text, lang = 'de-DE', rate = 0.90, onEnd = null) {
    if (!text) {
      if (onEnd) onEnd();
      return;
    }
    const clean = String(text).trim();
    if (!clean) {
      if (onEnd) onEnd();
      return;
    }

    this.stop();
    this.isPlaying = true;

    const targetLang = (lang || 'de-DE').toLowerCase();
    const isGerman = targetLang.startsWith('de');
    const speechRate = Math.min(Math.max(Number(rate) || 0.90, 0.5), 2.0);

    // Almanca telaffuz için KESİN ALMANCA KİLİDİ:
    if (isGerman) {
      if (this.synth) {
        const deVoice = this.getStrictGermanVoice();

        // Yalnızca ve yalnızca gerçek bir Almanca ses bulunduysa Web Speech API kullan
        if (deVoice) {
          const utterance = new SpeechSynthesisUtterance(clean);
          utterance.lang = 'de-DE';
          utterance.voice = deVoice;
          utterance.rate = speechRate;
          utterance.pitch = 1.0;
          utterance.onend = () => {
            this.isPlaying = false;
            if (typeof onEnd === 'function') onEnd();
          };
          utterance.onerror = () => {
            this.isPlaying = false;
            if (typeof onEnd === 'function') onEnd();
          };
          if (navigator.vibrate) navigator.vibrate(10);
          this.synth.speak(utterance);
          return;
        }
      }

      // Cihazda yerel Almanca ses yoksa: Otantik ana dili Almanca olan ses akışını çal
      // (ASLA ve ASLA Türkçe ses motoruna düşmez!)
      this.playNativeGermanAudio(clean, onEnd);
      return;
    }

    // İngilizce veya Türkçe seslendirme
    if (this.synth) {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = targetLang.startsWith('en') ? 'en-US' : 'tr-TR';
      utterance.rate = speechRate;
      utterance.onend = () => {
        this.isPlaying = false;
        if (typeof onEnd === 'function') onEnd();
      };
      utterance.onerror = () => {
        this.isPlaying = false;
        if (typeof onEnd === 'function') onEnd();
      };
      this.synth.speak(utterance);
    } else {
      this.isPlaying = false;
      if (typeof onEnd === 'function') onEnd();
    }
  }

  speakFromOffset(fullText, startIndex = 0, lang = 'de-DE', rate = 0.90, onEnd = null) {
    if (!fullText) return;
    const textToSpeak = typeof startIndex === 'number' && startIndex > 0
      ? String(fullText).slice(startIndex).trim()
      : String(fullText).trim();
    if (!textToSpeak) return;
    this.speak(textToSpeak, lang, rate, onEnd);
  }

  playNativeGermanAudio(text, onEnd = null) {
    try {
      const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=de&q=${encodeURIComponent(text)}`;
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      const finishHandler = () => {
        this.isPlaying = false;
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        if (typeof onEnd === 'function') onEnd();
      };

      audio.onended = finishHandler;
      audio.onerror = () => {
        // Fallback stream: gtx client
        const altUrl = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=de&q=${encodeURIComponent(text)}`;
        const altAudio = new Audio(altUrl);
        this.currentAudio = altAudio;
        altAudio.onended = finishHandler;
        altAudio.onerror = () => {
          this.isPlaying = false;
          this.currentAudio = null;
          console.warn("Almanca ses akışı engellendi, Türkçe okuma KESİNLİKLE engellendi.");
          if (typeof onEnd === 'function') onEnd();
        };
        altAudio.play().catch(() => finishHandler());
      };

      if (navigator.vibrate) navigator.vibrate(10);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          audio.onerror();
        });
      }
    } catch (_) {
      this.isPlaying = false;
      this.currentAudio = null;
      if (typeof onEnd === 'function') onEnd();
    }
  }
}

window.wmTTS = new WortMeisterTTS();
