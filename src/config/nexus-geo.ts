import type { LayerFeatureProperties } from '@/types';

export interface NexusLayerFeature extends LayerFeatureProperties {
  country: string;
  status: 'operational' | 'planned' | 'screening' | 'licensing' | 'proposal';
  summary: string;
  source_urls: string[];
  last_verified: string;
}

export const COAL_TO_NUCLEAR_FEASIBILITY_SITES: NexusLayerFeature[] = [
  {
    feature_id: 'c2n-oh-beaver-valley',
    layer_id: 'coalToNuclear',
    name: 'Beaver Valley Coal-to-Nuclear Candidate',
    lat: 40.626,
    lon: -80.435,
    source_refs: ['doe-c2n', 'eia-grid'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.76,
    tags: ['coal-retirement', 'transmission-ready', 'mid-atlantic'],
    country: 'United States',
    status: 'screening',
    summary: 'Legacy coal assets and transmission interconnects make this area a strong repowering candidate.',
    source_urls: [
      'https://www.energy.gov',
      'https://www.eia.gov'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'c2n-ky-ghent',
    layer_id: 'coalToNuclear',
    name: 'Ghent Repowering Study Area',
    lat: 38.741,
    lon: -85.034,
    source_refs: ['doe-c2n', 'eia-grid'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.72,
    tags: ['coal-retirement', 'river-cooling', 'regional-load'],
    country: 'United States',
    status: 'screening',
    summary: 'High-capacity grid connection and retirement timing align with SMR repowering scenarios.',
    source_urls: [
      'https://www.energy.gov',
      'https://www.eia.gov'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'c2n-ut-hunter',
    layer_id: 'coalToNuclear',
    name: 'Hunter Plant Transition Cluster',
    lat: 39.360,
    lon: -111.068,
    source_refs: ['doe-c2n', 'gem-coal-tracker'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.68,
    tags: ['western-grid', 'coal-transition', 'industrial-load'],
    country: 'United States',
    status: 'proposal',
    summary: 'Coal transition studies indicate potential for phased advanced-reactor replacement.',
    source_urls: [
      'https://www.energy.gov',
      'https://globalenergymonitor.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'c2n-wy-naughton',
    layer_id: 'coalToNuclear',
    name: 'Naughton Site Reuse Candidate',
    lat: 41.746,
    lon: -110.582,
    source_refs: ['doe-c2n', 'gem-coal-tracker'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.71,
    tags: ['retirement-window', 'cooling-water', 'workforce-reuse'],
    country: 'United States',
    status: 'screening',
    summary: 'Retiring coal generation with workforce and cooling infrastructure supports conversion analysis.',
    source_urls: [
      'https://www.energy.gov',
      'https://globalenergymonitor.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'c2n-mt-colstrip',
    layer_id: 'coalToNuclear',
    name: 'Colstrip Transition Assessment',
    lat: 45.886,
    lon: -106.623,
    source_refs: ['doe-c2n', 'gem-coal-tracker'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.64,
    tags: ['baseload-gap', 'transmission-hub', 'repowering'],
    country: 'United States',
    status: 'proposal',
    summary: 'Transmission and replacement-baseload need place Colstrip in long-list feasibility assessments.',
    source_urls: [
      'https://www.energy.gov',
      'https://globalenergymonitor.org'
    ],
    last_verified: '2026-02-23'
  }
];

export const INDUSTRIAL_HEAT_OPPORTUNITIES: NexusLayerFeature[] = [
  {
    feature_id: 'heat-us-gulf-petrochem',
    layer_id: 'industrialHeat',
    name: 'US Gulf Petrochemical Heat Cluster',
    lat: 29.730,
    lon: -95.210,
    source_refs: ['nrel-industrial-heat', 'iea-industry'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.82,
    tags: ['petrochemical', 'high-temp-process-heat', 'decarbonization'],
    country: 'United States',
    status: 'screening',
    summary: 'Dense petrochemical operations with high process-heat demand match nuclear heat deployment profiles.',
    source_urls: [
      'https://www.nrel.gov',
      'https://www.iea.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'heat-us-midwest-steel',
    layer_id: 'industrialHeat',
    name: 'Great Lakes Steel Heat Demand',
    lat: 41.667,
    lon: -87.454,
    source_refs: ['nrel-industrial-heat', 'iea-industry'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.78,
    tags: ['steel', 'district-heat', 'electro-fuels'],
    country: 'United States',
    status: 'screening',
    summary: 'Integrated steel and refining assets represent a concentrated market for nuclear process heat.',
    source_urls: [
      'https://www.nrel.gov',
      'https://www.iea.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'heat-can-alberta-oilsands',
    layer_id: 'industrialHeat',
    name: 'Alberta Thermal Operations Corridor',
    lat: 56.727,
    lon: -111.380,
    source_refs: ['iea-industry', 'wna-programs'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.69,
    tags: ['steam-demand', 'resource-processing', 'canada'],
    country: 'Canada',
    status: 'proposal',
    summary: 'Long-duration thermal demand in extraction operations highlights advanced-reactor heat potential.',
    source_urls: [
      'https://www.iea.org',
      'https://world-nuclear.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'heat-eu-rotterdam-industrial',
    layer_id: 'industrialHeat',
    name: 'Rotterdam Industrial Heat Node',
    lat: 51.947,
    lon: 4.136,
    source_refs: ['iea-industry', 'oecd-nea-smr'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.74,
    tags: ['port-industry', 'hydrogen', 'district-heat'],
    country: 'Netherlands',
    status: 'proposal',
    summary: 'Port-driven industry cluster with decarbonization mandates and district heat opportunities.',
    source_urls: [
      'https://www.iea.org',
      'https://www.oecd-nea.org'
    ],
    last_verified: '2026-02-23'
  }
];

export const ADVANCED_REACTOR_PIPELINE_SITES: NexusLayerFeature[] = [
  {
    feature_id: 'ar-us-idaho-sodium',
    layer_id: 'advancedReactors',
    name: 'Idaho Sodium Demonstration Program',
    lat: 43.563,
    lon: -112.973,
    source_refs: ['oecd-nea-smr', 'wna-programs'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.88,
    tags: ['demonstration', 'sodium-reactor', 'us-program'],
    country: 'United States',
    status: 'licensing',
    summary: 'Flagship US advanced reactor project with mature regulatory engagement and grid integration planning.',
    source_urls: [
      'https://www.oecd-nea.org',
      'https://world-nuclear.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'ar-us-wy-kemmerer',
    layer_id: 'advancedReactors',
    name: 'Kemmerer Advanced Reactor Deployment',
    lat: 41.792,
    lon: -110.537,
    source_refs: ['oecd-nea-smr', 'doe-c2n'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.84,
    tags: ['coal-replacement', 'advanced-reactor', 'grid-transition'],
    country: 'United States',
    status: 'licensing',
    summary: 'Coal retirement replacement pathway with active licensing and transmission readiness.',
    source_urls: [
      'https://www.oecd-nea.org',
      'https://www.energy.gov'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'ar-uk-rs-assessment',
    layer_id: 'advancedReactors',
    name: 'UK SMR Fleet Assessment Program',
    lat: 53.478,
    lon: -2.245,
    source_refs: ['oecd-nea-smr', 'wna-programs'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.73,
    tags: ['fleet-model', 'uk', 'industrial-policy'],
    country: 'United Kingdom',
    status: 'proposal',
    summary: 'Fleet-based SMR procurement pathway with strong policy support and siting evaluations.',
    source_urls: [
      'https://www.oecd-nea.org',
      'https://world-nuclear.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'ar-ca-darlington-smr',
    layer_id: 'advancedReactors',
    name: 'Darlington SMR Program',
    lat: 43.869,
    lon: -78.721,
    source_refs: ['oecd-nea-smr', 'wna-programs'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.86,
    tags: ['canada', 'smr', 'brownfield'],
    country: 'Canada',
    status: 'planned',
    summary: 'Advanced reactor deployment on an existing nuclear site with structured licensing milestones.',
    source_urls: [
      'https://www.oecd-nea.org',
      'https://world-nuclear.org'
    ],
    last_verified: '2026-02-23'
  },
  {
    feature_id: 'ar-pl-pomerania-smr',
    layer_id: 'advancedReactors',
    name: 'Poland Industrial SMR Corridor',
    lat: 54.352,
    lon: 18.646,
    source_refs: ['oecd-nea-smr', 'wna-programs'],
    updated_at: '2026-02-23T00:00:00Z',
    confidence: 0.67,
    tags: ['europe', 'industrial-heat', 'smr-pipeline'],
    country: 'Poland',
    status: 'proposal',
    summary: 'Multiple industrial customers under evaluation for modular reactor deployment clusters.',
    source_urls: [
      'https://www.oecd-nea.org',
      'https://world-nuclear.org'
    ],
    last_verified: '2026-02-23'
  }
];
