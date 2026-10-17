// Ported logic from the original organize_photos.py — kept deliberately faithful
// so the identity document stays grounded in what already existed.

export const DEFAULT_CATEGORIES: { name: string; group: string }[] = [
  ["earbuds","Audio"],["headphones","Audio"],["speaker","Audio"],["phone","Phones & Tablets"],["tablet","Phones & Tablets"],["laptop","Computers"],
  ["camera","Cameras"],["watch","Wearables"],["fitness tracker","Wearables"],["smartwatch","Wearables"],["gaming console","Gaming"],["controller","Gaming"],
  ["tv","Home Tech"],["monitor","Computers"],["keyboard","Computers"],["mouse","Computers"],["drone","Cameras"],["printer","Home Tech"],
  ["router","Home Tech"],["hard drive","Computers"],["ssd","Computers"],["usb drive","Computers"],["charger","Accessories"],["cable","Accessories"],
  ["case","Accessories"],["bag","Fashion"],["backpack","Fashion"],["clothing","Fashion"],["shoes","Fashion"],["jewelry","Fashion"],
  ["furniture","Home"],["tool","Home"],["kitchen appliance","Home"],["book","Media"],["toy","Kids & Toys"],["game","Gaming"],
  ["movie","Media"],["music","Media"],["sports equipment","Outdoors"],["outdoor gear","Outdoors"],["automotive","Auto"],["baby gear","Kids & Toys"],
  ["pet supplies","Pets"],["office supplies","Home"],["art","Collectibles"],["collectible","Collectibles"],["electronics","General"],["accessory","Accessories"],["miscellaneous","General"],
].map(([name, group]) => ({ name, group }));

export const BRAND_NAMES: Record<string, string> = {
  apple:"Apple", samsung:"Samsung", sony:"Sony", lg:"LG", dell:"Dell", hp:"HP", lenovo:"Lenovo", asus:"ASUS", acer:"Acer", microsoft:"Microsoft", google:"Google", amazon:"Amazon",
  bose:"Bose", jbl:"JBL", sonos:"Sonos", beats:"Beats", skullcandy:"Skullcandy", sennheiser:"Sennheiser",
  fitbit:"Fitbit", garmin:"Garmin", nike:"Nike", adidas:"Adidas", playstation:"PlayStation", xbox:"Xbox", nintendo:"Nintendo",
  canon:"Canon", nikon:"Nikon", gopro:"GoPro", dji:"DJI", roku:"Roku", iphone:"Apple", airpods:"Apple", galaxy:"Samsung", pixel:"Google",
};

// Synonyms the original script missed, added as an identity-doc decision (resellers name files loosely)
const SYNONYMS: [RegExp, string][] = [
  [/earbud|airpod|buds|qc\s?ultra|quietcomfort/, "earbuds"],
  [/headphone|headset|over.?ear/, "headphones"],
  [/speaker|soundlink|boombox|soundbar/, "speaker"],
  [/iphone|galaxy|pixel|phone|smartphone/, "phone"],
  [/ipad|tablet/, "tablet"],
  [/macbook|laptop|notebook|chromebook|thinkpad/, "laptop"],
  [/camera|canon|nikon|gopro|dslr|eos/, "camera"],
  [/smartwatch|apple.?watch/, "smartwatch"],
  [/fitbit|garmin|fitness|tracker/, "fitness tracker"],
  [/watch/, "watch"],
  [/ps5|ps4|playstation|xbox|nintendo|switch|console/, "gaming console"],
  [/controller|gamepad|joycon|dualsense/, "controller"],
  [/keyboard/, "keyboard"], [/mouse/, "mouse"], [/monitor|display/, "monitor"], [/\btv\b|television/, "tv"],
  [/drone|mavic|dji/, "drone"], [/shoe|sneaker|nike|adidas|jordan|boot/, "shoes"], [/bag|purse|tote/, "bag"], [/backpack/, "backpack"],
  [/jacket|shirt|dress|clothing|hoodie/, "clothing"], [/chair|desk|table|sofa|furniture|lamp/, "furniture"],
  [/drill|tool|wrench|dewalt|makita/, "tool"], [/charger/, "charger"], [/cable|cord/, "cable"], [/case|cover/, "case"],
  [/toy|lego|figure/, "toy"], [/book|novel/, "book"], [/ring|necklace|jewelry|bracelet/, "jewelry"],
];

export type Classified = { originalName: string; category: string; brand: string; folderName: string; newName: string; confidence: number; method: string };

function clean(s: string) { return s.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim(); }
function title(s: string) { return s.split(" ").map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" "); }
function hashN(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997; return h / 997; }

export function classifyOne(filename: string, activeCategories: string[], threshold: number): Omit<Classified, "newName"> {
  const lower = filename.toLowerCase().replace(/\.(jpg|jpeg|png|webp|gif|bmp)$/, "");
  // brand
  let brand = "";
  let brandModel = "";
  for (const [key, pretty] of Object.entries(BRAND_NAMES)) {
    if (lower.includes(key)) {
      brand = pretty;
      const after = lower.split(key)[1] || "";
      const words = after.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !/^\d+$/.test(w) && !["img","photo","front","back","side","top"].includes(w)).slice(0, 3);
      brandModel = words.join(" ");
      break;
    }
  }
  // category via synonym, then direct category word
  let category = "";
  for (const [re, cat] of SYNONYMS) if (re.test(lower) && activeCategories.includes(cat)) { category = cat; break; }
  if (!category) for (const c of activeCategories) if (lower.includes(c.split(" ")[0])) { category = c; break; }

  const jitter = hashN(lower) * 0.08;
  let confidence = 0.42 + jitter, method = "needs review";
  if (category && brand) { confidence = 0.88 + jitter; method = "AI + brand"; }
  else if (category) { confidence = 0.76 + jitter; method = "AI (CLIP)"; }
  else if (brand) { confidence = 0.68 + jitter; method = "filename"; category = "electronics"; }
  if (/img_|dsc|pxl|mvimg|^img|screenshot/.test(lower) && !category) { confidence = 0.38 + jitter; }
  if (!category || confidence < threshold) {
    // mirrors original: filename fallback, else uncategorized — never guess silently
    if (category && confidence >= threshold - 0.12) { method = "filename fallback"; }
    else { category = "uncategorized"; }
  }
  let folderName = "Uncategorized";
  if (category !== "uncategorized") {
    folderName = brand ? `${brand} ${title(clean(brandModel || category))}`.trim() : title(category);
    // keep brand folders sane: "Bose Qc Ultra Earbuds" not "Bose Earbuds 01 Front"
    if (folderName.split(" ").length > 4) folderName = folderName.split(" ").slice(0, 4).join(" ");
  }
  return { originalName: filename, category, brand, folderName, confidence: Math.min(0.98, +confidence.toFixed(2)), method };
}

export function classifyBatch(filenames: string[], activeCategories: string[], threshold: number): Classified[] {
  const counters: Record<string, number> = {};
  return filenames.map(fn => {
    const c = classifyOne(fn, activeCategories, threshold);
    const ext = (fn.match(/\.[^.]+$/)?.[0] || ".jpg").toLowerCase();
    const base = clean(c.folderName).replace(/\s+/g, "_");
    counters[c.folderName] = (counters[c.folderName] || 0) + 1;
    const n = counters[c.folderName];
    return { ...c, newName: n > 1 ? `${base}_${n}${ext}` : `${base}${ext}` };
  });
}

export const SAMPLE_BOSE = [
  "bose_qc_ultra_earbuds_case_open.jpg","bose_qc_ultra_earbuds_left.jpg","bose_qc_ultra_earbuds_right.jpg","bose_soundlink_speaker_front.jpg","bose_soundlink_speaker_back.jpg",
  "bose_quietcomfort_headphones_01.jpg","bose_quietcomfort_headphones_02.jpg","IMG_4821.jpg","IMG_4822.jpg","bose_earbuds_charging_cable.jpg","sony_headphones_xm5.jpg","jbl_speaker_flip.jpg","apple_airpods_case.jpg","unknown_item_photo.png"
];
export const SAMPLE_MIXED = [
  "samsung_galaxy_s23_phone_front.jpg","samsung_galaxy_s23_phone_back.jpg","nike_air_jordan_shoes_pair.jpg","nike_air_jordan_shoes_sole.jpg","canon_eos_camera_body.jpg","canon_eos_camera_lens.jpg",
  "ps5_playstation_console.jpg","ps5_dualsense_controller.jpg","dell_laptop_open.jpg","ipad_tablet_screen.jpg","garmin_fitness_tracker.jpg","dji_mavic_drone.jpg","dewalt_drill_tool.jpg","leather_bag_tote.jpg","wooden_chair_furniture.jpg","IMG_9910.jpg","DSC_0034.jpg","kitchen_blender_appliance.jpg"
];

export const THUMB_POOL = [
  "https://images.pexels.com/photos/30981655/pexels-photo-30981655.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/7812322/pexels-photo-7812322.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/33797659/pexels-photo-33797659.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/7857497/pexels-photo-7857497.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/26559664/pexels-photo-26559664.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
  "https://images.pexels.com/photos/11002709/pexels-photo-11002709.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
];
