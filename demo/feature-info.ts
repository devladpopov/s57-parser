/**
 * What a chart object is, in words: the S-57 class and its useful attributes,
 * in Russian or English, for the plotter's tap-on-object popup.
 */
import { S57_ATTRIBUTES } from '../packages/s57/src/attributes.js';
import { OBJL_NAMES } from '../packages/s52-render/src/lookup.js';

/**
 * S-57 object classes by OBJL code, 1-159 (IHO S-57 Appendix A, Chapter 1).
 * The renderer's OBJL table holds only the classes it draws; this one is full.
 */
const CLASSES = (
  'ADMARE AIRARE ACHBRT ACHARE BCNCAR BCNISD BCNLAT BCNSAW BCNSPP BERTHS BRIDGE BUISGL BUAARE BOYCAR BOYINB ' +
  'BOYISD BOYLAT BOYSAW BOYSPP CBLARE CBLOHD CBLSUB CANALS CANBNK CTSARE CAUSWY CTNARE CHKPNT CGUSTA COALNE ' +
  'CONZNE COSARE CTRPNT CONVYR CRANES CURENT CUSZNE DAMCON DAYMAR DWRTCL DWRTPT DEPARE DEPCNT DISMAR DOCARE ' +
  'DRGARE DRYDOC DMPGRD DYKCON EXEZNE FAIRWY FNCLNE FERYRT FSHZNE FSHFAC FSHGRD FLODOC FOGSIG FORSTC FRPARE ' +
  'GATCON GRIDRN HRBARE HRBFAC HULKES ICEARE ICNARE ISTZNE LAKARE LAKSHR LNDARE LNDELV LNDRGN LNDMRK LIGHTS ' +
  'LITFLT LITVES LOCMAG LOKBSN LOGPON MAGVAR MARCUL MIPARE MORFAC NAVLNE OBSTRN OFSPLF OSPARE OILBAR PILPNT ' +
  'PILBOP PIPARE PIPOHD PIPSOL PONTON PRCARE PRDARE PYLONS RADLNE RADRNG RADRFL RADSTA RTPBCN RDOCAL RDOSTA ' +
  'RAILWY RAPIDS RCRTCL RECTRC RCTLPT RSCSTA RESARE RETRFL RIVERS RIVBNK ROADWY RUNWAY SNDWAV SEAARE SPLARE ' +
  'SBDARE SLCONS SISTAT SISTAW SILTNK SLOTOP SLOGRD SMCFAC SOUNDG SPRING SQUARE STSLNE SUBTLN SWPARE TESARE ' +
  'TS_PRH TS_PNH TS_PAD TS_TIS T_HMON T_NHMN T_TIMS TIDEWY TOPMAR TSELNE TSSBND TSSCRS TSSLPT TSSRON TSEZNE ' +
  'TUNNEL TWRTPT UWTROC UNSARE VEGATN WATTUR WATFAL WEDKLP WRECKS'
).split(' ');

/** Class acronym of an OBJL code. */
export const classAcronym = (objl: number) => CLASSES[objl - 1] ?? `OBJL ${objl}`;

/** Object classes in Russian, as named in Russian chart legends. */
const CLASS_RU: Record<string, string> = {
  ACHARE: 'Якорная стоянка', ACHBRT: 'Якорное место', ADMARE: 'Административный район',
  BCNCAR: 'Знак кардинальный', BCNISD: 'Знак отдельной опасности', BCNLAT: 'Знак латеральный',
  BCNSAW: 'Знак осевой', BCNSPP: 'Знак специальный', BERTHS: 'Причал', BRIDGE: 'Мост',
  BUAARE: 'Населённый пункт', BUISGL: 'Здание', BOYCAR: 'Буй кардинальный', BOYINB: 'Буй рейдовый',
  BOYISD: 'Буй отдельной опасности', BOYLAT: 'Буй латеральный', BOYSAW: 'Буй осевой',
  BOYSPP: 'Буй специальный', CBLARE: 'Район кабелей', CBLOHD: 'Воздушный кабель (ЛЭП)',
  CBLSUB: 'Подводный кабель', CANALS: 'Канал', CAUSWY: 'Дамба', COALNE: 'Береговая линия',
  CTNARE: 'Район осторожного плавания', DAMCON: 'Плотина', DAYMAR: 'Дневной знак',
  DEPARE: 'Район глубин', DEPCNT: 'Изобата', DOCARE: 'Док', DRGARE: 'Драгированный район',
  DRYDOC: 'Сухой док', DMPGRD: 'Район свалки грунта', DWRTCL: 'Ось глубоководного пути',
  FAIRWY: 'Фарватер', FERYRT: 'Паромная линия', FLODOC: 'Плавучий док', FOGSIG: 'Туманный сигнал',
  FSHFAC: 'Рыболовное сооружение', FSHZNE: 'Рыболовная зона', GATCON: 'Шлюзовые ворота',
  HRBARE: 'Акватория порта', HRBFAC: 'Портовое сооружение', HULKES: 'Блокшив', LAKARE: 'Озеро',
  LIGHTS: 'Огонь', LNDARE: 'Суша', LNDMRK: 'Ориентир', LNDRGN: 'Местность', LOCMAG: 'Магнитная аномалия',
  LOKBSN: 'Шлюзовая камера', MAGVAR: 'Магнитное склонение', MARCUL: 'Марикультура',
  MIPARE: 'Военный полигон', MORFAC: 'Швартовное устройство', NAVLNE: 'Навигационная линия',
  OBSTRN: 'Препятствие', OFSPLF: 'Морская платформа', OSPARE: 'Район добычи', PILBOP: 'Место приёма лоцмана',
  PILPNT: 'Свая', PIPARE: 'Район трубопроводов', PIPOHD: 'Надземный трубопровод', PIPSOL: 'Трубопровод',
  PONTON: 'Понтон', PRCARE: 'Район предосторожности', PYLONS: 'Опора', RADSTA: 'Радиолокационная станция',
  RCRTCL: 'Рекомендованный путь', RCTLPT: 'Рекомендованное направление', RDOSTA: 'Радиостанция',
  RECTRC: 'Рекомендованный курс', RESARE: 'Район ограничений', RETRFL: 'Отражатель', RIVERS: 'Река',
  ROADWY: 'Дорога', RTPBCN: 'Радиолокационный маяк-ответчик', RUNWAY: 'ВПП', SBDARE: 'Грунт',
  SEAARE: 'Морской район', SILTNK: 'Резервуар', SISTAT: 'Сигнальная станция', SLCONS: 'Береговое сооружение',
  SLOTOP: 'Склон', SMCFAC: 'Сервис для маломерных судов', SOUNDG: 'Глубина', SPLARE: 'Гидроаэродром',
  TOPMAR: 'Топовая фигура', TSELNE: 'Разделительная линия', TSEZNE: 'Разделительная зона',
  TSSBND: 'Граница СРД', TSSLPT: 'Полоса движения (СРД)', TUNNEL: 'Тоннель', TWRTPT: 'Двусторонний путь',
  UWTROC: 'Подводная скала', VEGATN: 'Растительность', WATTUR: 'Сулой', WEDKLP: 'Водоросли',
  WRECKS: 'Затонувшее судно', CONVYR: 'Конвейер', CRANES: 'Кран', GRIDRN: 'Слип',
  ICEARE: 'Ледовый район', SNDWAV: 'Песчаные волны', SPRING: 'Источник', TIDEWY: 'Приливное течение',
  UNSARE: 'Необследованный район', CURENT: 'Течение', EXEZNE: 'Исключительная экономическая зона',
  TERMNL: 'Терминал', SUBTLN: 'Подводный туннель', LITFLT: 'Плавучий маяк', LITVES: 'Плавмаяк',
  FNCLNE: 'Ограждение', ISTZNE: 'Зона прибрежного плавания',
  CHKPNT: 'Контрольный пункт', CGUSTA: 'Пост береговой охраны', RSCSTA: 'Спасательная станция',
  HRBBSN: 'Ковш', PRDARE: 'Производственная зона', CONZNE: 'Прилежащая зона', TESARE: 'Территориальное море',
  STSLNE: 'Прямая исходная линия', COSARE: 'Континентальный шельф', ARCSLN: 'Архипелажная линия',
};

/** Attributes worth showing, in display order, with Russian names. */
const ATTR_RU: [acronym: string, ru: string][] = [
  ['OBJNAM', 'Название'], ['NOBJNM', 'Название (нац.)'],
  ['DRVAL1', 'Глубина от, м'], ['DRVAL2', 'Глубина до, м'], ['VALSOU', 'Глубина, м'], ['VALDCO', 'Изобата, м'],
  ['WATLEV', 'Уровень воды'], ['CATWRK', 'Тип'], ['CATOBS', 'Тип'], ['CATLAM', 'Сторона'], ['CATCAM', 'Сторона света'],
  ['CATREA', 'Ограничение'], ['RESTRN', 'Запрет'], ['CATLMK', 'Тип'], ['CATLIT', 'Тип огня'],
  ['BOYSHP', 'Форма'], ['BCNSHP', 'Форма'], ['COLOUR', 'Цвет'], ['COLPAT', 'Расцветка'],
  ['LITCHR', 'Характер огня'], ['SIGGRP', 'Группа'], ['SIGPER', 'Период, с'], ['VALNMR', 'Дальность, миль'],
  ['HEIGHT', 'Высота, м'], ['VERCLR', 'Подмостовой габарит, м'], ['VERCCL', 'Габарит закрытого, м'],
  ['VERCOP', 'Габарит открытого, м'], ['HORCLR', 'Ширина пролёта, м'], ['CATBRG', 'Тип моста'],
  ['NATSUR', 'Грунт'], ['VALMAG', 'Склонение, °'], ['RYRMGV', 'На год'], ['ORIENT', 'Направление, °'], ['SECTR1', 'Сектор от, °'], ['SECTR2', 'Сектор до, °'],
  ['INFORM', 'Примечание'], ['NINFOM', 'Примечание (нац.)'], ['DATSTA', 'Действует с'], ['DATEND', 'Действует до'],
];

const ENUMS: Record<string, Record<string, [en: string, ru: string]>> = {
  COLOUR: {
    1: ['white', 'белый'], 2: ['black', 'чёрный'], 3: ['red', 'красный'], 4: ['green', 'зелёный'], 5: ['blue', 'синий'],
    6: ['yellow', 'жёлтый'], 7: ['grey', 'серый'], 8: ['brown', 'коричневый'], 9: ['amber', 'янтарный'],
    10: ['violet', 'фиолетовый'], 11: ['orange', 'оранжевый'], 12: ['magenta', 'пурпурный'], 13: ['pink', 'розовый'],
  },
  WATLEV: {
    1: ['partly submerged at high water', 'частично под водой в полную воду'], 2: ['always dry', 'всегда над водой'],
    3: ['always under water', 'всегда под водой'], 4: ['covers and uncovers', 'осыхает'], 5: ['awash', 'на уровне воды'],
    6: ['subject to flooding', 'затапливается'], 7: ['floating', 'плавучий'],
  },
  CATLAM: {
    1: ['port', 'левая'], 2: ['starboard', 'правая'], 3: ['preferred channel to starboard', 'основной проход справа'],
    4: ['preferred channel to port', 'основной проход слева'],
  },
  CATCAM: { 1: ['north', 'северный'], 2: ['east', 'восточный'], 3: ['south', 'южный'], 4: ['west', 'западный'] },
  CATWRK: {
    1: ['non-dangerous wreck', 'неопасное'], 2: ['dangerous wreck', 'опасное'], 3: ['distributed remains', 'обломки'],
    4: ['mast showing', 'видны мачты'], 5: ['hull showing', 'виден корпус'],
  },
  BOYSHP: {
    1: ['conical', 'конический'], 2: ['can', 'цилиндрический'], 3: ['spherical', 'шаровой'], 4: ['pillar', 'столбовой'],
    5: ['spar', 'вешка'], 6: ['barrel', 'бочка'], 7: ['super-buoy', 'большой буй'], 8: ['ice buoy', 'ледовый'],
  },
  LITCHR: {
    1: ['F', 'Пст'], 2: ['Fl', 'Пр'], 3: ['LFl', 'ДлПр'], 4: ['Q', 'Ч'], 5: ['VQ', 'ОЧ'], 6: ['UQ', 'УЧ'],
    7: ['Iso', 'Изо'], 8: ['Oc', 'Зтм'], 9: ['IQ', 'ПрЧ'], 10: ['IVQ', 'ПрОЧ'], 11: ['IUQ', 'ПрУЧ'],
    12: ['Mo', 'Мо'], 13: ['FFl', 'ПстПр'], 25: ['Q+LFl', 'Ч+ДлПр'], 26: ['VQ+LFl', 'ОЧ+ДлПр'], 28: ['Al', 'Пер'],
  },
  RESTRN: {
    1: ['anchoring prohibited', 'якорная стоянка запрещена'], 2: ['anchoring restricted', 'якорная стоянка ограничена'],
    3: ['fishing prohibited', 'рыболовство запрещено'], 4: ['fishing restricted', 'рыболовство ограничено'],
    5: ['trawling prohibited', 'траление запрещено'], 6: ['trawling restricted', 'траление ограничено'],
    7: ['entry prohibited', 'вход запрещён'], 8: ['entry restricted', 'вход ограничен'],
    9: ['dredging prohibited', 'дноуглубление запрещено'], 10: ['dredging restricted', 'дноуглубление ограничено'],
    11: ['diving prohibited', 'погружения запрещены'], 12: ['diving restricted', 'погружения ограничены'],
    13: ['no wake', 'не создавать волну'], 14: ['area to be avoided', 'район, которого следует избегать'],
    15: ['construction prohibited', 'строительство запрещено'], 16: ['discharging prohibited', 'сброс запрещён'],
    17: ['discharging restricted', 'сброс ограничен'], 20: ['drilling prohibited', 'бурение запрещено'],
    24: ['dragging prohibited', 'волочение запрещено'], 25: ['stopping prohibited', 'остановка запрещена'],
    26: ['landing prohibited', 'высадка запрещена'], 27: ['speed restricted', 'ограничение скорости'],
  },
  NATSUR: {
    1: ['mud', 'ил'], 2: ['clay', 'глина'], 3: ['silt', 'тонкий ил'], 4: ['sand', 'песок'], 5: ['stone', 'камень'],
    6: ['gravel', 'гравий'], 7: ['pebbles', 'галька'], 8: ['cobbles', 'булыжник'], 9: ['rock', 'скала'],
    11: ['lava', 'лава'], 14: ['coral', 'коралл'], 17: ['shells', 'ракушка'], 18: ['boulder', 'валун'],
  },
};

const ATTL_BY_ACR = new Map([...S57_ATTRIBUTES.values()].map(d => [d.acronym, d]));

export interface FeatureInfo {
  /** S-57 class acronym, e.g. BOYLAT. */
  acronym: string;
  title: string;
  rows: [label: string, value: string][];
}

/** Meta and collection objects (M_COVR, C_AGGR...) say nothing to a skipper. */
export const isMeta = (objl: number) => objl >= 300 && objl < 400;

/**
 * Describe a feature from its GeoJSON properties (OBJL and ATTL_<code> keys,
 * as toGeoJSON writes them). Enumerated values are spelled out; lists
 * ("1,3") are decoded item by item.
 */
export function describeFeature(props: Record<string, unknown>, ru: boolean): FeatureInfo {
  const objl = Number(props.OBJL);
  const acronym = classAcronym(objl);
  const title = (ru && CLASS_RU[acronym]) || OBJL_NAMES[objl] || acronym;
  const rows: [string, string][] = [];
  for (const [acr, labelRu] of ATTR_RU) {
    const def = ATTL_BY_ACR.get(acr);
    if (!def) continue;
    const raw = props[`ATTL_${def.code}`];
    if (raw === undefined || raw === null || raw === '') continue;
    const enumMap = ENUMS[acr];
    const value = enumMap
      ? String(raw).split(',').map(v => enumMap[v.trim()]?.[ru ? 1 : 0] ?? v.trim()).join(', ')
      : String(raw);
    rows.push([ru ? labelRu : def.name, value]);
  }
  return { acronym, title, rows };
}

/** Degrees and decimal minutes, e.g. 59°56.316′ N 030°18.846′ E (С/В in Russian). */
export function formatLatLon(lat: number, lon: number, ru: boolean): string {
  const part = (v: number, pos: string, neg: string, w: number) => {
    const a = Math.abs(v);
    let d = Math.floor(a), m = (a - d) * 60;
    if (m >= 59.9995) { d++; m = 0; }
    return `${String(d).padStart(w, '0')}°${m.toFixed(3).padStart(6, '0')}′ ${v < 0 ? neg : pos}`;
  };
  return `${part(lat, ru ? 'С' : 'N', ru ? 'Ю' : 'S', 2)} ${part(lon, ru ? 'В' : 'E', ru ? 'З' : 'W', 3)}`;
}

/**
 * Position typed by a person: decimal degrees ("59.9386, 30.3141"), degrees
 * and minutes ("59 56.3 N 30 18.8 E", "59°56.316′С 30°18.846′В") or degrees,
 * minutes and seconds. Hemisphere letters may be Latin or Cyrillic (С Ю В З)
 * and come before or after the number. Null if it does not read as a position.
 */
export function parseLatLon(text: string): { lat: number; lon: number } | null {
  const s = text.toUpperCase().replace(/,(?=\d)/g, '.').replace(/[°′'″"’”]/g, ' ');
  // Minutes follow whole degrees and seconds whole minutes, so "59.93 30.31"
  // reads as two decimal-degree numbers, not degrees and minutes.
  const parts = [...s.matchAll(/([NSEWСЮВЗ])?\s*(-?\d+\.\d+|-?\d+(?:\s+\d+\.\d+|\s+\d+(?:\s+\d+(?:\.\d+)?)?)?)\s*([NSEWСЮВЗ])?/g)];
  if (parts.length !== 2) return null;
  const vals = parts.map(m => {
    const nums = m[2].split(/\s+/).map(Number);
    if (nums.slice(1).some(n => n >= 60)) return null;
    const sign = nums[0] < 0 ? -1 : 1;
    let v = Math.abs(nums[0]) + (nums[1] ?? 0) / 60 + (nums[2] ?? 0) / 3600;
    const hemi = m[1] ?? m[3];
    if (hemi && 'SWЮЗ'.includes(hemi)) v = -v;
    return { v: v * sign, hemi };
  });
  if (vals.some(v => v === null)) return null;
  let [a, b] = vals as { v: number; hemi?: string }[];
  // Longitude first when the letters say so ("30 18.8 E 59 56.3 N").
  if (a.hemi && 'EWВЗ'.includes(a.hemi)) [a, b] = [b, a];
  if (Math.abs(a.v) > 90 || Math.abs(b.v) > 180) return null;
  return { lat: a.v, lon: b.v };
}
