import type { IconName } from './icons';

/** A toolbar mode groups one or more tools that share the side panel. */
export interface ModeDef {
  id: string;
  label: string;
  icon: IconName;
  key: string; // keyboard shortcut (single key, case-insensitive)
  tools: { id: string; label: string }[];
  title: string;
}

export const MODES: ModeDef[] = [
  { id: 'select', label: 'Select', icon: 'select', key: 'v', title: 'Select & edit objects', tools: [{ id: 'select', label: 'Select' }, { id: 'measure', label: 'Measure' }, { id: 'boundary', label: 'Boundary' }] },
  { id: 'terrain', label: 'Terrain', icon: 'terrain', key: 't', title: 'Sculpt the land', tools: [{ id: 'terrain', label: 'Sculpt' }, { id: 'retaining', label: 'Terraces' }] },
  { id: 'paint', label: 'Paint', icon: 'paint', key: 'p', title: 'Paint ground textures', tools: [{ id: 'paint', label: 'Paint' }] },
  { id: 'water', label: 'Water', icon: 'water', key: 'w', title: 'Moats, ponds and streams', tools: [{ id: 'moat', label: 'Moat' }, { id: 'pond', label: 'Pond / Lake' }, { id: 'stream', label: 'Stream' }] },
  { id: 'plants', label: 'Plants', icon: 'plants', key: 'g', title: 'Trees, plants and gardens', tools: [{ id: 'scatter', label: 'Scatter' }, { id: 'garden', label: 'Gardens' }, { id: 'place:nature', label: 'Place' }] },
  { id: 'paths', label: 'Paths', icon: 'paths', key: 'r', title: 'Roads, paths, fences and walls', tools: [{ id: 'path', label: 'Roads' }, { id: 'fence', label: 'Fences' }] },
  { id: 'castle', label: 'Castle', icon: 'castle', key: 'c', title: 'Castle walls, towers and keep', tools: [{ id: 'curtain', label: 'Walls' }, { id: 'building:castle', label: 'Buildings' }, { id: 'place:castle', label: 'Kit & Props' }] },
  { id: 'buildings', label: 'Village', icon: 'buildings', key: 'b', title: 'Village buildings and props', tools: [{ id: 'building:village', label: 'Buildings' }, { id: 'place:village', label: 'Props' }] },
  { id: 'interiors', label: 'Interiors', icon: 'interiors', key: 'i', title: 'Floor plans and furniture', tools: [{ id: 'interior', label: 'Floor plan' }, { id: 'furnish', label: 'Furnish' }] },
  { id: 'farming', label: 'Farming', icon: 'farming', key: 'f', title: 'Fields, pastures and farm buildings', tools: [{ id: 'field', label: 'Fields' }, { id: 'pasture', label: 'Pastures' }, { id: 'building:farm', label: 'Buildings' }, { id: 'place:farm', label: 'Props' }] },
  { id: 'animals', label: 'Animals', icon: 'animals', key: 'a', title: 'Livestock and wildlife', tools: [{ id: 'animals', label: 'Animals' }] },
  { id: 'walk', label: 'Walk', icon: 'walk', key: 'k', title: 'Walk around in first person', tools: [{ id: 'walk', label: 'Walk' }] },
];
