export const MAT = {
  CONCRETE:      'concrete',
  WOOD:          'wood',
  FIBER_CEMENT:  'fiber_cement',
  CERAMIC:       'ceramic',
  EPS:           'eps',
  ALUMINIUM:     'aluminium',
  AIR:           'air',
  MEMBRANE:      'membrane',
  ADHESIVE:      'adhesive',
  THERMAL_BREAK: 'thermal_break',
};

export const MATERIAL_COLORS = {
  concrete:      '#8fa6b2',
  wood:          '#a87840',
  fiber_cement:  '#7b9bae',
  ceramic:       '#b05c38',
  eps:           '#ece8d8',
  aluminium:     '#7a8a96',
  air:           '#d0e8f4',
  membrane:      '#78b0be',
  adhesive:      '#c89438',
  thermal_break: '#88a888',
};

export const MAT_PATTERN = {
  concrete:      'mat-concrete',
  wood:          'mat-wood',
  fiber_cement:  'mat-fc',
  ceramic:       'mat-brick',
  eps:           'mat-eps',
  aluminium:     'mat-alu-rail',
  air:           'mat-ventilation',
  membrane:      'mat-membrane',
  adhesive:      'mat-adhesive',
  thermal_break: 'mat-thermal-break',
};

const DEFS = {
  hout: {
    systemType: 'hout',
    name: 'Houten achterconstructie',
    subMat: MAT.WOOD,
    fixingStrategy: 'screw',
    cavityVentilated: true,
    cornerStrategy: 'batten_continuity',
    openingStrategy: 'compriBand',
    hasThBreak: false,
    movementJointMm: 6000,
    constructionNotes: [
      'Ventilatieopening ≥ 50 mm²/m strekkende meter',
      'Houten regels impregneringsklasse 3 of beter',
      'Dampopen folie bij binnenklimaatklasse 3',
    ],
    openingDetails: {
      header: 'L-profiel / druipneus boven opening',
      sill:   'Dorpelprofiel + compriband afdichting',
      jamb:   'Compriband + dagkantsluiting',
    },
    cornerDetails: {
      outside: 'Regelcontinuïteit langs hoek, hoekstrip',
      return:  'Geventileerde retour, kantafwerkprofiel',
    },
  },
  aluminium: {
    systemType: 'aluminium',
    name: 'Aluminium U-profiel systeem',
    subMat: MAT.ALUMINIUM,
    fixingStrategy: 'anchor',
    cavityVentilated: true,
    cornerStrategy: 'corner_profile',
    openingStrategy: 'rail_break',
    hasThBreak: true,
    movementJointMm: 4500,
    constructionNotes: [
      'Fix- en glijpunten afwisselend plaatsen',
      'Thermische onderbreking bij aluminiumconsoles verplicht',
      'Dilatatievoeg ≤ 4500mm horizontaal en verticaal',
    ],
    openingDetails: {
      header: 'Railonderbreking + L-profiel druipneus',
      sill:   'Sillprofiel + ventilatieopening onderzijde',
      jamb:   'Thermische onderbreking + compriband afdichting',
    },
    cornerDetails: {
      outside: 'L-hoekprofiel + railcontinuïteit beide vlakken',
      return:  'Voegband + dilatatieprofiel retourpunt',
    },
  },
  slimfort: {
    systemType: 'slimfort',
    name: 'SlimFort XT® systeem',
    subMat: MAT.ALUMINIUM,
    fixingStrategy: 'bracket',
    cavityVentilated: false,
    cornerStrategy: 'eps_return',
    openingStrategy: 'eps_reveal',
    hasThBreak: true,
    movementJointMm: 6000,
    constructionNotes: [
      'EPS-elementen met geïntegreerde tong/groef verbinding',
      'Aluminium kokers in EPS-brackets geïntegreerd, max 600mm hart-op-hart',
      'EPS-retour bij alle openingen en hoeken verplicht',
    ],
    openingDetails: {
      header: 'EPS-retour 100mm + druipneus profiel',
      sill:   'EPS-dorpelretour + sillprofiel afdichting',
      jamb:   'EPS-dagkant + compriband voegband',
    },
    cornerDetails: {
      outside: 'EPS-wikkeling rondom hoek, hoekstrip naad',
      return:  'EPS-retourpaneel + profielkoppeling naad',
    },
  },
};

export function getSystemDefinition(settings) {
  const bt = settings?.backingType;
  if (bt === 'aluminium_slimfort') return DEFS.slimfort;
  if (bt === 'aluminium') return DEFS.aluminium;
  return DEFS.hout;
}
