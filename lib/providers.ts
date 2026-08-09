/**
 * Desteklenen model saglayicilari.
 *
 * Site statik oldugu icin istek dogrudan tarayicidan gidiyor. Bu yuzden bir
 * saglayicinin kullanilabilmesi teknik olarak tek sarta bagli: tarayici
 * cagrilarina CORS izni vermesi. Vermeyen bir saglayici arada bir sunucu
 * olmadan calisamaz — arayuz bu durumu ayirt edip soyluyor.
 */

export type ProviderKind = "gemini" | "openai";

export interface ProviderModel {
  id: string;
  label: string;
}

export interface Provider {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  models: ProviderModel[];
  keyUrl: string;
  keyPlaceholder: string;
  /** Ucret/kota durumu — ayarlar ekraninda gosteriliyor. */
  note: string;
  /** Tarayicidan dogrudan cagrilabildigi dogrulandi mi? */
  corsVerified: boolean;
  /** Kullanici kendi adresini girer (custom saglayici). */
  editableBaseUrl?: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: "google",
    label: "Google Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      { id: "gemini-2.5-flash-lite", label: "Flash-Lite — günde 1.000 mesaj" },
      { id: "gemini-2.5-flash", label: "Flash — günde 250, daha isabetli" },
      { id: "gemini-2.5-pro", label: "Pro — günde 100, en isabetli" },
    ],
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    note: "Ücretsiz, kredi kartı istemiyor. Günde 1.000 mesaja kadar.",
    corsVerified: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash — ucuz ve hızlı" },
      { id: "deepseek-v4-pro", label: "V4 Pro — daha güçlü akıl yürütme" },
    ],
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    note: "Yeni hesaplara 30 gün geçerli 5M token hediye; sonrası kullandıkça öde (çok ucuz).",
    corsVerified: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "deepseek/deepseek-chat-v3.1:free", label: "DeepSeek (ücretsiz)" },
      { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "google/gemini-2.5-flash-lite", label: "Gemini Flash-Lite" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (ücretsiz)" },
    ],
    keyUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-...",
    note: "Tek anahtarla onlarca model; :free modeller günde 50 mesaj (10 $ bakiye varsa 1.000).",
    corsVerified: false,
  },
  {
    id: "custom",
    label: "Başka (OpenAI uyumlu)",
    kind: "openai",
    baseUrl: "",
    models: [],
    keyUrl: "",
    keyPlaceholder: "sk-...",
    note: "OpenAI uyumlu herhangi bir adres. Ollama gibi yerel sunucular da olur.",
    corsVerified: false,
    editableBaseUrl: true,
  },
];

export const DEFAULT_PROVIDER = "google";

export function getProvider(id: string): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export function defaultModel(providerId: string): string {
  return getProvider(providerId).models[0]?.id ?? "";
}
