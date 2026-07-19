/** Birth-city → longitude (°E, west negative), IANA zone, and standard UTC offset.
 *
 *  Selecting a city sets all three: the **zone** (so the offset actually in force
 *  on the birth date — summer time, wartime clocks, historical zone moves — is
 *  resolved from the IANA database rather than guessed), the **longitude** (so
 *  true-solar time can place the hour pillar), and `tz` as a **fallback only**,
 *  for the rare environment without full ICU data.
 *
 *  `tz` is STANDARD time and is deliberately not the primary source: using it for
 *  a summer birth shifts the clock an hour and can move the birth into the
 *  neighbouring double-hour, silently changing the hour pillar. See
 *  engine/timezone.ts. */
export interface City {
  name: string;
  region: string;
  lon: number;
  /** Standard-time offset in minutes east of UTC. Fallback only — see above. */
  tz: number;
  /** IANA zone id, the authority for the offset actually in force at birth. */
  zone: string;
}

export const CITIES: City[] = [
  // China
  { name: "Beijing", region: "China", lon: 116.41, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Shanghai", region: "China", lon: 121.47, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Guangzhou", region: "China", lon: 113.26, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Shenzhen", region: "China", lon: 114.06, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Chengdu", region: "China", lon: 104.07, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Chongqing", region: "China", lon: 106.55, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Wuhan", region: "China", lon: 114.3, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Xi'an", region: "China", lon: 108.94, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Hangzhou", region: "China", lon: 120.16, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Nanjing", region: "China", lon: 118.8, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Tianjin", region: "China", lon: 117.2, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Suzhou", region: "China", lon: 120.58, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Harbin", region: "China", lon: 126.53, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Shenyang", region: "China", lon: 123.43, tz: 480 , zone: "Asia/Shanghai" },
  // Xinjiang keeps OFFICIAL Beijing time (UTC+8) even though IANA's Asia/Urumqi
  // is UTC+6 "local time". A recorded birth time almost always comes from an
  // official clock, so Asia/Shanghai is the right lens for reading it — and the
  // real solar position is handled by the longitude below, which is the point of
  // the true-solar correction. Someone whose record used local time can override
  // the offset manually.
  { name: "Ürümqi", region: "China", lon: 87.62, tz: 480, zone: "Asia/Shanghai" },
  { name: "Kunming", region: "China", lon: 102.83, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Changsha", region: "China", lon: 112.94, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Zhengzhou", region: "China", lon: 113.63, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Qingdao", region: "China", lon: 120.38, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Xiamen", region: "China", lon: 118.09, tz: 480 , zone: "Asia/Shanghai" },
  { name: "Ningbo", region: "China", lon: 121.55, tz: 480 , zone: "Asia/Shanghai" },
  // Greater China
  { name: "Hong Kong", region: "Greater China", lon: 114.17, tz: 480 , zone: "Asia/Hong_Kong" },
  { name: "Macau", region: "Greater China", lon: 113.54, tz: 480 , zone: "Asia/Macau" },
  { name: "Taipei", region: "Greater China", lon: 121.56, tz: 480 , zone: "Asia/Taipei" },
  { name: "Kaohsiung", region: "Greater China", lon: 120.31, tz: 480 , zone: "Asia/Taipei" },
  { name: "Taichung", region: "Greater China", lon: 120.68, tz: 480 , zone: "Asia/Taipei" },
  // East & Southeast Asia
  { name: "Tokyo", region: "East & SE Asia", lon: 139.69, tz: 540 , zone: "Asia/Tokyo" },
  { name: "Osaka", region: "East & SE Asia", lon: 135.5, tz: 540 , zone: "Asia/Tokyo" },
  { name: "Nagoya", region: "East & SE Asia", lon: 136.91, tz: 540 , zone: "Asia/Tokyo" },
  { name: "Seoul", region: "East & SE Asia", lon: 126.98, tz: 540 , zone: "Asia/Seoul" },
  { name: "Busan", region: "East & SE Asia", lon: 129.08, tz: 540 , zone: "Asia/Seoul" },
  { name: "Singapore", region: "East & SE Asia", lon: 103.82, tz: 480 , zone: "Asia/Singapore" },
  { name: "Kuala Lumpur", region: "East & SE Asia", lon: 101.69, tz: 480 , zone: "Asia/Kuala_Lumpur" },
  { name: "Bangkok", region: "East & SE Asia", lon: 100.5, tz: 420 , zone: "Asia/Bangkok" },
  { name: "Jakarta", region: "East & SE Asia", lon: 106.85, tz: 420 , zone: "Asia/Jakarta" },
  { name: "Manila", region: "East & SE Asia", lon: 120.98, tz: 480 , zone: "Asia/Manila" },
  { name: "Ho Chi Minh City", region: "East & SE Asia", lon: 106.63, tz: 420 , zone: "Asia/Ho_Chi_Minh" },
  { name: "Hanoi", region: "East & SE Asia", lon: 105.83, tz: 420 , zone: "Asia/Ho_Chi_Minh" },
  { name: "Phnom Penh", region: "East & SE Asia", lon: 104.92, tz: 420 , zone: "Asia/Phnom_Penh" },
  { name: "Yangon", region: "East & SE Asia", lon: 96.2, tz: 390 , zone: "Asia/Yangon" },
  // South Asia & Middle East
  { name: "Mumbai", region: "South Asia & Middle East", lon: 72.88, tz: 330 , zone: "Asia/Kolkata" },
  { name: "Delhi", region: "South Asia & Middle East", lon: 77.21, tz: 330 , zone: "Asia/Kolkata" },
  { name: "Bengaluru", region: "South Asia & Middle East", lon: 77.59, tz: 330 , zone: "Asia/Kolkata" },
  { name: "Kolkata", region: "South Asia & Middle East", lon: 88.36, tz: 330 , zone: "Asia/Kolkata" },
  { name: "Karachi", region: "South Asia & Middle East", lon: 67.01, tz: 300 , zone: "Asia/Karachi" },
  { name: "Dhaka", region: "South Asia & Middle East", lon: 90.41, tz: 360 , zone: "Asia/Dhaka" },
  { name: "Dubai", region: "South Asia & Middle East", lon: 55.27, tz: 240 , zone: "Asia/Dubai" },
  // Europe
  { name: "London", region: "Europe", lon: -0.13, tz: 0 , zone: "Europe/London" },
  { name: "Paris", region: "Europe", lon: 2.35, tz: 60 , zone: "Europe/Paris" },
  { name: "Berlin", region: "Europe", lon: 13.4, tz: 60 , zone: "Europe/Berlin" },
  { name: "Madrid", region: "Europe", lon: -3.7, tz: 60 , zone: "Europe/Madrid" },
  { name: "Rome", region: "Europe", lon: 12.5, tz: 60 , zone: "Europe/Rome" },
  { name: "Amsterdam", region: "Europe", lon: 4.9, tz: 60 , zone: "Europe/Amsterdam" },
  { name: "Istanbul", region: "Europe", lon: 28.98, tz: 180 , zone: "Europe/Istanbul" },
  { name: "Moscow", region: "Europe", lon: 37.62, tz: 180 , zone: "Europe/Moscow" },
  // Americas
  { name: "New York", region: "Americas", lon: -74.01, tz: -300 , zone: "America/New_York" },
  { name: "Chicago", region: "Americas", lon: -87.63, tz: -360 , zone: "America/Chicago" },
  { name: "Los Angeles", region: "Americas", lon: -118.24, tz: -480 , zone: "America/Los_Angeles" },
  { name: "San Francisco", region: "Americas", lon: -122.42, tz: -480 , zone: "America/Los_Angeles" },
  { name: "Toronto", region: "Americas", lon: -79.38, tz: -300 , zone: "America/Toronto" },
  { name: "Vancouver", region: "Americas", lon: -123.12, tz: -480 , zone: "America/Vancouver" },
  { name: "Mexico City", region: "Americas", lon: -99.13, tz: -360 , zone: "America/Mexico_City" },
  { name: "São Paulo", region: "Americas", lon: -46.63, tz: -180 , zone: "America/Sao_Paulo" },
  // Oceania
  { name: "Sydney", region: "Oceania", lon: 151.21, tz: 600 , zone: "Australia/Sydney" },
  { name: "Melbourne", region: "Oceania", lon: 144.96, tz: 600 , zone: "Australia/Melbourne" },
  { name: "Perth", region: "Oceania", lon: 115.86, tz: 480 , zone: "Australia/Perth" },
  { name: "Auckland", region: "Oceania", lon: 174.76, tz: 720 , zone: "Pacific/Auckland" },
];

/** Regions in display order, for grouped <optgroup>s. */
export const CITY_REGIONS = [
  "China",
  "Greater China",
  "East & SE Asia",
  "South Asia & Middle East",
  "Europe",
  "Americas",
  "Oceania",
];

export function cityByName(name: string): City | undefined {
  return CITIES.find((c) => c.name === name);
}

/** Every city's zone must be one the runtime can actually resolve; a typo would
 *  silently fall back to standard time and reintroduce the DST error. Asserted
 *  in tests/timezone.test.ts. */
export const CITY_ZONES = [...new Set(CITIES.map((c) => c.zone))];
