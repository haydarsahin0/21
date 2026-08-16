/**
 * Desteklenen model saglayicilari.
 *
 * Ikisi de OpenAI uyumlu /chat/completions konusuyor, dolayisiyla tek kod yolu
 * yetiyor. Site statik oldugu icin istek dogrudan tarayicidan gidiyor; bir
 * saglayicinin calismasi CORS izni vermesine bagli.
 */

export interface ProviderModel {
  id: string;
  label: string;
}

export interface Provider {
  id: string;
  label: string;
  baseUrl: string;
  /** Ayarlarda onerilen modeller; kullanici elle de yazabiliyor. */
  models: ProviderModel[];
  defaultModel: string;
  keyUrl: string;
  keyPlaceholder: string;
  /** Ucret/kota durumu — ayarlar ekraninda gosteriliyor. */
  note: string;
  /**
   * OpenAI akil yurutme modelleri max_tokens yerine max_completion_tokens
   * bekliyor; eskisini gonderince istegi reddediyorlar.
   */
  usesMaxCompletionTokens?: boolean;
}

export const PROVIDERS: Provider[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash — ucuz ve hızlı" },
      { id: "deepseek-v4-pro", label: "V4 Pro — daha güçlü akıl yürütme" },
    ],
    defaultModel: "deepseek-v4-flash",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    note: "Kullandıkça öde, çok ucuz. Yeni hesaba 30 gün geçerli 5M token hediye.",
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-5.6", label: "GPT-5.6 — önerilen" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra — dengeli, daha ucuz" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna — en ucuz" },
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol — en güçlü" },
    ],
    defaultModel: "gpt-5.6-terra",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-...",
    note: "Kullandıkça öde. Hesabına önceden bakiye yüklemen gerekiyor.",
    usesMaxCompletionTokens: true,
  },
];

export const DEFAULT_PROVIDER = "deepseek";

export function isKnownProvider(id: string): boolean {
  return PROVIDERS.some((provider) => provider.id === id);
}

export function getProvider(id: string): Provider {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}

export function defaultModel(providerId: string): string {
  return getProvider(providerId).defaultModel;
}
