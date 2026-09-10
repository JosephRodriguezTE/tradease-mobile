export interface TradeJob {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export interface PriceRange {
  id: string;
  label: string;
  min: number;
  max: number;
  display: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  sub: string;
  icon: string;
}

export const TIME_SLOTS: TimeSlot[] = [
  { id: 'asap', label: 'ASAP', sub: 'Within 2 hours', icon: '⚡' },
  { id: 'today', label: 'Today', sub: 'Flexible time today', icon: '📅' },
  { id: 'tomorrow_am', label: 'Tomorrow AM', sub: '8:00 AM – 12:00 PM', icon: '🌅' },
  { id: 'tomorrow_pm', label: 'Tomorrow PM', sub: '12:00 PM – 6:00 PM', icon: '☀️' },
  { id: 'this_week', label: 'This Week', sub: 'Mon – Fri, flexible', icon: '📆' },
  { id: 'weekend', label: 'Weekend', sub: 'Saturday or Sunday', icon: '🏖️' },
  { id: 'flexible', label: 'Flexible', sub: "I'll work with the contractor", icon: '🤝' },
];

export const TRADE_JOBS: Record<string, TradeJob[]> = {
  Electrical: [
    { id: 'outlet_install', label: 'Outlet Installation / Repair', description: 'Install new outlets or repair existing ones', icon: '🔌' },
    { id: 'panel_upgrade', label: 'Panel Upgrade / Replacement', description: 'Upgrade electrical panel to higher amperage', icon: '⚡' },
    { id: 'light_fixture', label: 'Light Fixture Installation', description: 'Install ceiling lights, sconces, or recessed lighting', icon: '💡' },
    { id: 'ceiling_fan', label: 'Ceiling Fan Installation', description: 'Install or replace ceiling fan with or without light', icon: '🌀' },
    { id: 'circuit_breaker', label: 'Circuit Breaker Replacement', description: 'Replace faulty or tripped breakers', icon: '🔧' },
    { id: 'ev_charger', label: 'EV Charger Installation', description: 'Install Level 2 home EV charging station', icon: '🚗' },
    { id: 'smoke_detector', label: 'Smoke / CO Detector Install', description: 'Install hardwired smoke and CO detectors', icon: '🚨' },
    { id: 'outdoor_lighting', label: 'Outdoor Lighting', description: 'Install security lights, landscape lighting, or floodlights', icon: '🌟' },
    { id: 'wiring_project', label: 'Wiring Project', description: 'New wiring for renovation or addition', icon: '🔗' },
    { id: 'generator', label: 'Generator Installation', description: 'Install whole-home or portable generator hookup', icon: '⚙️' },
  ],

  Plumbing: [
    { id: 'leak_repair', label: 'Leak Repair', description: 'Fix leaking pipes, faucets, or fixtures', icon: '💧' },
    { id: 'drain_cleaning', label: 'Drain Cleaning / Unclogging', description: 'Clear blocked drains, toilets, or sewer lines', icon: '🚿' },
    { id: 'water_heater', label: 'Water Heater Replacement', description: 'Replace or install traditional or tankless water heater', icon: '🔥' },
    { id: 'toilet_install', label: 'Toilet Installation / Repair', description: 'Install new toilet or repair running/leaking toilet', icon: '🚽' },
    { id: 'sink_install', label: 'Sink Installation', description: 'Install kitchen or bathroom sink and faucet', icon: '🚰' },
    { id: 'shower_bath', label: 'Shower / Bathtub Installation', description: 'Install or replace shower, bathtub, or fixtures', icon: '🛁' },
    { id: 'garbage_disposal', label: 'Garbage Disposal Install', description: 'Install or replace kitchen garbage disposal', icon: '🗑️' },
    { id: 'pipe_replacement', label: 'Pipe Replacement', description: 'Replace corroded, burst, or old pipes', icon: '🔩' },
    { id: 'sump_pump', label: 'Sump Pump Installation', description: 'Install or replace basement sump pump', icon: '⬇️' },
    { id: 'emergency_flood', label: 'Emergency Flood Response', description: 'Urgent water damage and flooding response', icon: '🆘' },
  ],

  HVAC: [
    { id: 'ac_tuneup', label: 'AC Tune-Up / Maintenance', description: 'Annual AC service and filter replacement', icon: '❄️' },
    { id: 'ac_install', label: 'AC Installation', description: 'Install new central or window air conditioning', icon: '🌬️' },
    { id: 'ac_repair', label: 'AC Repair', description: 'Diagnose and fix AC not cooling or leaking', icon: '🔧' },
    { id: 'furnace_install', label: 'Furnace Installation', description: 'Install new gas or electric furnace', icon: '🔥' },
    { id: 'furnace_repair', label: 'Furnace Repair', description: 'Fix furnace not heating or making noise', icon: '⚙️' },
    { id: 'duct_cleaning', label: 'Duct Cleaning', description: 'Deep clean HVAC ducts and vents', icon: '💨' },
    { id: 'thermostat', label: 'Thermostat Installation', description: 'Install smart or programmable thermostat', icon: '🌡️' },
    { id: 'heat_pump', label: 'Heat Pump Installation', description: 'Install energy-efficient heat pump system', icon: '♻️' },
    { id: 'refrigerant', label: 'Refrigerant Recharge', description: 'Recharge AC refrigerant (R-22/R-410A)', icon: '💠' },
    { id: 'mini_split', label: 'Mini-Split Installation', description: 'Install ductless mini-split system', icon: '🏠' },
  ],

  Carpentry: [
    { id: 'cabinet_install', label: 'Cabinet Installation', description: 'Install kitchen or bathroom cabinets', icon: '🗄️' },
    { id: 'custom_shelving', label: 'Custom Shelving', description: 'Build and install custom shelves or closet systems', icon: '📚' },
    { id: 'door_install', label: 'Door Installation / Repair', description: 'Install new door or repair existing door/frame', icon: '🚪' },
    { id: 'window_install', label: 'Window Installation', description: 'Install replacement or new windows', icon: '🪟' },
    { id: 'deck_build', label: 'Deck / Porch Building', description: 'Build new deck, porch, or outdoor structure', icon: '🏡' },
    { id: 'trim_molding', label: 'Trim / Molding Installation', description: 'Install crown molding, baseboards, or wainscoting', icon: '🔨' },
    { id: 'furniture_assembly', label: 'Furniture Assembly', description: 'Assemble flat-pack or custom furniture', icon: '🛋️' },
    { id: 'staircase_repair', label: 'Staircase Repair', description: 'Fix squeaky, broken, or unsafe stairs', icon: '🪜' },
    { id: 'framing', label: 'Framing', description: 'New wall framing or renovation framing work', icon: '🏗️' },
    { id: 'hardwood_floor', label: 'Hardwood Floor Installation', description: 'Install solid or engineered hardwood floors', icon: '🪵' },
  ],

  Handyman: [
    { id: 'tv_mount', label: 'TV Mounting', description: 'Mount flat-screen TV to wall with cable management', icon: '📺' },
    { id: 'drywall_repair', label: 'Drywall Repair', description: 'Patch holes, cracks, or damaged drywall', icon: '🧱' },
    { id: 'door_repair', label: 'Door / Window Repair', description: 'Fix sticking doors, broken locks, or window issues', icon: '🚪' },
    { id: 'caulking', label: 'Caulking / Weatherproofing', description: 'Seal gaps around windows, doors, and fixtures', icon: '🔏' },
    { id: 'gutter_clean', label: 'Gutter Cleaning', description: 'Clean and flush gutters and downspouts', icon: '🌧️' },
    { id: 'pressure_wash', label: 'Pressure Washing', description: 'Pressure wash driveway, deck, siding, or walkways', icon: '💦' },
    { id: 'assembly', label: 'Furniture / Equipment Assembly', description: 'Assemble furniture, BBQs, gym equipment, etc.', icon: '🔩' },
    { id: 'paint_touch', label: 'Painting Touch-Ups', description: 'Small paint repairs and touch-ups', icon: '🖌️' },
    { id: 'general_repair', label: 'General Home Repairs', description: 'Miscellaneous fixes around the house', icon: '🔨' },
    { id: 'smart_home', label: 'Smart Home Device Install', description: 'Install Ring, Nest, smart locks, and similar devices', icon: '📱' },
  ],

  Painting: [
    { id: 'interior_room', label: 'Interior Room Painting', description: 'Paint one or more interior rooms', icon: '🎨' },
    { id: 'exterior', label: 'Exterior House Painting', description: 'Paint the exterior of your home', icon: '🏠' },
    { id: 'cabinet_paint', label: 'Cabinet Painting / Refinishing', description: 'Paint or refinish kitchen or bathroom cabinets', icon: '🗄️' },
    { id: 'deck_stain', label: 'Deck / Fence Staining', description: 'Stain or seal wood deck or fence', icon: '🪵' },
    { id: 'drywall_paint', label: 'Drywall Repair + Paint', description: 'Patch drywall and repaint the area', icon: '🧱' },
    { id: 'ceiling_paint', label: 'Ceiling Painting', description: 'Paint ceilings including popcorn removal', icon: '⬆️' },
    { id: 'wallpaper_remove', label: 'Wallpaper Removal + Paint', description: 'Remove old wallpaper and prep wall for paint', icon: '📄' },
    { id: 'commercial_paint', label: 'Commercial Painting', description: 'Paint office, retail, or commercial space', icon: '🏢' },
    { id: 'garage_floor', label: 'Garage Floor Coating', description: 'Apply epoxy or polyurea garage floor coating', icon: '🏎️' },
    { id: 'accent_wall', label: 'Accent Wall', description: 'Create a feature or accent wall with color or texture', icon: '🖼️' },
  ],

  Landscaping: [
    { id: 'lawn_mowing', label: 'Lawn Mowing', description: 'Mow, edge, and clean up grass', icon: '🌿' },
    { id: 'garden_design', label: 'Garden Design / Planting', description: 'Design and plant flower beds or gardens', icon: '🌸' },
    { id: 'tree_trim', label: 'Tree Trimming / Removal', description: 'Trim overgrown trees or remove dead trees', icon: '🌳' },
    { id: 'hedge_trim', label: 'Hedge / Bush Trimming', description: 'Trim and shape hedges, bushes, and shrubs', icon: '✂️' },
    { id: 'mulching', label: 'Mulching', description: 'Apply mulch to garden beds and trees', icon: '🍂' },
    { id: 'irrigation', label: 'Irrigation System Install', description: 'Install or repair lawn sprinkler system', icon: '💧' },
    { id: 'sod_install', label: 'Sod Installation', description: 'Install new sod for fresh lawn', icon: '🟩' },
    { id: 'leaf_cleanup', label: 'Leaf / Yard Cleanup', description: 'Seasonal yard cleanup and leaf removal', icon: '🍁' },
    { id: 'snow_removal', label: 'Snow Removal', description: 'Shovel, plow, or salt driveway and walkways', icon: '❄️' },
    { id: 'hardscaping', label: 'Hardscaping / Patio Install', description: 'Install pavers, walkways, or retaining walls', icon: '🪨' },
  ],

  Roofing: [
    { id: 'inspection', label: 'Roof Inspection', description: 'Full roof inspection with written report', icon: '🔍' },
    { id: 'leak_repair', label: 'Leak Repair', description: 'Find and fix active roof leak', icon: '💧' },
    { id: 'shingle_replace', label: 'Shingle Replacement', description: 'Replace damaged, missing, or curling shingles', icon: '🏠' },
    { id: 'full_replace', label: 'Full Roof Replacement', description: 'Complete tear-off and new roof installation', icon: '🏗️' },
    { id: 'gutter_install', label: 'Gutter Installation / Repair', description: 'Install new gutters or fix sagging/leaking gutters', icon: '🌧️' },
    { id: 'skylight', label: 'Skylight Installation / Repair', description: 'Install new skylight or fix leaking skylight', icon: '☀️' },
    { id: 'flat_roof', label: 'Flat Roof Repair', description: 'Repair or replace flat or low-slope roof', icon: '📐' },
    { id: 'storm_damage', label: 'Storm Damage Repair', description: 'Emergency repair after wind, hail, or storm damage', icon: '⛈️' },
    { id: 'fascia_soffit', label: 'Fascia / Soffit Repair', description: 'Repair or replace fascia boards and soffit panels', icon: '🔨' },
    { id: 'chimney', label: 'Chimney Repair / Flashing', description: 'Fix chimney flashing, cap, or masonry', icon: '🏭' },
  ],

  Cleaning: [
    { id: 'standard_clean', label: 'Standard Cleaning', description: 'Regular house cleaning — kitchen, bathrooms, living areas', icon: '🧹' },
    { id: 'deep_clean', label: 'Deep Cleaning', description: 'Thorough top-to-bottom deep clean of entire home', icon: '✨' },
    { id: 'move_in_out', label: 'Move-In / Move-Out Clean', description: 'Full cleaning for rental or sale turnover', icon: '📦' },
    { id: 'post_construction', label: 'Post-Construction Cleanup', description: 'Remove dust and debris after renovation', icon: '🏗️' },
    { id: 'window_cleaning', label: 'Window Cleaning', description: 'Interior and exterior window cleaning', icon: '🪟' },
    { id: 'carpet_clean', label: 'Carpet Cleaning', description: 'Steam clean or shampoo carpets', icon: '🏠' },
    { id: 'office_clean', label: 'Office / Commercial Cleaning', description: 'Clean office or commercial space', icon: '🏢' },
    { id: 'appliance_clean', label: 'Appliance Cleaning', description: 'Deep clean oven, fridge, washer, or dishwasher', icon: '🍳' },
  ],
};

export const PRICE_RANGES: Record<string, PriceRange[]> = {
  Electrical: [
    { id: 'e1', label: 'Small Job', min: 100, max: 300, display: '$100 – $300' },
    { id: 'e2', label: 'Medium Job', min: 300, max: 800, display: '$300 – $800' },
    { id: 'e3', label: 'Large Job', min: 800, max: 2000, display: '$800 – $2,000' },
    { id: 'e4', label: 'Major Project', min: 2000, max: 5000, display: '$2,000 – $5,000' },
    { id: 'e5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Plumbing: [
    { id: 'p1', label: 'Quick Fix', min: 100, max: 350, display: '$100 – $350' },
    { id: 'p2', label: 'Standard Job', min: 350, max: 800, display: '$350 – $800' },
    { id: 'p3', label: 'Large Job', min: 800, max: 2000, display: '$800 – $2,000' },
    { id: 'p4', label: 'Major Project', min: 2000, max: 6000, display: '$2,000 – $6,000' },
    { id: 'p5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  HVAC: [
    { id: 'h1', label: 'Tune-Up / Service', min: 80, max: 250, display: '$80 – $250' },
    { id: 'h2', label: 'Repair Job', min: 250, max: 800, display: '$250 – $800' },
    { id: 'h3', label: 'Installation', min: 800, max: 3000, display: '$800 – $3,000' },
    { id: 'h4', label: 'Full System', min: 3000, max: 10000, display: '$3,000 – $10,000' },
    { id: 'h5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Carpentry: [
    { id: 'c1', label: 'Small Project', min: 150, max: 500, display: '$150 – $500' },
    { id: 'c2', label: 'Medium Project', min: 500, max: 1500, display: '$500 – $1,500' },
    { id: 'c3', label: 'Large Project', min: 1500, max: 4000, display: '$1,500 – $4,000' },
    { id: 'c4', label: 'Custom Build', min: 4000, max: 15000, display: '$4,000 – $15,000' },
    { id: 'c5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Handyman: [
    { id: 'hm1', label: '1 Hour', min: 75, max: 150, display: '$75 – $150' },
    { id: 'hm2', label: 'Half Day', min: 150, max: 350, display: '$150 – $350' },
    { id: 'hm3', label: 'Full Day', min: 350, max: 600, display: '$350 – $600' },
    { id: 'hm4', label: 'Multi-Day', min: 600, max: 1500, display: '$600 – $1,500' },
    { id: 'hm5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Painting: [
    { id: 'pt1', label: 'Single Room', min: 200, max: 600, display: '$200 – $600' },
    { id: 'pt2', label: 'Multiple Rooms', min: 600, max: 1500, display: '$600 – $1,500' },
    { id: 'pt3', label: 'Full Interior', min: 1500, max: 4000, display: '$1,500 – $4,000' },
    { id: 'pt4', label: 'Full Exterior', min: 2500, max: 7000, display: '$2,500 – $7,000' },
    { id: 'pt5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Landscaping: [
    { id: 'l1', label: 'Single Visit', min: 75, max: 200, display: '$75 – $200' },
    { id: 'l2', label: 'Small Project', min: 200, max: 600, display: '$200 – $600' },
    { id: 'l3', label: 'Medium Project', min: 600, max: 2000, display: '$600 – $2,000' },
    { id: 'l4', label: 'Large Project', min: 2000, max: 8000, display: '$2,000 – $8,000' },
    { id: 'l5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Roofing: [
    { id: 'r1', label: 'Inspection / Small Repair', min: 150, max: 500, display: '$150 – $500' },
    { id: 'r2', label: 'Mid Repair', min: 500, max: 1500, display: '$500 – $1,500' },
    { id: 'r3', label: 'Partial Replacement', min: 1500, max: 5000, display: '$1,500 – $5,000' },
    { id: 'r4', label: 'Full Replacement', min: 5000, max: 20000, display: '$5,000 – $20,000' },
    { id: 'r5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
  Cleaning: [
    { id: 'cl1', label: 'Studio / 1BR', min: 80, max: 150, display: '$80 – $150' },
    { id: 'cl2', label: '2–3 Bedroom', min: 150, max: 300, display: '$150 – $300' },
    { id: 'cl3', label: '4+ Bedroom', min: 300, max: 500, display: '$300 – $500' },
    { id: 'cl4', label: 'Commercial', min: 200, max: 800, display: '$200 – $800' },
    { id: 'cl5', label: 'Get a Quote', min: 0, max: 0, display: 'Requesting Quote' },
  ],
};

export const ALL_TRADES = Object.keys(TRADE_JOBS);

export const TRADE_ICONS: Record<string, string> = {
  Electrical: '⚡',
  Plumbing: '🔧',
  HVAC: '❄️',
  Carpentry: '🪚',
  Handyman: '🔨',
  Painting: '🎨',
  Landscaping: '🌿',
  Roofing: '🏠',
  Cleaning: '🧹',
};

// ─── Comprehensive specialty lists by trade ───────────────────────────────────
export const TRADE_SPECIALTIES: Record<string, string[]> = {
  HVAC: [
    'AC Not Cooling', 'AC Not Turning On', 'AC Making Noise', 'AC Leaking Water', 'AC Frozen Coil',
    'AC Tune-Up', 'AC Maintenance', 'AC Installation', 'AC Replacement',
    'Central Air Installation', 'Central Air Repair',
    'Ductless Mini Split Installation', 'Ductless Mini Split Repair',
    'Thermostat Installation', 'Thermostat Repair', 'Smart Thermostat Setup',
    'Furnace Repair', 'Furnace Installation', 'Furnace Replacement', 'Furnace Maintenance',
    'Boiler Repair', 'Boiler Installation', 'Boiler Replacement',
    'Heat Pump Repair', 'Heat Pump Installation', 'Heat Pump Maintenance',
    'Air Handler Repair', 'Air Handler Replacement',
    'Condenser Repair', 'Condenser Replacement',
    'Refrigerant Leak Repair', 'Refrigerant Recharge',
    'Duct Repair', 'Duct Installation', 'Duct Cleaning', 'Vent Cleaning',
    'Indoor Air Quality Testing', 'Air Purifier Installation',
    'Humidifier Installation', 'Dehumidifier Installation', 'UV Light Installation',
    'Commercial HVAC Service', 'Emergency HVAC Service',
    'Rooftop Unit Repair', 'Walk-In Cooler Repair', 'Walk-In Freezer Repair',
    'Ice Machine Repair', 'Exhaust Fan Repair', 'Ventilation System Repair',
  ],
  Plumbing: [
    'Leak Repair', 'Pipe Repair', 'Pipe Replacement', 'Burst Pipe Repair',
    'Water Heater Repair', 'Water Heater Installation',
    'Tankless Water Heater Installation', 'Tankless Water Heater Repair',
    'Drain Cleaning', 'Clogged Sink', 'Clogged Toilet',
    'Sewer Line Repair', 'Sewer Line Replacement', 'Sewer Camera Inspection', 'Hydro Jetting',
    'Faucet Repair', 'Faucet Installation',
    'Sink Installation', 'Sink Repair',
    'Toilet Installation', 'Toilet Repair',
    'Shower Installation', 'Shower Repair',
    'Bathtub Installation', 'Bathtub Repair',
    'Garbage Disposal Repair', 'Garbage Disposal Installation',
    'Water Line Repair', 'Water Line Installation', 'Main Water Line Repair',
    'Gas Line Installation', 'Gas Line Repair',
    'Sump Pump Installation', 'Sump Pump Repair', 'Well Pump Repair',
    'Water Filtration Installation', 'Reverse Osmosis Installation',
    'Emergency Plumbing', 'Commercial Plumbing',
    'Backflow Testing', 'Backflow Prevention Installation',
  ],
  Carpentry: [
    'Custom Shelving', 'Crown Molding Installation', 'Baseboard Installation', 'Trim Work',
    'Interior Door Installation', 'Exterior Door Installation', 'Door Repair',
    'Window Trim Installation', 'Framing', 'Wall Framing', 'Basement Framing',
    'Deck Construction', 'Deck Repair',
    'Porch Construction', 'Porch Repair',
    'Fence Installation', 'Fence Repair',
    'Stair Construction', 'Stair Repair', 'Handrail Installation',
    'Cabinet Installation', 'Cabinet Repair',
    'Built-In Furniture', 'Entertainment Center Build', 'Closet Build-Out',
    'Wood Rot Repair', 'Custom Woodworking',
    'Pergola Construction', 'Gazebo Construction', 'Garage Shelving',
    'Custom Furniture', 'Commercial Carpentry',
  ],
  Handyman: [
    'TV Mounting', 'Furniture Assembly', 'Picture Hanging',
    'Curtain Installation', 'Blind Installation', 'Shelf Installation',
    'Drywall Patch Repair', 'Door Repair', 'Lock Installation',
    'Caulking', 'Grout Repair',
    'Minor Plumbing', 'Minor Electrical',
    'Ceiling Fan Installation', 'Light Fixture Replacement', 'Smoke Detector Installation',
    'Appliance Installation', 'Appliance Removal',
    'Gutter Cleaning', 'Fence Repair', 'Deck Repair',
    'Home Maintenance', 'Punch List Completion',
    'Move-In Repairs', 'Move-Out Repairs',
    'Property Maintenance', 'Rental Property Repairs',
  ],
  Roofing: [
    'Roof Leak Repair', 'Roof Inspection', 'Roof Replacement', 'Roof Installation',
    'Asphalt Shingle Roofing', 'Metal Roofing',
    'Flat Roof Repair', 'Flat Roof Installation',
    'Rubber Roof Repair', 'Tile Roof Repair', 'Slate Roof Repair',
    'Roof Vent Installation', 'Chimney Flashing Repair',
    'Skylight Installation', 'Skylight Repair',
    'Storm Damage Repair', 'Emergency Tarp Service', 'Roof Coating',
    'Commercial Roofing', 'Residential Roofing',
    'Gutter Installation', 'Gutter Repair', 'Gutter Replacement', 'Gutter Guard Installation',
    'Soffit Repair', 'Fascia Repair',
  ],
  Painting: [
    'Interior Painting', 'Exterior Painting', 'Room Painting', 'Whole House Painting',
    'Cabinet Painting', 'Cabinet Refinishing',
    'Deck Staining', 'Fence Staining', 'Fence Painting',
    'Wallpaper Removal', 'Wallpaper Installation',
    'Drywall Repair & Paint', 'Ceiling Painting', 'Trim Painting',
    'Door Painting', 'Garage Painting', 'Commercial Painting',
    'Pressure Washing Before Paint', 'Epoxy Floor Coating',
    'Wood Staining', 'Color Consultation', 'Touch-Up Painting',
  ],
  Cleaning: [
    'House Cleaning', 'Deep Cleaning', 'Move-In Cleaning', 'Move-Out Cleaning',
    'Apartment Cleaning', 'Condo Cleaning',
    'Office Cleaning', 'Commercial Cleaning',
    'Construction Cleanup', 'Post-Renovation Cleaning',
    'Carpet Cleaning', 'Upholstery Cleaning', 'Window Cleaning', 'Pressure Washing',
    'Floor Cleaning', 'Tile & Grout Cleaning',
    'Kitchen Deep Cleaning', 'Bathroom Deep Cleaning',
    'Airbnb Turnover Cleaning', 'Garage Cleaning', 'Basement Cleaning',
    'Hoarding Cleanup', 'Junk Removal',
    'Sanitization Service', 'Disinfection Service',
  ],
  Landscaping: [
    'Lawn Mowing', 'Weekly Lawn Service', 'Lawn Installation', 'Sod Installation',
    'Lawn Repair', 'Lawn Aeration', 'Lawn Seeding',
    'Mulch Installation', 'Garden Bed Installation', 'Garden Maintenance', 'Weed Removal',
    'Shrub Trimming', 'Hedge Trimming', 'Tree Trimming', 'Tree Removal', 'Stump Grinding',
    'Leaf Cleanup', 'Spring Cleanup', 'Fall Cleanup', 'Snow Removal',
    'Irrigation Installation', 'Sprinkler Repair', 'Sprinkler Installation',
    'Landscape Design',
    'Retaining Wall Installation', 'Paver Patio Installation', 'Walkway Installation',
    'Outdoor Lighting Installation', 'Drainage Solutions', 'French Drain Installation',
    'Artificial Turf Installation', 'Commercial Landscaping',
  ],
  Electrical: [
    'Outlet Installation', 'Outlet Repair', 'Light Fixture Installation', 'Recessed Lighting',
    'Breaker Panel Upgrade', 'Electrical Panel Replacement', 'Circuit Breaker Replacement',
    'EV Charger Installation', 'Wiring Repair', 'New Wiring', 'Rewiring',
    'Ceiling Fan Installation', 'Electrical Inspection', 'GFCI Installation',
    'Smoke Detector Installation', 'Smart Home Wiring', 'Generator Installation',
    'Outdoor Lighting', 'Landscape Lighting', 'Security Lighting',
    'Emergency Electrical', 'Commercial Electrical',
  ],
};

// Popular searches — always shown first in search and picker
export const POPULAR_SEARCHES: Record<string, string[]> = {
  HVAC:        ['AC Repair', 'AC Installation', 'Furnace Repair', 'Ductless Mini Split Installation', 'Emergency HVAC Service'],
  Plumbing:    ['Drain Cleaning', 'Leak Repair', 'Water Heater Repair', 'Sewer Line Repair', 'Emergency Plumbing'],
  Carpentry:   ['Deck Construction', 'Fence Installation', 'Custom Shelving', 'Interior Door Installation', 'Trim Work'],
  Handyman:    ['TV Mounting', 'Furniture Assembly', 'Drywall Patch Repair', 'Ceiling Fan Installation', 'Home Maintenance'],
  Roofing:     ['Roof Leak Repair', 'Roof Replacement', 'Roof Inspection', 'Gutter Repair', 'Storm Damage Repair'],
  Painting:    ['Interior Painting', 'Exterior Painting', 'Cabinet Painting', 'Wallpaper Removal', 'Deck Staining'],
  Cleaning:    ['Deep Cleaning', 'Move-Out Cleaning', 'House Cleaning', 'Construction Cleanup', 'Office Cleaning'],
  Landscaping: ['Lawn Mowing', 'Mulch Installation', 'Tree Removal', 'Paver Patio Installation', 'Spring Cleanup'],
  Electrical:  ['EV Charger Installation', 'Breaker Panel Upgrade', 'Light Fixture Installation', 'Ceiling Fan Installation', 'Outlet Installation'],
};

export const ALL_TRADE_SPECIALTIES: string[] = Object.values(TRADE_SPECIALTIES).flat().filter((v, i, a) => a.indexOf(v) === i);
export const ALL_POPULAR_SEARCHES: string[]  = Object.values(POPULAR_SEARCHES).flat().filter((v, i, a) => a.indexOf(v) === i);