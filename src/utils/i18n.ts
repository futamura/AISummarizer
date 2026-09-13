/**
 * Language code to full name mapping
 * Based on ISO 639-1 language codes
 */
const LANGUAGE_MAP: Record<string, string> = {
  // A
  aa: 'Afar',
  ab: 'Abkhazian',
  ae: 'Avestan',
  af: 'Afrikaans',
  ak: 'Akan',
  am: 'Amharic',
  an: 'Aragonese',
  ar: 'Arabic',
  as: 'Assamese',
  av: 'Avaric',
  ay: 'Aymara',
  az: 'Azerbaijani',
  // B
  ba: 'Bashkir',
  be: 'Belarusian',
  bg: 'Bulgarian',
  bh: 'Bihari',
  bi: 'Bislama',
  bm: 'Bambara',
  bn: 'Bengali',
  bo: 'Tibetan',
  br: 'Breton',
  bs: 'Bosnian',
  // C
  ca: 'Catalan',
  ce: 'Chechen',
  ch: 'Chamorro',
  co: 'Corsican',
  cr: 'Cree',
  cs: 'Czech',
  cu: 'Church Slavic',
  cv: 'Chuvash',
  cy: 'Welsh',
  // D
  da: 'Danish',
  de: 'German',
  dv: 'Divehi',
  dz: 'Dzongkha',
  // E
  ee: 'Ewe',
  el: 'Greek',
  en: 'English',
  eo: 'Esperanto',
  es: 'Spanish',
  et: 'Estonian',
  eu: 'Basque',
  // F
  fa: 'Persian',
  ff: 'Fulah',
  fi: 'Finnish',
  fj: 'Fijian',
  fo: 'Faroese',
  fr: 'French',
  fy: 'Western Frisian',
  // G
  ga: 'Irish',
  gd: 'Scottish Gaelic',
  gl: 'Galician',
  gn: 'Guarani',
  gu: 'Gujarati',
  gv: 'Manx',
  // H
  ha: 'Hausa',
  he: 'Hebrew',
  hi: 'Hindi',
  ho: 'Hiri Motu',
  hr: 'Croatian',
  ht: 'Haitian',
  hu: 'Hungarian',
  hy: 'Armenian',
  hz: 'Herero',
  // I
  ia: 'Interlingua',
  id: 'Indonesian',
  ie: 'Interlingue',
  ig: 'Igbo',
  ii: 'Sichuan Yi',
  ik: 'Inupiaq',
  io: 'Ido',
  is: 'Icelandic',
  it: 'Italian',
  iu: 'Inuktitut',
  // J
  ja: 'Japanese',
  jv: 'Javanese',
  // K
  ka: 'Georgian',
  kg: 'Kongo',
  ki: 'Kikuyu',
  kj: 'Kuanyama',
  kk: 'Kazakh',
  kl: 'Kalaallisut',
  km: 'Central Khmer',
  kn: 'Kannada',
  ko: 'Korean',
  kr: 'Kanuri',
  ks: 'Kashmiri',
  ku: 'Kurdish',
  kv: 'Komi',
  kw: 'Cornish',
  ky: 'Kirghiz',
  // L
  la: 'Latin',
  lb: 'Luxembourgish',
  lg: 'Ganda',
  li: 'Limburgan',
  ln: 'Lingala',
  lo: 'Lao',
  lt: 'Lithuanian',
  lu: 'Luba-Katanga',
  lv: 'Latvian',
  // M
  mg: 'Malagasy',
  mh: 'Marshallese',
  mi: 'Maori',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mn: 'Mongolian',
  mr: 'Marathi',
  ms: 'Malay',
  mt: 'Maltese',
  my: 'Burmese',
  // N
  na: 'Nauru',
  nb: 'Norwegian Bokmål',
  nd: 'North Ndebele',
  ne: 'Nepali',
  ng: 'Ndonga',
  nl: 'Dutch',
  nn: 'Norwegian Nynorsk',
  no: 'Norwegian',
  nr: 'South Ndebele',
  nv: 'Navajo',
  ny: 'Chichewa',
  // O
  oc: 'Occitan',
  oj: 'Ojibwa',
  om: 'Oromo',
  or: 'Oriya',
  os: 'Ossetian',
  // P
  pa: 'Panjabi',
  pi: 'Pali',
  pl: 'Polish',
  ps: 'Pushto',
  pt: 'Portuguese',
  // Q
  qu: 'Quechua',
  // R
  rm: 'Romansh',
  rn: 'Rundi',
  ro: 'Romanian',
  ru: 'Russian',
  rw: 'Kinyarwanda',
  // S
  sa: 'Sanskrit',
  sc: 'Sardinian',
  sd: 'Sindhi',
  se: 'Northern Sami',
  sg: 'Sango',
  si: 'Sinhala',
  sk: 'Slovak',
  sl: 'Slovenian',
  sm: 'Samoan',
  sn: 'Shona',
  so: 'Somali',
  sq: 'Albanian',
  sr: 'Serbian',
  ss: 'Swati',
  st: 'Southern Sotho',
  su: 'Sundanese',
  sv: 'Swedish',
  sw: 'Swahili',
  // T
  ta: 'Tamil',
  te: 'Telugu',
  tg: 'Tajik',
  th: 'Thai',
  ti: 'Tigrinya',
  tk: 'Turkmen',
  tl: 'Tagalog',
  tn: 'Tswana',
  to: 'Tonga',
  tr: 'Turkish',
  ts: 'Tsonga',
  tt: 'Tatar',
  tw: 'Twi',
  ty: 'Tahitian',
  // U
  ug: 'Uighur',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  // V
  ve: 'Venda',
  vi: 'Vietnamese',
  vo: 'Volapük',
  // W
  wa: 'Walloon',
  wo: 'Wolof',
  // X
  xh: 'Xhosa',
  // Y
  yi: 'Yiddish',
  yo: 'Yoruba',
  // Z
  za: 'Zhuang',
  zh: 'Chinese',
  zu: 'Zulu',
};

/**
 * Get the primary language code from a full language code
 * @param languageCode - Full language code (e.g., 'en-US', 'ja-JP')
 * @returns Primary language code (e.g., 'en', 'ja')
 */
const getPrimaryLanguageCode = (languageCode: string): string => {
  return languageCode.split('-')[0].toLowerCase();
};

export const getBrowserLanguage = (): string => {
  /* Fall back to English where navigator or its language is unavailable (e.g. Node-based tests) */
  const language = typeof navigator === 'undefined' ? undefined : navigator?.language;
  if (!language) {
    return 'English';
  }
  const primaryCode = getPrimaryLanguageCode(language);
  return LANGUAGE_MAP[primaryCode] || 'English';
};
