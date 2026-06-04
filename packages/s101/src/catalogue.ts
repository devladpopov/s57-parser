/**
 * S-101 Feature Catalogue.
 *
 * Maps numeric feature type codes to S-101 feature class names.
 * Based on S-101 Product Specification Edition 1.2.0.
 *
 * S-101 uses string-based feature class names internally,
 * but ISO 8211 encoding maps them to numeric codes via the catalogue.
 * The numeric codes here correspond to the feature type encoding
 * in S-101 ISO 8211 datasets.
 */

/** S-101 feature type code to name mapping */
export const S101_FEATURE_CATALOGUE: Map<number, string> = new Map([
  // Geo features (real-world objects)
  [1, 'AidsToNavigation'],
  [2, 'Anchor'],
  [3, 'AnchorageArea'],
  [4, 'AnchorBerth'],
  [5, 'Beacon'],
  [6, 'BeaconCardinal'],
  [7, 'BeaconIsolatedDanger'],
  [8, 'BeaconLateral'],
  [9, 'BeaconSafeWater'],
  [10, 'BeaconSpecialPurpose'],
  [11, 'Berth'],
  [12, 'Bridge'],
  [13, 'BuiltUpArea'],
  [14, 'Buoy'],
  [15, 'BuoyCardinal'],
  [16, 'BuoyInstallation'],
  [17, 'BuoyIsolatedDanger'],
  [18, 'BuoyLateral'],
  [19, 'BuoySafeWater'],
  [20, 'BuoySpecialPurpose'],
  [21, 'CableArea'],
  [22, 'CableOverhead'],
  [23, 'CableSubmarine'],
  [24, 'Canal'],
  [25, 'CanalBank'],
  [26, 'CautionArea'],
  [27, 'Coastline'],
  [28, 'CoastGuardStation'],
  [29, 'ContiguousZone'],
  [30, 'ContinentalShelfArea'],
  [31, 'ControlPoint'],
  [32, 'ConveyanceLine'],
  [33, 'Dam'],
  [34, 'DangerousWreck'],
  [35, 'DeepWaterRouteArea'],
  [36, 'DeepWaterRouteCentreline'],
  [37, 'DepthArea'],
  [38, 'DepthContour'],
  [39, 'DepthNoBottomFound'],
  [40, 'DesignatedAreaGeneric'],
  [41, 'DiscolouredWater'],
  [42, 'DistanceMark'],
  [43, 'DockArea'],
  [44, 'DredgedArea'],
  [45, 'DryDock'],
  [46, 'DumpingGround'],
  [47, 'DykeLevee'],
  [48, 'ExclusiveEconomicZone'],
  [49, 'Fairway'],
  [50, 'FenceWall'],
  [51, 'FerryRoute'],
  [52, 'FisheryZone'],
  [53, 'FishingFacility'],
  [54, 'FishingGround'],
  [55, 'FloatingDock'],
  [56, 'FogSignal'],
  [57, 'Fortification'],
  [58, 'FreePortArea'],
  [59, 'Gate'],
  [60, 'Gridiron'],
  [61, 'HarbourAreaAdministrative'],
  [62, 'HarbourFacility'],
  [63, 'Hulk'],
  [64, 'IceArea'],
  [65, 'InlandWaterway'],
  [66, 'InshoreTrafficZone'],
  [67, 'Island'],
  [68, 'IslandGroup'],
  [69, 'LandArea'],
  [70, 'LandElevation'],
  [71, 'LandRegion'],
  [72, 'Landmark'],
  [73, 'Light'],
  [74, 'LightAllAround'],
  [75, 'LightFloat'],
  [76, 'LightSectored'],
  [77, 'LightVessel'],
  [78, 'LocalDirectionOfBuoyage'],
  [79, 'Lock'],
  [80, 'LockBasin'],
  [81, 'LogPond'],
  [82, 'MagneticVariation'],
  [83, 'MarineFarm'],
  [84, 'MilitaryPracticeArea'],
  [85, 'MooringFacility'],
  [86, 'NavigationLine'],
  [87, 'NonDangerousWreck'],
  [88, 'Obstruction'],
  [89, 'OffshorePlatform'],
  [90, 'OffshoreProductionArea'],
  [91, 'OilBarrier'],
  [92, 'Pile'],
  [93, 'PilotBoardingPlace'],
  [94, 'PilotService'],
  [95, 'Pipeline'],
  [96, 'PipelineArea'],
  [97, 'PipelineOverhead'],
  [98, 'PipelineSubmarine'],
  [99, 'Pontoon'],
  [100, 'Port'],
  [101, 'PrecautionaryArea'],
  [102, 'ProductionStorageArea'],
  [103, 'RadarLine'],
  [104, 'RadarRange'],
  [105, 'RadarReflector'],
  [106, 'RadarStation'],
  [107, 'RadarTransponderBeacon'],
  [108, 'RadioCallingInPoint'],
  [109, 'RadioStation'],
  [110, 'Railway'],
  [111, 'RangeSystem'],
  [112, 'Rapids'],
  [113, 'RecommendedRoute'],
  [114, 'RecommendedTrack'],
  [115, 'RescueStation'],
  [116, 'RestrictedArea'],
  [117, 'RestrictedAreaNavigational'],
  [118, 'RestrictedAreaRegulatory'],
  [119, 'RetroReflector'],
  [120, 'River'],
  [121, 'Road'],
  [122, 'Runway'],
  [123, 'SandWaves'],
  [124, 'SeaArea'],
  [125, 'SeabedArea'],
  [126, 'ShorelineConstruction'],
  [127, 'Signal'],
  [128, 'Silo'],
  [129, 'SlopingGround'],
  [130, 'SlottedChannel'],
  [131, 'SmallCraftFacility'],
  [132, 'Sounding'],
  [133, 'Spring'],
  [134, 'SubmersibleObject'],
  [135, 'SweptArea'],
  [136, 'TerritorialSea'],
  [137, 'TidalStreamFloodEbb'],
  [138, 'TidalStreamPanel'],
  [139, 'TideGauge'],
  [140, 'TopMark'],
  [141, 'TrafficSeparationLine'],
  [142, 'TrafficSeparationScheme'],
  [143, 'TrafficSeparationSchemeBoundary'],
  [144, 'TrafficSeparationSchemeCrossing'],
  [145, 'TrafficSeparationSchemeRoundabout'],
  [146, 'TrafficSeparationZone'],
  [147, 'TugService'],
  [148, 'TwoWayRoutePart'],
  [149, 'UnderwaterRock'],
  [150, 'UnsurveyedArea'],
  [151, 'VegetationArea'],
  [152, 'VesselTrafficService'],
  [153, 'WaterTurbulence'],
  [154, 'Waterfall'],
  [155, 'WaterwayGauge'],
  [156, 'Weed'],
  [157, 'Wreck'],

  // Meta features
  [300, 'DataCoverage'],
  [301, 'LocalDirectionOfBuoyageMeta'],
  [302, 'NavigationalSystemOfMarks'],
  [303, 'QualityOfBathymetricData'],
  [304, 'QualityOfNonBathymetricData'],
  [305, 'QualityOfSurvey'],
  [306, 'SoundingDatum'],
  [307, 'VerticalDatumOfData'],
]);

/** Reverse map: feature name to code */
export const S101_FEATURE_BY_NAME: Map<string, number> = new Map(
  [...S101_FEATURE_CATALOGUE.entries()].map(([code, name]) => [name, code])
);

/**
 * S-101 to S-57 OBJL approximate mapping.
 * Used for rendering S-101 features with existing S-52 symbology.
 * Not all S-101 types have S-57 equivalents; unmapped types return undefined.
 */
export const S101_TO_S57_OBJL: Map<number, number> = new Map([
  [3, 3],     // AnchorageArea → ACHARE
  [4, 2],     // AnchorBerth → ACHBRT
  [6, 5],     // BeaconCardinal → BCNCAR
  [8, 8],     // BeaconLateral → BCNLAT
  [11, 11],   // Berth → BERTHS
  [12, 12],   // Bridge → BRIDGE
  [13, 14],   // BuiltUpArea → BUAARE
  [15, 15],   // BuoyCardinal → BOYCAR
  [18, 17],   // BuoyLateral → BOYLAT
  [19, 19],   // BuoySaw → BOYSAW
  [20, 20],   // BuoySpecialPurpose → BOYSPP
  [22, 21],   // CableOverhead → CBLOHD
  [23, 22],   // CableSubmarine → CBLSUB
  [24, 23],   // Canal → CANALS
  [27, 30],   // Coastline → COALNE
  [29, 31],   // ContiguousZone → CONZNE
  [37, 42],   // DepthArea → DEPARE
  [38, 43],   // DepthContour → DEPCNT
  [46, 46],   // DumpingGround → DMPGRD
  [49, 49],   // Fairway → FAIRWY
  [51, 51],   // FerryRoute → FERYRT
  [52, 54],   // FisheryZone → FSHZNE
  [56, 55],   // FogSignal → FOGSIG
  [59, 57],   // Gate → GATCON
  [69, 71],   // LandArea → LNDARE
  [70, 72],   // LandElevation → LNDELV
  [72, 77],   // Landmark → LNDMRK
  [73, 75],   // Light → LIGHTS
  [75, 76],   // LightFloat → LITFLT
  [80, 78],   // LockBasin → LOKBSN
  [82, 79],   // MagneticVariation → MAGVAR
  [83, 81],   // MarineFarm → MARCUL
  [84, 83],   // MilitaryPracticeArea → MIPARE
  [85, 84],   // MooringFacility → MORFAC
  [88, 86],   // Obstruction → OBSTRN
  [89, 87],   // OffshorePlatform → OFSPLF
  [92, 91],   // Pile → PILPNT
  [93, 90],   // PilotBoardingPlace → PILBOP
  [97, 92],   // PipelineOverhead → PIPOHD
  [98, 93],   // PipelineSubmarine → PIPSOL
  [110, 97],  // Railway → RAILWY
  [116, 112], // RestrictedArea → RESARE
  [120, 114], // River → RIVERS
  [121, 116], // Road → ROADWY
  [122, 117], // Runway → RUNWAY
  [125, 119], // SeabedArea → SBDARE
  [126, 122], // ShorelineConstruction → SLCONS
  [129, 123], // SlopingGround → SLOGRD
  [132, 129], // Sounding → SOUNDG
  [133, 131], // Spring → SPRING
  [135, 134], // SweptArea → SWPARE
  [140, 144], // TopMark → TOPMAR
  [141, 148], // TrafficSeparationLine → TSELNE
  [146, 149], // TrafficSeparationZone → TSEZNE
  [143, 150], // TSS boundary → TSSBND
  [148, 153], // TwoWayRoutePart → TWRTPT
  [149, 154], // UnderwaterRock → UWTROC
  [153, 155], // WaterTurbulence → WATTUR
  [157, 159], // Wreck → WRECKS
  [300, 302], // DataCoverage → M_COVR
  [303, 308], // QualityOfBathymetricData → M_QUAL
  [306, 309], // SoundingDatum → M_SDAT
  [307, 312], // VerticalDatumOfData → M_VDAT
]);
