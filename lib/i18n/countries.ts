import type { Locale } from './config'

const ISO_COUNTRY_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`

export const COUNTRY_CODES = ISO_COUNTRY_CODES.split(' ') as readonly string[]

const SPANISH_COUNTRIES = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GQ', 'GT',
  'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
])

export function countryOptions(locale: Locale) {
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' })
  return COUNTRY_CODES.map((code) => ({ code, label: displayNames.of(code) ?? code }))
    .sort((left, right) => left.label.localeCompare(right.label, locale))
}

export function suggestedLocaleForCountry(countryCode: string): Locale | null {
  const code = countryCode.toUpperCase()
  if (code === 'BR') return 'pt-BR'
  if (SPANISH_COUNTRIES.has(code)) return 'es'
  if (new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'IE']).has(code)) return 'en'
  if (new Set(['FR', 'BE', 'MC', 'LU']).has(code)) return 'fr'
  if (code === 'ID') return 'id'
  if (new Set(['KR', 'KP']).has(code)) return 'ko'
  if (code === 'JP') return 'ja'
  if (new Set(['CN', 'SG']).has(code)) return 'zh-CN'
  return null
}
