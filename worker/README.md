# WortCoach Gemini Proxy

Anahtar tarayıcıya/GitHub'a girmez, sadece Cloudflare Worker secret'ı olarak durur.

```
cd worker
npx wrangler login
npx wrangler secret put GEMINI_KEY
npx wrangler deploy
```

Endpoint: `POST /gemini {prompt}` -> `{text}`. `ALLOWED_ORIGIN` (wrangler.toml) sadece senin sitenden gelen isteklere izin verir.
