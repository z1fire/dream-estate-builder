// Curated selection of source models → catalog entries.
// Each group: { src: base folder in assets-raw, category, snap, tags, roomTypes?, light?, items: [[file, id, name, heightMetres, extras?]] }
// heightMetres rescales the model so its bounding-box height matches real-world size (keeps packs consistent).
// file is relative to `src` (".glb" appended if missing). For Quaternius (poly.pizza) use "pp:<PublicID or Title>".

const K = (kit) => `kenney/${kit}/Models/GLB format`;
const KN = 'kenney/nature-kit/Models/GLTF format';
const KF = 'kenney/furniture-kit/Models/GLTF format';
const B = (cat) => `blender/${cat}`;

export const GROUPS = [
  // ---------------- nature ----------------
  { src: KN, category: 'trees', snap: 'ground', tags: ['tree'], items: [
    ['tree_oak', 'oak', 'Oak', 10], ['tree_default', 'tree_round', 'Round Tree', 8], ['tree_detailed', 'tree_leafy', 'Leafy Tree', 9],
    ['tree_fat', 'tree_broad', 'Broad Tree', 7.5], ['tree_tall', 'poplar', 'Poplar', 12], ['tree_thin', 'birch', 'Birch', 10],
    ['tree_simple', 'tree_simple', 'Simple Tree', 7], ['tree_small', 'sapling', 'Sapling', 3.5], ['tree_cone', 'fir', 'Fir', 10],
    ['tree_pineTallA', 'pine', 'Pine', 14], ['tree_pineTallB_detailed', 'pine_tall', 'Tall Pine', 16], ['tree_pineRoundA', 'spruce', 'Spruce', 10],
    ['tree_pineSmallA', 'pine_small', 'Young Pine', 4], ['tree_plateau', 'tree_plateau', 'Plateau Tree', 8],
  ] },
  { src: 'quaternius-polypizza', category: 'trees', snap: 'ground', tags: ['tree'], items: [
    ['pp:Birch Tree', 'birch_q', 'Silver Birch', 11], ['pp:Willow', 'willow', 'Willow', 9], ['pp:Pine', 'pine_q', 'Mountain Pine', 13],
    ['pp:Birch Tree Dead', 'birch_dead', 'Dead Birch', 9], ['pp:Tree', 'tree_q', 'Woodland Tree', 9],
  ] },
  { src: B('trees'), category: 'trees', snap: 'ground', tags: ['tree', 'fruit', 'orchard'], items: [
    ['tree_apple', 'tree_apple', 'Apple Tree', 4.2], ['tree_pear', 'tree_pear', 'Pear Tree', 4.2], ['tree_plum', 'tree_plum', 'Plum Tree', 4.2],
  ] },
  { src: KN, category: 'shrubs', snap: 'ground', tags: ['bush', 'shrub'], items: [
    ['plant_bush', 'bush', 'Bush', 1.1], ['plant_bushDetailed', 'bush_detailed', 'Leafy Bush', 1.2], ['plant_bushLarge', 'bush_large', 'Large Bush', 1.8],
    ['plant_bushSmall', 'bush_small', 'Small Bush', 0.7], ['plant_bushTriangle', 'bush_cone', 'Cone Shrub', 1.5], ['plant_flatTall', 'reeds', 'Reeds', 1.5],
    ['grass_large', 'grass_tall', 'Tall Grass', 0.7], ['grass', 'grass_tuft', 'Grass Tuft', 0.4], ['grass_leafs', 'fern', 'Fern', 0.6],
    ['lily_large', 'lily', 'Lily Pad', 0.05], ['mushroom_redGroup', 'mushrooms_red', 'Red Mushrooms', 0.3], ['mushroom_tanGroup', 'mushrooms', 'Mushrooms', 0.3],
  ] },
  { src: 'quaternius-polypizza', category: 'shrubs', snap: 'ground', tags: ['bush'], items: [
    ['pp:Bush with Flowers', 'bush_flowers', 'Flowering Bush', 1.2], ['pp:Tall Grass', 'grass_wild', 'Wild Grass', 0.8],
  ] },
  { src: KN, category: 'flowers', snap: 'ground', tags: ['flower'], items: [
    ['flower_purpleA', 'flower_purple', 'Purple Flowers', 0.45], ['flower_redA', 'flower_red', 'Red Flowers', 0.45], ['flower_yellowA', 'flower_yellow', 'Yellow Flowers', 0.45],
    ['flower_purpleC', 'flower_purple2', 'Lavender', 0.5], ['flower_redC', 'flower_red2', 'Poppies', 0.45], ['flower_yellowC', 'flower_yellow2', 'Buttercups', 0.4],
  ] },
  { src: 'quaternius-polypizza', category: 'flowers', snap: 'ground', tags: ['flower'], items: [['pp:Flower Group', 'flower_group', 'Wildflowers', 0.5]] },
  { src: KN, category: 'rocks', snap: 'ground', tags: ['rock', 'stone'], items: [
    ['rock_largeA', 'boulder', 'Boulder', 2.4], ['rock_largeC', 'boulder2', 'Boulder (flat)', 1.8], ['rock_largeE', 'boulder3', 'Mossy Boulder', 2.2],
    ['rock_tallA', 'rock_tall', 'Standing Rock', 3.5], ['rock_smallA', 'rock', 'Rock', 0.6], ['rock_smallC', 'rock2', 'Rock (round)', 0.5],
    ['rock_smallFlatA', 'stone_flat', 'Flat Stone', 0.25], ['stone_largeA', 'stone_large', 'Grey Stone', 1.5], ['stump_round', 'stump', 'Stump', 0.6],
    ['log', 'log', 'Fallen Log', 0.6], ['log_stack', 'log_pile', 'Log Pile', 1.0],
  ] },
  // ---------------- castle ----------------
  { src: B('castle'), category: 'castle', snap: 'grid', tags: ['castle'], items: [
    ['drawbridge', 'drawbridge', 'Drawbridge', null], ['portcullis', 'portcullis', 'Portcullis', null], ['moat_edge_stone', 'moat_edge_stone', 'Moat Edging', null],
    ['merlon', 'merlon', 'Merlon', null], ['arrow_slit', 'arrow_slit', 'Arrow Slit', null], ['spiral_stairs', 'spiral_stairs', 'Spiral Stairs', null, { roomTypes: ['*'] }],
    ['banner_red', 'banner_red', 'Banner (red)', null, { snap: 'wall', roomTypes: ['hall', 'throne'] }], ['banner_blue', 'banner_blue', 'Banner (blue)', null, { snap: 'wall', roomTypes: ['hall', 'throne'] }],
    ['banner_green', 'banner_green', 'Banner (green)', null, { snap: 'wall', roomTypes: ['hall', 'throne'] }], ['flagpole', 'flagpole', 'Flagpole', null],
    ['door_wood', 'door_wood', 'Wooden Door', null, { snap: 'wall' }], ['door_arched', 'door_arched', 'Arched Door', null, { snap: 'wall' }],
    ['door_double', 'door_double', 'Double Door', null, { snap: 'wall' }], ['window_stained', 'window_stained', 'Stained Glass Window', null, { snap: 'wall' }],
    ['window_shutter', 'window_shutter', 'Shuttered Window', null, { snap: 'wall' }], ['window_arched', 'window_arched', 'Arched Window', null, { snap: 'wall' }],
  ] },
  { src: K('castle-kit'), category: 'castle', snap: 'grid', tags: ['castle', 'kit'], items: [
    ['wall', 'kit_wall', 'Kit Wall', 6], ['wall-corner', 'kit_wall_corner', 'Kit Wall Corner', 6], ['wall-doorway', 'kit_wall_doorway', 'Kit Wall Doorway', 6],
    ['wall-half', 'kit_wall_half', 'Kit Half Wall', 3], ['wall-pillar', 'kit_wall_pillar', 'Kit Wall Pillar', 6.5], ['wall-narrow-gate', 'kit_gate_narrow', 'Kit Narrow Gate', 6],
    ['tower-square', 'kit_tower_square', 'Kit Square Tower', 14], ['tower-hexagon-base', 'kit_tower_hex_base', 'Kit Hex Tower Base', 5],
    ['tower-hexagon-mid', 'kit_tower_hex_mid', 'Kit Hex Tower Mid', 5], ['tower-hexagon-top', 'kit_tower_hex_top', 'Kit Hex Tower Top', 3],
    ['tower-hexagon-roof', 'kit_tower_hex_roof', 'Kit Hex Tower Roof', 6], ['gate', 'kit_gate', 'Kit Gate', 6], ['metal-gate', 'kit_metal_gate', 'Kit Iron Gate', 5],
    ['stairs-stone', 'kit_stairs_stone', 'Stone Steps', 2], ['flag', 'flag', 'Flag', 4], ['flag-banner-long', 'flag_banner', 'Banner Pole', 5],
    ['flag-pennant', 'pennant', 'Pennant', 4],
  ] },
  { src: K('castle-kit'), category: 'siege', snap: 'ground', tags: ['siege', 'weapon'], items: [
    ['siege-trebuchet', 'trebuchet', 'Trebuchet', 7], ['siege-catapult', 'catapult', 'Catapult', 3.5], ['siege-ballista', 'ballista', 'Ballista', 2.2],
    ['siege-ram', 'battering_ram', 'Battering Ram', 3], ['siege-tower', 'siege_tower', 'Siege Tower', 11],
  ] },
  // ---------------- lighting ----------------
  { src: B('lighting'), category: 'lighting', snap: 'ground', tags: ['light'], items: [
    ['torch_wall', 'torch_wall', 'Wall Torch', null, { snap: 'wall', light: { color: '#ffa040', intensity: 6, distance: 9, y: 0.8 } }],
    ['torch_standing', 'torch_standing', 'Standing Torch', null, { light: { color: '#ffa040', intensity: 6, distance: 10, y: 2.2 } }],
    ['brazier', 'brazier', 'Brazier', null, { light: { color: '#ff9030', intensity: 9, distance: 12, y: 1.5 } }],
    ['chandelier', 'chandelier', 'Chandelier', null, { snap: 'ceiling', light: { color: '#ffc070', intensity: 10, distance: 14, y: -1.6 }, roomTypes: ['hall', 'throne', 'tavern', 'chapel'] }],
    ['candle_stand', 'candle_stand', 'Candle Stand', null, { light: { color: '#ffb060', intensity: 3, distance: 6, y: 1.65 }, roomTypes: ['*'] }],
    ['candelabra', 'candelabra', 'Candelabra', null, { light: { color: '#ffb060', intensity: 2.5, distance: 5, y: 0.5 }, roomTypes: ['*'] }],
  ] },
  { src: K('graveyard-kit'), category: 'lighting', snap: 'ground', tags: ['light'], items: [
    ['lantern-candle', 'lantern_candle', 'Candle Lantern', 0.5, { light: { color: '#ffb060', intensity: 2, distance: 5, y: 0.3 } }],
    ['lightpost-single', 'lamppost', 'Lamp Post', 3.2, { light: { color: '#ffb060', intensity: 6, distance: 12, y: 2.9 } }],
    ['fire-basket', 'fire_basket', 'Fire Basket', 1.4, { light: { color: '#ff9030', intensity: 8, distance: 12, y: 1.3 } }],
    ['candle-multiple', 'candles', 'Candles', 0.4, { light: { color: '#ffb060', intensity: 2, distance: 4, y: 0.35 }, roomTypes: ['chapel', 'dungeon', 'cellar', 'bedroom'] }],
  ] },
  { src: K('fantasy-town-kit'), category: 'lighting', snap: 'ground', tags: ['light'], items: [
    ['lantern', 'lantern_post', 'Street Lantern', 3, { light: { color: '#ffb060', intensity: 6, distance: 12, y: 2.6 } }],
  ] },
  // ---------------- furniture by room ----------------
  { src: B('furniture'), category: 'furniture', snap: 'floor', tags: ['furniture'], items: [
    ['long_table', 'long_table', 'Long Table', null, { roomTypes: ['hall', 'tavern', 'kitchen'] }], ['bench_long', 'bench_long', 'Long Bench', null, { roomTypes: ['hall', 'tavern', 'kitchen', 'chapel'] }],
    ['throne', 'throne', 'Throne', null, { roomTypes: ['throne', 'hall'] }], ['bed_fourposter', 'bed_fourposter', 'Four-Poster Bed', null, { roomTypes: ['bedroom'] }],
    ['bed_simple', 'bed_simple', 'Simple Bed', null, { roomTypes: ['bedroom', 'barracks'] }], ['wardrobe', 'wardrobe', 'Wardrobe', null, { roomTypes: ['bedroom'] }],
    ['chest_large', 'chest_large', 'Large Chest', null, { roomTypes: ['bedroom', 'storage', 'armory', 'throne'] }], ['nightstand', 'nightstand', 'Nightstand', null, { roomTypes: ['bedroom'] }],
    ['hearth', 'hearth', 'Great Hearth', null, { roomTypes: ['kitchen', 'hall'], snap: 'wall', light: { color: '#ff8a30', intensity: 14, distance: 14, y: 0.8 } }],
    ['fireplace', 'fireplace', 'Fireplace', null, { roomTypes: ['*'], snap: 'wall', light: { color: '#ff8a30', intensity: 9, distance: 10, y: 0.6 } }],
    ['kitchen_table', 'kitchen_table', 'Kitchen Table', null, { roomTypes: ['kitchen'] }],
    ['cooking_pot', 'cooking_pot', 'Cooking Pot', null, { roomTypes: ['kitchen'], light: { color: '#ff8a30', intensity: 3, distance: 5, y: 0.3 } }],
    ['pot_shelf', 'pot_shelf', 'Pot Shelf', null, { roomTypes: ['kitchen', 'storage'], snap: 'wall' }], ['bread_oven', 'bread_oven', 'Bread Oven', null, { roomTypes: ['kitchen', 'bakery'] }],
    ['bookshelf_medieval', 'bookshelf', 'Bookshelf', null, { roomTypes: ['library', 'bedroom', 'throne'], snap: 'wall' }],
    ['writing_desk', 'writing_desk', 'Writing Desk', null, { roomTypes: ['library', 'bedroom'] }], ['lectern', 'lectern', 'Lectern', null, { roomTypes: ['library', 'chapel'] }],
    ['chair_medieval', 'chair', 'Chair', null, { roomTypes: ['*'] }], ['stool_wood', 'stool', 'Stool', null, { roomTypes: ['*'] }], ['round_table', 'round_table', 'Round Table', null, { roomTypes: ['*'] }],
    ['weapon_rack', 'weapon_rack', 'Weapon Rack', null, { roomTypes: ['armory', 'barracks'], snap: 'wall' }], ['armor_stand', 'armor_stand', 'Armor Stand', null, { roomTypes: ['armory', 'hall', 'throne'] }],
    ['shield_wall', 'shield_wall', 'Shield Display', null, { roomTypes: ['armory', 'hall'], snap: 'wall' }],
    ['pew', 'pew', 'Pew', null, { roomTypes: ['chapel'] }], ['altar', 'altar', 'Altar', null, { roomTypes: ['chapel'] }],
    ['wine_rack', 'wine_rack', 'Wine Rack', null, { roomTypes: ['cellar'], snap: 'wall' }], ['cask', 'cask', 'Cask', null, { roomTypes: ['cellar', 'tavern'] }],
    ['cell_bars', 'cell_bars', 'Cell Bars', null, { roomTypes: ['dungeon'] }], ['shackles', 'shackles', 'Wall Shackles', null, { roomTypes: ['dungeon'], snap: 'wall' }],
    ['straw_pile', 'straw_pile', 'Straw Pile', null, { roomTypes: ['dungeon', 'stable'] }], ['bar_counter', 'bar_counter', 'Bar Counter', null, { roomTypes: ['tavern'] }],
    ['forge', 'forge', 'Forge', null, { roomTypes: ['workshop', 'smithy'], light: { color: '#ff7020', intensity: 8, distance: 9, y: 1.1 } }], ['anvil', 'anvil', 'Anvil', null, { roomTypes: ['workshop', 'smithy'] }],
    ['rug_red', 'rug_red', 'Red Rug', null, { roomTypes: ['*'] }], ['rug_blue', 'rug_blue', 'Blue Rug', null, { roomTypes: ['*'] }], ['rug_runner', 'rug_runner', 'Carpet Runner', null, { roomTypes: ['throne', 'hall', 'chapel'] }],
    ['tapestry_red', 'tapestry_red', 'Tapestry (red)', null, { roomTypes: ['*'], snap: 'wall' }], ['tapestry_blue', 'tapestry_blue', 'Tapestry (blue)', null, { roomTypes: ['*'], snap: 'wall' }],
    ['tapestry_green', 'tapestry_green', 'Tapestry (green)', null, { roomTypes: ['*'], snap: 'wall' }],
  ] },
  { src: 'quaternius-polypizza', category: 'furniture', snap: 'floor', tags: ['furniture'], items: [
    ['pp:Bookcase with Books', 'bookcase_q', 'Bookcase', 2.1, { roomTypes: ['library'] }], ['pp:Bed Double', 'bed_double_q', 'Double Bed', 1.1, { roomTypes: ['bedroom'] }],
    ['pp:Chest Closed', 'chest_q', 'Chest', 0.7, { roomTypes: ['*'] }], ['pp:Cauldron', 'cauldron', 'Cauldron', 0.9, { roomTypes: ['kitchen', 'dungeon'] }],
    ['pp:Shelf Tall', 'shelf_tall', 'Tall Shelf', 2.0, { roomTypes: ['kitchen', 'storage', 'library'] }], ['pp:Closet', 'closet', 'Cupboard', 2.0, { roomTypes: ['bedroom', 'kitchen'] }],
  ] },
  { src: K('graveyard-kit'), category: 'chapel', snap: 'ground', tags: ['chapel', 'graveyard'], items: [
    ['altar-stone', 'altar_stone', 'Stone Altar', 1.1, { roomTypes: ['chapel'] }], ['coffin', 'coffin', 'Coffin', 0.6, { roomTypes: ['chapel', 'cellar'] }],
    ['cross', 'grave_cross', 'Grave Cross', 1.2], ['gravestone-round', 'gravestone', 'Gravestone', 1.0], ['gravestone-decorative', 'gravestone_fancy', 'Ornate Gravestone', 1.3],
    ['crypt', 'crypt', 'Crypt', 4.5], ['urn-round', 'urn', 'Urn', 0.8, { roomTypes: ['chapel', 'hall'] }], ['iron-fence', 'iron_fence', 'Iron Fence', 1.6],
    ['pillar-large', 'pillar_stone', 'Stone Pillar', 3, { roomTypes: ['*'] }],
  ] },
  // ---------------- props / village ----------------
  { src: K('survival-kit'), category: 'props', snap: 'ground', tags: ['prop'], items: [
    ['barrel', 'barrel', 'Barrel', 1.0, { roomTypes: ['*'] }], ['barrel-open', 'barrel_open', 'Open Barrel', 1.0, { roomTypes: ['*'] }],
    ['box', 'crate', 'Crate', 0.8, { roomTypes: ['*'] }], ['box-large', 'crate_large', 'Large Crate', 1.2, { roomTypes: ['storage', 'cellar'] }],
    ['bucket', 'bucket', 'Bucket', 0.4, { roomTypes: ['*'] }], ['chest', 'chest_small', 'Small Chest', 0.5, { roomTypes: ['*'] }],
    ['workbench', 'workbench', 'Workbench', 1.0, { roomTypes: ['workshop'] }], ['workbench-grind', 'grindstone', 'Grindstone', 1.1, { roomTypes: ['armory', 'workshop'] }],
    ['tool-axe', 'axe', 'Axe', 0.9], ['tool-hoe', 'hoe', 'Hoe', 1.5], ['tool-shovel', 'shovel', 'Shovel', 1.4], ['tool-pickaxe', 'pickaxe', 'Pickaxe', 0.9],
    ['campfire-pit', 'campfire', 'Campfire', 0.6, { light: { color: '#ff8a30', intensity: 8, distance: 10, y: 0.6 } }],
    ['resource-wood', 'firewood', 'Firewood', 0.6], ['resource-planks', 'planks', 'Planks', 0.4], ['resource-stone', 'stone_pile', 'Stone Pile', 0.6],
    ['signpost', 'signpost_k', 'Signpost', 2.0], ['tent-canvas', 'tent', 'Tent', 2.4], ['bedroll', 'bedroll', 'Bedroll', 0.2],
  ] },
  { src: K('pirate-kit'), category: 'props', snap: 'ground', tags: ['prop'], items: [
    ['crate-bottles', 'crate_bottles', 'Crate of Bottles', 0.8, { roomTypes: ['cellar', 'tavern'] }], ['cannon', 'cannon', 'Cannon', 1.2],
  ] },
  { src: K('fantasy-town-kit'), category: 'village', snap: 'ground', tags: ['village'], items: [
    ['stall', 'stall', 'Market Stall', 3], ['stall-green', 'stall_green', 'Market Stall (green)', 3], ['stall-red', 'stall_red', 'Market Stall (red)', 3],
    ['stall-bench', 'stall_bench', 'Stall Bench', 1], ['cart', 'cart', 'Cart', 1.6], ['cart-high', 'hay_cart', 'Wagon', 2.2],
    ['fountain-round', 'fountain_round', 'Round Fountain', 1.6], ['fountain-round-detail', 'fountain_ornate', 'Ornate Fountain', 3],
    ['fountain-square', 'fountain_square', 'Square Fountain', 1.6], ['banner-red', 'town_banner_red', 'Town Banner (red)', 4], ['banner-green', 'town_banner_green', 'Town Banner (green)', 4],
    ['pillar-stone', 'pillar', 'Column', 3.5, { roomTypes: ['*'] }], ['wheel', 'wheel', 'Cart Wheel', 1.2],
  ] },
  { src: B('village'), category: 'village', snap: 'ground', tags: ['village'], items: [
    ['well', 'well', 'Well', null], ['market_goods', 'market_goods', 'Market Goods', null], ['signpost', 'signpost', 'Signpost', null],
    ['windmill_sails', 'windmill_sails', 'Windmill Sails', null, { hidden: true }], ['waterwheel', 'waterwheel', 'Waterwheel', null, { hidden: true }],
  ] },
  { src: 'quaternius-polypizza', category: 'village', snap: 'ground', tags: ['village'], items: [
    ['pp:Market Stalls', 'market_stalls_q', 'Market Stalls', 3.2], ['pp:Bench', 'bench_q', 'Park Bench', 0.9],
  ] },
  // ---------------- garden ----------------
  { src: B('garden'), category: 'garden', snap: 'ground', tags: ['garden'], items: [
    ['fountain_tiered', 'fountain_tiered', 'Tiered Fountain', null], ['statue_knight', 'statue_knight', 'Knight Statue', null],
    ['sundial', 'sundial', 'Sundial', null], ['birdbath', 'birdbath', 'Birdbath', null], ['rose_arch', 'rose_arch', 'Rose Arch', null],
  ] },
  { src: KN, category: 'garden', snap: 'ground', tags: ['garden', 'statue'], items: [
    ['statue_column', 'statue_column', 'Garden Column', 3], ['statue_obelisk', 'obelisk', 'Obelisk', 4], ['statue_head', 'statue_head', 'Stone Head', 2],
  ] },
  { src: K('fantasy-town-kit'), category: 'garden', snap: 'ground', tags: ['garden', 'hedge'], items: [
    ['hedge', 'hedge_block', 'Hedge Block', 1.4], ['hedge-large', 'hedge_tall', 'Tall Hedge', 2.4], ['hedge-gate', 'hedge_gate', 'Hedge Arch', 2.4],
  ] },
  { src: K('graveyard-kit'), category: 'garden', snap: 'ground', tags: ['garden'], items: [['bench', 'bench_stone', 'Stone Bench', 0.6]] },
  // ---------------- farm ----------------
  { src: B('farm'), category: 'farm', snap: 'ground', tags: ['farm'], items: [
    ['scarecrow', 'scarecrow', 'Scarecrow', null], ['beehive', 'beehive', 'Beehive', null], ['water_trough', 'water_trough', 'Water Trough', null],
    ['feed_trough', 'feed_trough', 'Feed Trough', null], ['haystack', 'haystack', 'Haystack', null], ['hay_bale_round', 'hay_bale_round', 'Round Hay Bale', null],
  ] },
  { src: K('graveyard-kit'), category: 'farm', snap: 'ground', tags: ['farm'], items: [
    ['hay-bale', 'hay_bale', 'Hay Bale', 0.6, { roomTypes: ['stable'] }], ['hay-bale-bundled', 'hay_bales', 'Hay Bales', 1.2, { roomTypes: ['stable'] }],
    ['pumpkin', 'pumpkin', 'Pumpkin', 0.45],
  ] },
  { src: KN, category: 'farm', snap: 'ground', tags: ['farm', 'crop'], items: [
    ['crops_wheatStageA', 'crop_wheat_young', 'Young Wheat', 0.5, { hidden: true }], ['crops_wheatStageB', 'crop_wheat', 'Wheat', 1.0, { hidden: true }],
    ['crops_cornStageB', 'crop_corn_young', 'Young Corn', 1.0, { hidden: true }], ['crops_cornStageD', 'crop_corn', 'Corn', 2.2, { hidden: true }],
    ['crops_leafsStageA', 'crop_sprouts', 'Sprouts', 0.25, { hidden: true }], ['crops_leafsStageB', 'crop_greens', 'Greens', 0.45, { hidden: true }],
    ['crop_pumpkin', 'crop_pumpkin', 'Pumpkin Plant', 0.5, { hidden: true }], ['crop_carrot', 'crop_carrot', 'Carrots', 0.35, { hidden: true }],
    ['crop_turnip', 'crop_turnip', 'Turnips', 0.35, { hidden: true }], ['crop_melon', 'crop_melon', 'Melons', 0.4, { hidden: true }],
  ] },
  // ---------------- animals ----------------
  { src: 'quaternius-polypizza', category: 'animals', snap: 'ground', tags: ['animal'], items: [
    ['pp:Horse*', 'horse', 'Horse', 1.7], ['pp:White Horse*', 'horse_white', 'White Horse', 1.7], ['pp:Cow*', 'cow', 'Cow', 1.5], ['pp:Bull*', 'bull', 'Bull', 1.6],
    ['pp:Sheep*', 'sheep', 'Sheep', 1.0], ['pp:Pig*', 'pig', 'Pig', 0.9], ['pp:Chicken*', 'chicken', 'Chicken', 0.45], ['pp:Chick*', 'chick', 'Chick', 0.2],
    ['pp:Dog*', 'dog', 'Dog', 0.75], ['pp:Husky*', 'husky', 'Husky', 0.8], ['pp:Shiba Inu*', 'shiba', 'Shiba Inu', 0.6], ['pp:Deer*', 'deer', 'Deer', 1.6],
    ['pp:Stag*', 'stag', 'Stag', 2.0], ['pp:Donkey*', 'donkey', 'Donkey', 1.4], ['pp:Alpaca*', 'alpaca', 'Alpaca', 1.7], ['pp:Fox*', 'fox', 'Fox', 0.55],
  ] },
  { src: B('animals'), category: 'animals', snap: 'ground', tags: ['animal'], items: [
    ['duck', 'duck', 'Duck', null], ['goat', 'goat', 'Goat', null],
  ] },
  // ---------------- boats ----------------
  { src: K('pirate-kit'), category: 'boats', snap: 'ground', tags: ['boat', 'water'], items: [
    ['boat-row-small', 'rowboat', 'Rowboat', 1.0], ['boat-row-large', 'rowboat_large', 'Large Rowboat', 1.3], ['structure-platform-dock-small', 'dock', 'Small Dock', 1.5],
  ] },
  { src: KN, category: 'boats', snap: 'ground', tags: ['bridge'], items: [
    ['bridge_stone', 'bridge_stone', 'Stone Bridge', 2.5], ['bridge_wood', 'bridge_wood', 'Wooden Bridge', 2], ['bridge_stoneRound', 'bridge_arched', 'Arched Bridge', 3.2],
  ] },
  // ---------------- food & table dressing ----------------
  { src: K('food-kit'), category: 'decor', snap: 'floor', tags: ['food', 'table'], items: [
    ['bread', 'bread', 'Bread', 0.15, { roomTypes: ['kitchen', 'hall', 'tavern'] }], ['loaf-round', 'loaf', 'Round Loaf', 0.15, { roomTypes: ['kitchen', 'hall', 'tavern'] }],
    ['cheese', 'cheese', 'Cheese Wheel', 0.15, { roomTypes: ['kitchen', 'cellar'] }], ['meat-cooked', 'roast', 'Roast', 0.2, { roomTypes: ['kitchen', 'hall'] }],
    ['pie', 'pie', 'Pie', 0.1, { roomTypes: ['kitchen', 'hall'] }], ['mug', 'mug', 'Tankard', 0.15, { roomTypes: ['tavern', 'hall'] }],
    ['glass-wine', 'goblet', 'Goblet', 0.18, { roomTypes: ['hall', 'throne'] }], ['bowl-soup', 'bowl', 'Bowl of Stew', 0.1, { roomTypes: ['kitchen', 'tavern'] }],
    ['apple', 'apple', 'Apple', 0.08, { roomTypes: ['kitchen'] }], ['cutting-board', 'cutting_board', 'Cutting Board', 0.05, { roomTypes: ['kitchen'] }],
  ] },
  { src: K('mini-dungeon'), category: 'decor', snap: 'floor', tags: ['dungeon'], items: [
    ['banner', 'dungeon_banner', 'Dungeon Banner', 2.5, { roomTypes: ['dungeon', 'hall'] }], ['column', 'dungeon_column', 'Dungeon Column', 3.5, { roomTypes: ['dungeon', 'cellar'] }],
    ['trap', 'trap', 'Floor Trap', 0.2, { roomTypes: ['dungeon'] }], ['pot', 'clay_pot', 'Clay Pot', 0.6, { roomTypes: ['*'] }],
    ['shield-round', 'shield_round', 'Round Shield', 0.8, { roomTypes: ['armory'] }], ['weapon-sword', 'sword', 'Sword', 1.0, { roomTypes: ['armory'] }],
  ] },
  { src: KF, category: 'decor', snap: 'floor', tags: ['furniture'], items: [
    ['books', 'books', 'Books', 0.25, { roomTypes: ['library', 'bedroom'] }], ['rugRound', 'rug_round', 'Round Rug', 0.03, { roomTypes: ['*'] }],
    ['pottedPlant', 'potted_plant', 'Potted Plant', 0.9, { roomTypes: ['*'] }], ['coatRackStanding', 'coat_rack', 'Coat Rack', 1.8, { roomTypes: ['bedroom', 'hall'] }],
  ] },
];

export const CATEGORY_LABELS = {
  trees: 'Trees', shrubs: 'Shrubs & Grass', flowers: 'Flowers', rocks: 'Rocks & Logs', castle: 'Castle', siege: 'Siege', lighting: 'Lighting',
  furniture: 'Furniture', chapel: 'Chapel & Graves', props: 'Props', village: 'Village', garden: 'Garden', farm: 'Farm', animals: 'Animals',
  boats: 'Boats & Bridges', decor: 'Decor',
};

export const CREDITS = [
  { name: 'Kenney — Castle Kit, Fantasy Town Kit, Nature Kit, Furniture Kit, Survival Kit, Graveyard Kit, Pirate Kit, Food Kit, Mini Dungeon, Modular Dungeon Kit, Holiday Kit', url: 'https://kenney.nl', license: 'CC0 1.0' },
  { name: 'Quaternius — animals, nature and props (via poly.pizza)', url: 'https://quaternius.com', license: 'CC0 1.0' },
  { name: 'Dream Estate Builder Blender scripts (blender/*.py) — castle pieces, furniture, farm, garden, duck, goat', url: '', license: 'CC0 1.0' },
];
