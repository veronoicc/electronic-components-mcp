export const COMPONENT_CATEGORIES = [
  'capacitor',
  'resistor',
  'inductor',
  'diode',
  'transistor',
  'ic',
  'microcontroller',
  'sensor',
  'relay',
  'display',
  'power_supply',
  'motor_driver',
  'connector',
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export interface CategoryKeywords {
  primaryGerman: string;
  primaryEnglish: string;
  keywords: string[];
}

export const CATEGORY_DEFINITIONS: Record<ComponentCategory, CategoryKeywords> = {
  capacitor: {
    primaryGerman: 'Kondensator',
    primaryEnglish: 'Capacitor',
    keywords: ['Kondensator', 'Elko', 'Elektrolytkondensator', 'Keramikkondensator', 'Capacitor', 'SMD Capacitor'],
  },
  resistor: {
    primaryGerman: 'Widerstand',
    primaryEnglish: 'Resistor',
    keywords: ['Widerstand', 'Resistor', 'Kohleschicht', 'Metallschicht', 'SMD Widerstand', 'Potentiometer'],
  },
  inductor: {
    primaryGerman: 'Induktivität',
    primaryEnglish: 'Inductor',
    keywords: ['Induktivität', 'Spule', 'Drossel', 'Inductor', 'Choke', 'Ferrit'],
  },
  diode: {
    primaryGerman: 'Diode',
    primaryEnglish: 'Diode',
    keywords: ['Diode', 'Schottky', 'Zener', 'Gleichrichter', 'Leuchtdiode', 'LED', 'TVS Diode'],
  },
  transistor: {
    primaryGerman: 'Transistor',
    primaryEnglish: 'Transistor',
    keywords: ['Transistor', 'MOSFET', 'BJT', 'IGBT', 'N-Kanal', 'P-Kanal', 'NPN', 'PNP'],
  },
  ic: {
    primaryGerman: 'IC',
    primaryEnglish: 'IC',
    keywords: ['IC', 'Integrierter Schaltkreis', 'OpAmp', 'Operationsverstärker', 'Timer NE555', 'Logik IC'],
  },
  microcontroller: {
    primaryGerman: 'Mikrocontroller',
    primaryEnglish: 'Microcontroller',
    keywords: ['Mikrocontroller', 'Microcontroller', 'MCU', 'ESP32', 'ESP8266', 'Arduino', 'STM32', 'RP2040', 'Raspberry Pi Pico'],
  },
  sensor: {
    primaryGerman: 'Sensor',
    primaryEnglish: 'Sensor',
    keywords: ['Sensor', 'Fühler', 'Temperatursensor', 'Drucksensor', 'Feuchtigkeitssensor', 'BME280', 'DHT22', 'Gyroskop', 'IMU'],
  },
  relay: {
    primaryGerman: 'Relais',
    primaryEnglish: 'Relay',
    keywords: ['Relais', 'Relay', 'Solid State Relais', 'SSR', 'Optokoppler', 'Relaismodul'],
  },
  display: {
    primaryGerman: 'Display',
    primaryEnglish: 'Display',
    keywords: ['Display', 'OLED', 'LCD', 'TFT', 'E-Paper', 'EPD', 'Nextion', 'Bildschirm'],
  },
  power_supply: {
    primaryGerman: 'Netzteil',
    primaryEnglish: 'Power Supply',
    keywords: ['Netzteil', 'Spannungsregler', 'Step-Down', 'Step-Up', 'Buck Converter', 'Boost Converter', 'LDO'],
  },
  motor_driver: {
    primaryGerman: 'Motortreiber',
    primaryEnglish: 'Motor Driver',
    keywords: ['Motortreiber', 'Motor Driver', 'Schrittmotortreiber', 'H-Brücke', 'L298N', 'A4988', 'DRV8825', 'TMC2209'],
  },
  connector: {
    primaryGerman: 'Steckverbinder',
    primaryEnglish: 'Connector',
    keywords: ['Steckverbinder', 'Connector', 'Stiftleiste', 'Buchsenleiste', 'JST', 'Terminal Block', 'Schraubklemme', 'Header'],
  },
};

/**
 * Builds a search query string combining category keyword with optional subtype or specs.
 * For example:
 * buildCategoryQuery('capacitor', '100uF 25V', 'de') => 'Kondensator 100uF 25V'
 * buildCategoryQuery('microcontroller', 'ESP32-S3', 'global') => 'ESP32-S3 Microcontroller'
 */
export function buildCategoryQuery(
  category: ComponentCategory,
  subtypeOrSpecs?: string,
  regionHint: 'de' | 'global' = 'de'
): string {
  const def = CATEGORY_DEFINITIONS[category];
  const primary = regionHint === 'de' ? def.primaryGerman : def.primaryEnglish;

  if (!subtypeOrSpecs || subtypeOrSpecs.trim() === '') {
    return primary;
  }

  const cleanSpecs = subtypeOrSpecs.trim();
  // If the user already included the category word in the specs, avoid duplicating
  if (cleanSpecs.toLowerCase().includes(primary.toLowerCase())) {
    return cleanSpecs;
  }

  return `${primary} ${cleanSpecs}`;
}

export function isComponentCategory(value: string): value is ComponentCategory {
  return (COMPONENT_CATEGORIES as readonly string[]).includes(value);
}
