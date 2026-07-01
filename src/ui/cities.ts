/** Birth-city → longitude (°E, west negative) + standard UTC offset (minutes).
 *  Selecting a city sets BOTH: the timezone (so the whole chart is right) and the
 *  longitude (so true-solar time can place the hour pillar the way online BaZi
 *  tools do). Offsets are STANDARD time — for a summer birth in a DST region,
 *  nudge the timezone field. China/HK/Taiwan/Japan/Korea/SG don't use DST. */
export interface City {
  name: string;
  region: string;
  lon: number;
  tz: number;
}

export const CITIES: City[] = [
  // China
  { name: "Beijing", region: "China", lon: 116.41, tz: 480 },
  { name: "Shanghai", region: "China", lon: 121.47, tz: 480 },
  { name: "Guangzhou", region: "China", lon: 113.26, tz: 480 },
  { name: "Shenzhen", region: "China", lon: 114.06, tz: 480 },
  { name: "Chengdu", region: "China", lon: 104.07, tz: 480 },
  { name: "Chongqing", region: "China", lon: 106.55, tz: 480 },
  { name: "Wuhan", region: "China", lon: 114.3, tz: 480 },
  { name: "Xi'an", region: "China", lon: 108.94, tz: 480 },
  { name: "Hangzhou", region: "China", lon: 120.16, tz: 480 },
  { name: "Nanjing", region: "China", lon: 118.8, tz: 480 },
  { name: "Tianjin", region: "China", lon: 117.2, tz: 480 },
  { name: "Suzhou", region: "China", lon: 120.58, tz: 480 },
  { name: "Harbin", region: "China", lon: 126.53, tz: 480 },
  { name: "Shenyang", region: "China", lon: 123.43, tz: 480 },
  { name: "Ürümqi", region: "China", lon: 87.62, tz: 480 },
  { name: "Kunming", region: "China", lon: 102.83, tz: 480 },
  { name: "Changsha", region: "China", lon: 112.94, tz: 480 },
  { name: "Zhengzhou", region: "China", lon: 113.63, tz: 480 },
  { name: "Qingdao", region: "China", lon: 120.38, tz: 480 },
  { name: "Xiamen", region: "China", lon: 118.09, tz: 480 },
  { name: "Ningbo", region: "China", lon: 121.55, tz: 480 },
  // Greater China
  { name: "Hong Kong", region: "Greater China", lon: 114.17, tz: 480 },
  { name: "Macau", region: "Greater China", lon: 113.54, tz: 480 },
  { name: "Taipei", region: "Greater China", lon: 121.56, tz: 480 },
  { name: "Kaohsiung", region: "Greater China", lon: 120.31, tz: 480 },
  { name: "Taichung", region: "Greater China", lon: 120.68, tz: 480 },
  // East & Southeast Asia
  { name: "Tokyo", region: "East & SE Asia", lon: 139.69, tz: 540 },
  { name: "Osaka", region: "East & SE Asia", lon: 135.5, tz: 540 },
  { name: "Nagoya", region: "East & SE Asia", lon: 136.91, tz: 540 },
  { name: "Seoul", region: "East & SE Asia", lon: 126.98, tz: 540 },
  { name: "Busan", region: "East & SE Asia", lon: 129.08, tz: 540 },
  { name: "Singapore", region: "East & SE Asia", lon: 103.82, tz: 480 },
  { name: "Kuala Lumpur", region: "East & SE Asia", lon: 101.69, tz: 480 },
  { name: "Bangkok", region: "East & SE Asia", lon: 100.5, tz: 420 },
  { name: "Jakarta", region: "East & SE Asia", lon: 106.85, tz: 420 },
  { name: "Manila", region: "East & SE Asia", lon: 120.98, tz: 480 },
  { name: "Ho Chi Minh City", region: "East & SE Asia", lon: 106.63, tz: 420 },
  { name: "Hanoi", region: "East & SE Asia", lon: 105.83, tz: 420 },
  { name: "Phnom Penh", region: "East & SE Asia", lon: 104.92, tz: 420 },
  { name: "Yangon", region: "East & SE Asia", lon: 96.2, tz: 390 },
  // South Asia & Middle East
  { name: "Mumbai", region: "South Asia & Middle East", lon: 72.88, tz: 330 },
  { name: "Delhi", region: "South Asia & Middle East", lon: 77.21, tz: 330 },
  { name: "Bengaluru", region: "South Asia & Middle East", lon: 77.59, tz: 330 },
  { name: "Kolkata", region: "South Asia & Middle East", lon: 88.36, tz: 330 },
  { name: "Karachi", region: "South Asia & Middle East", lon: 67.01, tz: 300 },
  { name: "Dhaka", region: "South Asia & Middle East", lon: 90.41, tz: 360 },
  { name: "Dubai", region: "South Asia & Middle East", lon: 55.27, tz: 240 },
  // Europe
  { name: "London", region: "Europe", lon: -0.13, tz: 0 },
  { name: "Paris", region: "Europe", lon: 2.35, tz: 60 },
  { name: "Berlin", region: "Europe", lon: 13.4, tz: 60 },
  { name: "Madrid", region: "Europe", lon: -3.7, tz: 60 },
  { name: "Rome", region: "Europe", lon: 12.5, tz: 60 },
  { name: "Amsterdam", region: "Europe", lon: 4.9, tz: 60 },
  { name: "Istanbul", region: "Europe", lon: 28.98, tz: 180 },
  { name: "Moscow", region: "Europe", lon: 37.62, tz: 180 },
  // Americas
  { name: "New York", region: "Americas", lon: -74.01, tz: -300 },
  { name: "Chicago", region: "Americas", lon: -87.63, tz: -360 },
  { name: "Los Angeles", region: "Americas", lon: -118.24, tz: -480 },
  { name: "San Francisco", region: "Americas", lon: -122.42, tz: -480 },
  { name: "Toronto", region: "Americas", lon: -79.38, tz: -300 },
  { name: "Vancouver", region: "Americas", lon: -123.12, tz: -480 },
  { name: "Mexico City", region: "Americas", lon: -99.13, tz: -360 },
  { name: "São Paulo", region: "Americas", lon: -46.63, tz: -180 },
  // Oceania
  { name: "Sydney", region: "Oceania", lon: 151.21, tz: 600 },
  { name: "Melbourne", region: "Oceania", lon: 144.96, tz: 600 },
  { name: "Perth", region: "Oceania", lon: 115.86, tz: 480 },
  { name: "Auckland", region: "Oceania", lon: 174.76, tz: 720 },
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
