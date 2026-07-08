/**
 * Minimal typed surface of lunar-javascript@1.7.7 (the package ships no types).
 * Only the methods this verifier consumes are declared; semantics were pinned
 * by probing the installed package (see docs/VERIFICATION.md):
 *  - all returned strings are SIMPLIFIED Chinese (惊蛰, 满/执/开/闭, 青龙…);
 *  - Solar.fromYmdHms interprets its arguments as China Standard Time (UTC+8)
 *    wall-clock and is host-timezone-independent;
 *  - getYearInGanZhiExact()/getMonthInGanZhiExact() switch at the exact solar
 *    term instant (the BaZi convention); the non-Exact variants do NOT;
 *  - getTimeInGanZhi() always rolls the hour stem to the next day at 23:00.
 */
declare module "lunar-javascript" {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    getLunar(): Lunar;
    toYmd(): string;
    toYmdHms(): string;
  }

  export class Lunar {
    getYearInGanZhi(): string;
    getYearInGanZhiByLiChun(): string;
    getYearInGanZhiExact(): string;
    getMonthInGanZhi(): string;
    getMonthInGanZhiExact(): string;
    getDayInGanZhi(): string;
    getDayInGanZhiExact(): string;
    getDayInGanZhiExact2(): string;
    getTimeInGanZhi(): string;
    /** 建除十二神 (值星), simplified: 建除满平定执破危成收开闭. */
    getZhiXing(): string;
    /** 黄黑道 day god, simplified: 青龙/明堂/天刑/朱雀/金匮/天德/白虎/玉堂/天牢/玄武/司命/勾陈. */
    getDayTianShen(): string;
    /** "黄道" | "黑道". */
    getDayTianShenType(): string;
    getDayTianShenLuck(): string;
    /** Opposing (冲) branch of the day, single hanzi e.g. "丑". */
    getDayChong(): string;
    getDayChongDesc(): string;
    getDayChongShengXiao(): string;
    getDayYi(): string[];
    getDayJi(): string[];
    getJieQiTable(): Record<string, Solar>;
    getEightChar(): EightChar;
  }

  export class EightChar {
    /** 1 = late 子时 rolls the day pillar at 23:00; 2 (default) keeps the civil day. */
    setSect(sect: number): void;
    getSect(): number;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
  }
}
