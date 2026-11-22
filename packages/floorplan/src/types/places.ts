/**
 * COD-3: the places a plan can say it will be built in, as Grid's own list: every country and
 * territory with an ISO 3166-1 code, its two-letter and three-letter codes, the short English
 * name Grid prints for it, and a few other names people often use for it.
 *
 * The codes and the names are facts, written here as data in Grid's own words; nothing is copied
 * from the standard's own tables. Everything a report says about a place comes from this list
 * (`countryName`), never from the text a person or an agent wrote, so a plan or an argument can
 * name a place but cannot put words of its own into a report.
 *
 * A name that could mean two places ("Congo", "Korea", "Virgin Islands") is not taken: it is
 * refused, and the person writes the place's code or its full name. A part of a country
 * ("England", "Scotland") is not a place on this list.
 *
 * Pure data and one lookup. No file, no network.
 */

/** One place: its two-letter code (ISO 3166-1 alpha-2), its three-letter code (alpha-3), Grid's name for it and other names it is known by. */
export interface Country {
  readonly code: string
  readonly code3: string
  readonly name: string
  readonly aliases: readonly string[]
}

/** The most characters a place's name or code may have where Grid reads one. */
export const PLACE_TEXT_MAX = 60

// [two-letter code, three-letter code, Grid's name, ...other names]
const LIST: readonly (readonly [string, string, string, ...string[]])[] = [
  ['AF', 'AFG', 'Afghanistan'],
  ['AX', 'ALA', 'Åland Islands'],
  ['AL', 'ALB', 'Albania'],
  ['DZ', 'DZA', 'Algeria'],
  ['AS', 'ASM', 'American Samoa'],
  ['AD', 'AND', 'Andorra'],
  ['AO', 'AGO', 'Angola'],
  ['AI', 'AIA', 'Anguilla'],
  ['AQ', 'ATA', 'Antarctica'],
  ['AG', 'ATG', 'Antigua and Barbuda'],
  ['AR', 'ARG', 'Argentina'],
  ['AM', 'ARM', 'Armenia'],
  ['AW', 'ABW', 'Aruba'],
  ['AU', 'AUS', 'Australia'],
  ['AT', 'AUT', 'Austria'],
  ['AZ', 'AZE', 'Azerbaijan'],
  ['BS', 'BHS', 'Bahamas'],
  ['BH', 'BHR', 'Bahrain'],
  ['BD', 'BGD', 'Bangladesh'],
  ['BB', 'BRB', 'Barbados'],
  ['BY', 'BLR', 'Belarus'],
  ['BE', 'BEL', 'Belgium'],
  ['BZ', 'BLZ', 'Belize'],
  ['BJ', 'BEN', 'Benin'],
  ['BM', 'BMU', 'Bermuda'],
  ['BT', 'BTN', 'Bhutan'],
  ['BO', 'BOL', 'Bolivia'],
  ['BQ', 'BES', 'Bonaire, Sint Eustatius and Saba', 'Caribbean Netherlands'],
  ['BA', 'BIH', 'Bosnia and Herzegovina', 'Bosnia'],
  ['BW', 'BWA', 'Botswana'],
  ['BV', 'BVT', 'Bouvet Island'],
  ['BR', 'BRA', 'Brazil'],
  ['IO', 'IOT', 'British Indian Ocean Territory'],
  ['BN', 'BRN', 'Brunei'],
  ['BG', 'BGR', 'Bulgaria'],
  ['BF', 'BFA', 'Burkina Faso'],
  ['BI', 'BDI', 'Burundi'],
  ['CV', 'CPV', 'Cape Verde', 'Cabo Verde'],
  ['KH', 'KHM', 'Cambodia'],
  ['CM', 'CMR', 'Cameroon'],
  ['CA', 'CAN', 'Canada'],
  ['KY', 'CYM', 'Cayman Islands'],
  ['CF', 'CAF', 'Central African Republic'],
  ['TD', 'TCD', 'Chad'],
  ['CL', 'CHL', 'Chile'],
  ['CN', 'CHN', 'China'],
  ['CX', 'CXR', 'Christmas Island'],
  ['CC', 'CCK', 'Cocos Islands', 'Cocos (Keeling) Islands', 'Keeling Islands'],
  ['CO', 'COL', 'Colombia'],
  ['KM', 'COM', 'Comoros'],
  ['CG', 'COG', 'Republic of the Congo', 'Congo-Brazzaville'],
  ['CD', 'COD', 'Democratic Republic of the Congo', 'DR Congo', 'DRC', 'Congo-Kinshasa'],
  ['CK', 'COK', 'Cook Islands'],
  ['CR', 'CRI', 'Costa Rica'],
  ['CI', 'CIV', "Côte d'Ivoire", 'Ivory Coast'],
  ['HR', 'HRV', 'Croatia'],
  ['CU', 'CUB', 'Cuba'],
  ['CW', 'CUW', 'Curaçao'],
  ['CY', 'CYP', 'Cyprus'],
  ['CZ', 'CZE', 'Czechia', 'Czech Republic'],
  ['DK', 'DNK', 'Denmark'],
  ['DJ', 'DJI', 'Djibouti'],
  ['DM', 'DMA', 'Dominica'],
  ['DO', 'DOM', 'Dominican Republic'],
  ['EC', 'ECU', 'Ecuador'],
  ['EG', 'EGY', 'Egypt'],
  ['SV', 'SLV', 'El Salvador'],
  ['GQ', 'GNQ', 'Equatorial Guinea'],
  ['ER', 'ERI', 'Eritrea'],
  ['EE', 'EST', 'Estonia'],
  ['SZ', 'SWZ', 'Eswatini', 'Swaziland'],
  ['ET', 'ETH', 'Ethiopia'],
  ['FK', 'FLK', 'Falkland Islands'],
  ['FO', 'FRO', 'Faroe Islands'],
  ['FJ', 'FJI', 'Fiji'],
  ['FI', 'FIN', 'Finland'],
  ['FR', 'FRA', 'France'],
  ['GF', 'GUF', 'French Guiana'],
  ['PF', 'PYF', 'French Polynesia'],
  ['TF', 'ATF', 'French Southern Territories'],
  ['GA', 'GAB', 'Gabon'],
  ['GM', 'GMB', 'Gambia'],
  ['GE', 'GEO', 'Georgia'],
  ['DE', 'DEU', 'Germany'],
  ['GH', 'GHA', 'Ghana'],
  ['GI', 'GIB', 'Gibraltar'],
  ['GR', 'GRC', 'Greece'],
  ['GL', 'GRL', 'Greenland'],
  ['GD', 'GRD', 'Grenada'],
  ['GP', 'GLP', 'Guadeloupe'],
  ['GU', 'GUM', 'Guam'],
  ['GT', 'GTM', 'Guatemala'],
  ['GG', 'GGY', 'Guernsey'],
  ['GN', 'GIN', 'Guinea'],
  ['GW', 'GNB', 'Guinea-Bissau'],
  ['GY', 'GUY', 'Guyana'],
  ['HT', 'HTI', 'Haiti'],
  ['HM', 'HMD', 'Heard Island and McDonald Islands'],
  ['VA', 'VAT', 'Vatican City', 'Holy See'],
  ['HN', 'HND', 'Honduras'],
  ['HK', 'HKG', 'Hong Kong'],
  ['HU', 'HUN', 'Hungary'],
  ['IS', 'ISL', 'Iceland'],
  ['IN', 'IND', 'India'],
  ['ID', 'IDN', 'Indonesia'],
  ['IR', 'IRN', 'Iran'],
  ['IQ', 'IRQ', 'Iraq'],
  ['IE', 'IRL', 'Ireland'],
  ['IM', 'IMN', 'Isle of Man'],
  ['IL', 'ISR', 'Israel'],
  ['IT', 'ITA', 'Italy'],
  ['JM', 'JAM', 'Jamaica'],
  ['JP', 'JPN', 'Japan'],
  ['JE', 'JEY', 'Jersey'],
  ['JO', 'JOR', 'Jordan'],
  ['KZ', 'KAZ', 'Kazakhstan'],
  ['KE', 'KEN', 'Kenya'],
  ['KI', 'KIR', 'Kiribati'],
  ['KP', 'PRK', 'North Korea'],
  ['KR', 'KOR', 'South Korea', 'Republic of Korea'],
  ['KW', 'KWT', 'Kuwait'],
  ['KG', 'KGZ', 'Kyrgyzstan'],
  ['LA', 'LAO', 'Laos'],
  ['LV', 'LVA', 'Latvia'],
  ['LB', 'LBN', 'Lebanon'],
  ['LS', 'LSO', 'Lesotho'],
  ['LR', 'LBR', 'Liberia'],
  ['LY', 'LBY', 'Libya'],
  ['LI', 'LIE', 'Liechtenstein'],
  ['LT', 'LTU', 'Lithuania'],
  ['LU', 'LUX', 'Luxembourg'],
  ['MO', 'MAC', 'Macao', 'Macau'],
  ['MG', 'MDG', 'Madagascar'],
  ['MW', 'MWI', 'Malawi'],
  ['MY', 'MYS', 'Malaysia'],
  ['MV', 'MDV', 'Maldives'],
  ['ML', 'MLI', 'Mali'],
  ['MT', 'MLT', 'Malta'],
  ['MH', 'MHL', 'Marshall Islands'],
  ['MQ', 'MTQ', 'Martinique'],
  ['MR', 'MRT', 'Mauritania'],
  ['MU', 'MUS', 'Mauritius'],
  ['YT', 'MYT', 'Mayotte'],
  ['MX', 'MEX', 'Mexico'],
  ['FM', 'FSM', 'Micronesia'],
  ['MD', 'MDA', 'Moldova'],
  ['MC', 'MCO', 'Monaco'],
  ['MN', 'MNG', 'Mongolia'],
  ['ME', 'MNE', 'Montenegro'],
  ['MS', 'MSR', 'Montserrat'],
  ['MA', 'MAR', 'Morocco'],
  ['MZ', 'MOZ', 'Mozambique'],
  ['MM', 'MMR', 'Myanmar', 'Burma'],
  ['NA', 'NAM', 'Namibia'],
  ['NR', 'NRU', 'Nauru'],
  ['NP', 'NPL', 'Nepal'],
  ['NL', 'NLD', 'Netherlands', 'Holland'],
  ['NC', 'NCL', 'New Caledonia'],
  ['NZ', 'NZL', 'New Zealand'],
  ['NI', 'NIC', 'Nicaragua'],
  ['NE', 'NER', 'Niger'],
  ['NG', 'NGA', 'Nigeria'],
  ['NU', 'NIU', 'Niue'],
  ['NF', 'NFK', 'Norfolk Island'],
  ['MK', 'MKD', 'North Macedonia', 'Macedonia'],
  ['MP', 'MNP', 'Northern Mariana Islands'],
  ['NO', 'NOR', 'Norway'],
  ['OM', 'OMN', 'Oman'],
  ['PK', 'PAK', 'Pakistan'],
  ['PW', 'PLW', 'Palau'],
  ['PS', 'PSE', 'Palestine'],
  ['PA', 'PAN', 'Panama'],
  ['PG', 'PNG', 'Papua New Guinea'],
  ['PY', 'PRY', 'Paraguay'],
  ['PE', 'PER', 'Peru'],
  ['PH', 'PHL', 'Philippines'],
  ['PN', 'PCN', 'Pitcairn Islands', 'Pitcairn'],
  ['PL', 'POL', 'Poland'],
  ['PT', 'PRT', 'Portugal'],
  ['PR', 'PRI', 'Puerto Rico'],
  ['QA', 'QAT', 'Qatar'],
  ['RE', 'REU', 'Réunion'],
  ['RO', 'ROU', 'Romania'],
  ['RU', 'RUS', 'Russia', 'Russian Federation'],
  ['RW', 'RWA', 'Rwanda'],
  ['BL', 'BLM', 'Saint Barthélemy'],
  ['SH', 'SHN', 'Saint Helena, Ascension and Tristan da Cunha', 'Saint Helena'],
  ['KN', 'KNA', 'Saint Kitts and Nevis'],
  ['LC', 'LCA', 'Saint Lucia'],
  ['MF', 'MAF', 'Saint Martin'],
  ['PM', 'SPM', 'Saint Pierre and Miquelon'],
  ['VC', 'VCT', 'Saint Vincent and the Grenadines'],
  ['WS', 'WSM', 'Samoa'],
  ['SM', 'SMR', 'San Marino'],
  ['ST', 'STP', 'São Tomé and Príncipe'],
  ['SA', 'SAU', 'Saudi Arabia'],
  ['SN', 'SEN', 'Senegal'],
  ['RS', 'SRB', 'Serbia'],
  ['SC', 'SYC', 'Seychelles'],
  ['SL', 'SLE', 'Sierra Leone'],
  ['SG', 'SGP', 'Singapore'],
  ['SX', 'SXM', 'Sint Maarten'],
  ['SK', 'SVK', 'Slovakia'],
  ['SI', 'SVN', 'Slovenia'],
  ['SB', 'SLB', 'Solomon Islands'],
  ['SO', 'SOM', 'Somalia'],
  ['ZA', 'ZAF', 'South Africa'],
  ['GS', 'SGS', 'South Georgia and the South Sandwich Islands'],
  ['SS', 'SSD', 'South Sudan'],
  ['ES', 'ESP', 'Spain'],
  ['LK', 'LKA', 'Sri Lanka'],
  ['SD', 'SDN', 'Sudan'],
  ['SR', 'SUR', 'Suriname'],
  ['SJ', 'SJM', 'Svalbard and Jan Mayen'],
  ['SE', 'SWE', 'Sweden'],
  ['CH', 'CHE', 'Switzerland'],
  ['SY', 'SYR', 'Syria'],
  ['TW', 'TWN', 'Taiwan'],
  ['TJ', 'TJK', 'Tajikistan'],
  ['TZ', 'TZA', 'Tanzania'],
  ['TH', 'THA', 'Thailand'],
  ['TL', 'TLS', 'Timor-Leste', 'East Timor'],
  ['TG', 'TGO', 'Togo'],
  ['TK', 'TKL', 'Tokelau'],
  ['TO', 'TON', 'Tonga'],
  ['TT', 'TTO', 'Trinidad and Tobago'],
  ['TN', 'TUN', 'Tunisia'],
  ['TR', 'TUR', 'Türkiye', 'Turkey'],
  ['TM', 'TKM', 'Turkmenistan'],
  ['TC', 'TCA', 'Turks and Caicos Islands'],
  ['TV', 'TUV', 'Tuvalu'],
  ['UG', 'UGA', 'Uganda'],
  ['UA', 'UKR', 'Ukraine'],
  ['AE', 'ARE', 'United Arab Emirates', 'UAE', 'Emirates'],
  ['GB', 'GBR', 'United Kingdom', 'UK', 'Great Britain', 'Britain', 'United Kingdom of Great Britain and Northern Ireland'],
  ['US', 'USA', 'United States', 'United States of America'],
  ['UM', 'UMI', 'United States Minor Outlying Islands'],
  ['UY', 'URY', 'Uruguay'],
  ['UZ', 'UZB', 'Uzbekistan'],
  ['VU', 'VUT', 'Vanuatu'],
  ['VE', 'VEN', 'Venezuela'],
  ['VN', 'VNM', 'Vietnam', 'Viet Nam'],
  ['VG', 'VGB', 'British Virgin Islands'],
  ['VI', 'VIR', 'United States Virgin Islands', 'US Virgin Islands'],
  ['WF', 'WLF', 'Wallis and Futuna'],
  ['EH', 'ESH', 'Western Sahara'],
  ['YE', 'YEM', 'Yemen'],
  ['ZM', 'ZMB', 'Zambia'],
  ['ZW', 'ZWE', 'Zimbabwe'],
]

/** Every place Grid knows, in the order of the list above: by name. */
export const COUNTRIES: readonly Country[] = LIST.map(([code, code3, name, ...aliases]) => ({ code, code3, name, aliases }))

/**
 * A place's name or code as Grid compares it: accents and case set aside, `&` read as "and", dots
 * dropped (U.S.A.), "St" read as "Saint", apostrophes dropped, dashes, commas and brackets read
 * as spaces, and a leading "the" set aside.
 */
export function placeKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.'’`]/g, '')
    .replace(/[\s,()\-–—_/]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\bst\b/g, 'saint')
}

const BY_KEY: ReadonlyMap<string, Country> = (() => {
  const map = new Map<string, Country>()
  for (const country of COUNTRIES) {
    for (const text of [country.code, country.code3, country.name, ...country.aliases]) map.set(placeKey(text), country)
  }
  return map
})()

const BY_CODE: ReadonlyMap<string, Country> = new Map(COUNTRIES.map((c) => [c.code, c] as const))

/**
 * The place a name or a code names, or null: `US`, `usa`, ` United States ` and `U.S.A.` are the
 * United States; `the moon`, a sentence, or text longer than `PLACE_TEXT_MAX` is no place.
 */
export function countryOf(text: string): Country | null {
  if (typeof text !== 'string' || text.length > PLACE_TEXT_MAX) return null
  return BY_KEY.get(placeKey(text)) ?? null
}

/** Grid's name for a place, by its two-letter code: `United States` for `US`. Never the text given: a code Grid does not list is named as such. */
export function countryName(code: string): string {
  return BY_CODE.get(code)?.name ?? 'a place Grid does not list'
}

/** The places English names with "the" in a sentence: the United States, the Netherlands, the Cook Islands. */
const WITH_THE: ReadonlySet<string> = new Set([
  'BS', 'GM', 'NL', 'PH', 'MV', 'KM', 'SC', 'IM', 'CF', 'DO', 'CG', 'CD', 'AE', 'GB', 'US', 'IO', 'TF',
])
const THE_NAME = /(Islands|Territory|Territories)$/

/** Grid's name for a place as a sentence writes it: `the United States`, `Spain`. */
export function countryInText(code: string): string {
  const name = countryName(code)
  return BY_CODE.has(code) && (WITH_THE.has(code) || THE_NAME.test(name)) ? `the ${name}` : name
}

/** What is wrong with a place's text, or null: never quotes the text (MSG-9). */
export function placeProblem(text: string): string | null {
  if (text.length > PLACE_TEXT_MAX) return `is ${text.length.toLocaleString('en-US')} characters long; a place may have at most ${PLACE_TEXT_MAX}`
  if (countryOf(text) === null) return "names no place Grid knows: write a country's name or its two- or three-letter code (ISO 3166-1), such as US or Spain"
  return null
}
