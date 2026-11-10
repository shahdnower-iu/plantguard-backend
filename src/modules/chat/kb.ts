// src/modules/chat/kb.ts
// ─────────────────────────────────────────────────────────────────────────────
// PlantGuard Knowledge Base — single source of truth.
//
// Both chat.service.ts (disk-cache / pgvector retrieval) and the ingestion
// script (scripts/ingest-kb.ts) import from here so there is never a mismatch
// between what was indexed and what the service uses.
//
// To add a new disease entry:
//   1. Add an object to KNOWLEDGE_BASE below.
//   2. Bump KB_VERSION (e.g. 'v2') so the disk cache is invalidated on
//      the next restart and pgvector is re-ingested by the script.
// ─────────────────────────────────────────────────────────────────────────────

export const KB_VERSION = 'v1';

export interface KBEntry {
  label:    string;      // classifier label
  title:    string;      // human display name
  keywords: string[];    // scoring keywords
  content:  string;      // prompt-injection content
}

export const KNOWLEDGE_BASE: KBEntry[] = [

  // ── APPLE ─────────────────────────────────────────────────────────────────

  {
    label: 'Apple___Apple_scab',
    title: 'Apple Scab',
    keywords: ['apple', 'scab', 'venturia', 'dark spots', 'lesions', 'fruit scab', 'olive brown'],
    content: `DISEASE: Apple Scab (Venturia inaequalis — fungal)
AFFECTED PLANT: Apple (Malus domestica)
SYMPTOMS: Olive-brown to black velvety lesions on leaves and fruit. Leaves may yellow and drop early. Fruit shows dark, corky, cracked spots that reduce marketability.
TREATMENT:
  • Apply fungicides at green tip and petal fall: myclobutanil, captan, or mancozeb.
  • Remove and destroy all fallen leaves (primary inoculum source).
  • Prune for better canopy airflow.
PREVENTION:
  • Plant scab-resistant apple varieties (e.g. Liberty, Enterprise, GoldRush).
  • Apply dormant copper sprays before bud break.
  • Avoid overhead irrigation; water at the base.
SEVERITY: High — can cause complete defoliation and unmarketable fruit in wet seasons.
URGENCY: Begin protective sprays at first bud swell; do not wait for symptoms.`,
  },

  {
    label: 'Apple___Black_rot',
    title: 'Apple Black Rot',
    keywords: ['apple', 'black rot', 'botryosphaeria', 'frog eye', 'canker', 'fruit rot', 'mummified'],
    content: `DISEASE: Apple Black Rot (Botryosphaeria obtusa — fungal)
AFFECTED PLANT: Apple (Malus domestica)
SYMPTOMS: Circular "frog-eye" leaf spots (purple border, tan center). Fruit develops black, rotted areas that mummify on the tree. Cankers appear as sunken, dark areas on bark.
TREATMENT:
  • Remove mummified fruit and cankered wood immediately.
  • Apply captan or thiophanate-methyl fungicides during the growing season.
  • Prune 15 cm below visible canker tissue; sterilise tools between cuts.
PREVENTION:
  • Maintain tree vigour with balanced nutrition (avoid excessive nitrogen).
  • Remove dead wood annually during dormancy.
  • Control fire blight and other wounds that serve as entry points.
SEVERITY: Moderate–High. Mummified fruit can re-infect for multiple seasons.
URGENCY: Remove mummies and cankers before spring to break the cycle.`,
  },

  {
    label: 'Apple___Cedar_apple_rust',
    title: 'Cedar Apple Rust',
    keywords: ['apple', 'cedar', 'rust', 'gymnosporangium', 'orange spots', 'hawthorn', 'juniper', 'alternate host'],
    content: `DISEASE: Cedar Apple Rust (Gymnosporangium juniperi-virginianae — fungal, obligate two-host)
AFFECTED PLANT: Apple; alternate host is Eastern Red Cedar / Juniper
SYMPTOMS: Bright orange-yellow spots on upper leaf surface in spring; tube-like spore structures (aecia) on leaf undersides. Infected fruit develops distorted, corky lesions.
TREATMENT:
  • Apply myclobutanil or propiconazole fungicides from pink bud through second cover spray.
  • Remove nearby juniper/cedar galls (orange gelatinous masses in spring) within a 1–2 km radius where feasible.
PREVENTION:
  • Plant rust-resistant apple varieties (e.g. Liberty, Redfree, William's Pride).
  • Do not plant apples near juniper windbreaks.
SEVERITY: Moderate. Rarely kills trees but reduces yield and fruit quality significantly.
URGENCY: Protective sprays must start at pink bud — post-infection treatment is ineffective.`,
  },

  {
    label: 'Apple___healthy',
    title: 'Healthy Apple',
    keywords: ['apple', 'healthy', 'normal', 'good condition'],
    content: `PLANT: Apple (Malus domestica) — Healthy
The apple plant appears healthy. Continue standard care:
  • Water deeply but infrequently (30 cm soil depth); avoid waterlogging.
  • Apply balanced NPK fertiliser in early spring before bud break.
  • Prune during dormancy to maintain an open canopy for light and airflow.
  • Monitor weekly for early signs of scab, rust, or fire blight especially during wet spring weather.
  • Apply dormant oil spray in late winter to control overwintering mites and scale insects.`,
  },

  // ── CHERRY ────────────────────────────────────────────────────────────────

  {
    label: 'Cherry_(including_sour)___Powdery_mildew',
    title: 'Cherry Powdery Mildew',
    keywords: ['cherry', 'powdery mildew', 'podosphaera', 'white powder', 'fungal', 'sour cherry'],
    content: `DISEASE: Cherry Powdery Mildew (Podosphaera clandestina — fungal)
AFFECTED PLANT: Sweet and Sour Cherry (Prunus avium / P. cerasus)
SYMPTOMS: White, powdery fungal growth on young leaves, shoots, and fruit. Affected leaves curl and distort. Severely infected leaves may drop early.
TREATMENT:
  • Apply sulphur-based or potassium bicarbonate fungicides at first sign.
  • Myclobutanil and trifloxystrobin are effective systemic options.
  • Remove and destroy heavily infected shoots.
PREVENTION:
  • Avoid excessive nitrogen fertilisation (promotes lush, susceptible growth).
  • Prune for open canopy structure; good airflow reduces humidity.
  • Plant resistant varieties where available.
SEVERITY: Moderate. Rarely fatal but weakens trees and reduces fruit quality.
URGENCY: Act at first sign of white powder — early treatment is far more effective.`,
  },

  {
    label: 'Cherry_(including_sour)___healthy',
    title: 'Healthy Cherry',
    keywords: ['cherry', 'healthy', 'normal'],
    content: `PLANT: Cherry (Prunus avium / P. cerasus) — Healthy
The cherry plant appears healthy. Recommended care:
  • Water regularly during fruit development; reduce after harvest.
  • Fertilise with balanced NPK in early spring; avoid late-season nitrogen.
  • Monitor for brown rot (Monilinia) during wet periods around harvest.
  • Check for cherry leaf spot (Blumeriella jaapii) — circular purple spots on leaves.
  • Net trees against birds as fruit ripens.`,
  },

  // ── CORN (MAIZE) ──────────────────────────────────────────────────────────

  {
    label: 'Corn_(maize)___Northern_Leaf_Blight',
    title: 'Corn Northern Leaf Blight',
    keywords: ['corn', 'maize', 'northern leaf blight', 'exserohilum', 'cigar shaped lesions', 'grey lesions'],
    content: `DISEASE: Northern Corn Leaf Blight (Exserohilum turcicum — fungal)
AFFECTED PLANT: Corn / Maize (Zea mays)
SYMPTOMS: Long (2.5–15 cm), elliptical, greyish-green to tan "cigar-shaped" lesions on leaves. Lesions run parallel to leaf veins. Severe infection causes large portions of foliage to die, reducing photosynthesis and yield.
TREATMENT:
  • Apply propiconazole, azoxystrobin, or pyraclostrobin fungicides at tasselling when lesions appear on lower leaves.
  • Fungicide is most cost-effective when applied before 50% of plants show lesions.
PREVENTION:
  • Plant resistant hybrids (check local seed catalogues for NLB resistance ratings).
  • Rotate crops — avoid continuous maize; the pathogen survives on infected residue.
  • Till or incorporate crop residue after harvest to reduce inoculum.
SEVERITY: High in susceptible hybrids during warm, wet seasons — can cause 30–50% yield loss.
URGENCY: Scout at tasselling; apply fungicide within 7 days of first lesion observation.`,
  },

  {
    label: 'Corn_(maize)___Common_rust_',
    title: 'Corn Common Rust',
    keywords: ['corn', 'maize', 'rust', 'puccinia', 'orange pustules', 'powdery rust', 'brick red'],
    content: `DISEASE: Common Corn Rust (Puccinia sorghi — fungal)
AFFECTED PLANT: Corn / Maize (Zea mays)
SYMPTOMS: Small, oval, brick-red to cinnamon-brown powdery pustules (uredinia) scattered on both leaf surfaces. Pustules later turn dark brown/black (telia) as the season progresses.
TREATMENT:
  • Apply triazole or strobilurin fungicides if rust appears before or at silking on susceptible hybrids.
  • A single well-timed fungicide application is usually sufficient.
PREVENTION:
  • Plant resistant or tolerant hybrids — this is the most cost-effective strategy.
  • Common rust rarely overwinters in temperate regions; spores blow in from tropical areas.
SEVERITY: Generally low–moderate in temperate climates. High in tropical/subtropical regions on susceptible hybrids.
URGENCY: Economic damage is most likely when infection occurs before silking in susceptible varieties.`,
  },

  {
    label: 'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot',
    title: 'Corn Gray Leaf Spot',
    keywords: ['corn', 'maize', 'gray leaf spot', 'grey leaf spot', 'cercospora', 'rectangular lesions'],
    content: `DISEASE: Gray Leaf Spot / Cercospora Leaf Spot (Cercospora zeae-maydis — fungal)
AFFECTED PLANT: Corn / Maize (Zea mays)
SYMPTOMS: Rectangular, tan to grey lesions with parallel edges running between leaf veins. Lesions have a distinct blocky shape. Severe infection causes leaves to die from the tip downward.
TREATMENT:
  • Apply azoxystrobin, pyraclostrobin, or propiconazole at VT (tasselling) stage.
  • Fungicide is most beneficial in high-risk environments (continuous corn, minimum tillage, humid regions).
PREVENTION:
  • Crop rotation — pathogen survives on corn residue; rotation breaks the cycle.
  • Plant resistant hybrids.
  • Tillage reduces surface residue and inoculum levels.
SEVERITY: High — one of the most yield-limiting foliar diseases of corn globally.
URGENCY: Scout from V8 onwards; treat before lesions appear on the ear leaf.`,
  },

  {
    label: 'Corn_(maize)___healthy',
    title: 'Healthy Corn',
    keywords: ['corn', 'maize', 'healthy', 'normal'],
    content: `PLANT: Corn / Maize (Zea mays) — Healthy
The corn plant appears healthy. Standard care tips:
  • Ensure adequate nitrogen — side-dress at V6 stage if soil tests indicate deficiency.
  • Maintain consistent moisture especially from V8 through grain fill.
  • Scout weekly for aphids, western corn rootworm, and early signs of leaf diseases.
  • Avoid waterlogged soils — promotes root rot and Goss's wilt.`,
  },

  // ── GRAPE ─────────────────────────────────────────────────────────────────

  {
    label: 'Grape___Black_rot',
    title: 'Grape Black Rot',
    keywords: ['grape', 'black rot', 'guignardia', 'mummified berries', 'leaf spots', 'berry rot'],
    content: `DISEASE: Grape Black Rot (Guignardia bidwellii — fungal)
AFFECTED PLANT: Grapevine (Vitis vinifera and hybrids)
SYMPTOMS: Circular tan leaf spots with dark borders. Infected berries turn brown, then shrivel and mummify into hard, black, wrinkled raisins that cling to the cluster.
TREATMENT:
  • Apply myclobutanil, mancozeb, or captan from bud break through 4–6 weeks after bloom.
  • Remove and destroy all mummified berries — primary overwintering inoculum.
  • Fungicide timing is critical: protect from bloom to 4 weeks post-bloom.
PREVENTION:
  • Trellis and prune for open canopy and rapid leaf drying.
  • Avoid wetting foliage during irrigation.
  • Site vineyards with good air drainage.
SEVERITY: Very High — can destroy 100% of the crop in a wet year if uncontrolled.
URGENCY: Start protective sprays at early shoot growth; do not delay until symptoms appear.`,
  },

  {
    label: 'Grape___Esca_(Black_Measles)',
    title: 'Grape Esca (Black Measles)',
    keywords: ['grape', 'esca', 'black measles', 'wood disease', 'tiger stripe', 'trunk disease', 'apoplexy'],
    content: `DISEASE: Esca / Black Measles (complex of wood-decay fungi: Phaeomoniella, Phaeoacremonium, Fomitiporia)
AFFECTED PLANT: Grapevine (Vitis vinifera)
SYMPTOMS: "Tiger-stripe" pattern on leaves (yellow/red stripes between veins). Berries develop dark purple spots (measles). Sudden vine collapse (apoplexy) can occur in hot weather. Internal wood shows brown streaking.
TREATMENT:
  • No effective curative chemical treatment exists once established.
  • Remove and burn severely affected wood or entire vines.
  • Sodium arsenite (banned in many countries) was historically used; not recommended.
  • Biological agents (Trichoderma) applied to pruning wounds show some promise.
PREVENTION:
  • Make clean pruning cuts; seal immediately with fungicidal wound paint (containing Trichoderma or thiophanate-methyl).
  • Prune during dry weather to minimise spore germination.
  • Delay pruning until after the coldest part of winter.
  • Use certified disease-free planting material.
SEVERITY: Very High — a chronic, incurable disease causing significant economic losses in established vineyards.
URGENCY: Prevention at pruning is the only reliable management strategy.`,
  },

  {
    label: 'Grape___Leaf_blight_(Isariopsis_Leaf_Spot)',
    title: 'Grape Leaf Blight (Isariopsis Leaf Spot)',
    keywords: ['grape', 'leaf blight', 'isariopsis', 'pseudocercospora', 'angular spots', 'brown spots grape'],
    content: `DISEASE: Grape Leaf Blight / Isariopsis Leaf Spot (Pseudocercospora vitis — fungal)
AFFECTED PLANT: Grapevine (Vitis vinifera)
SYMPTOMS: Angular, dark brown to black spots on leaf upper surface, limited by leaf veins. Undersides show grey-brown sporulation. Heavy infection causes premature defoliation.
TREATMENT:
  • Apply copper-based fungicides, mancozeb, or azoxystrobin at first sign.
  • Repeat applications every 10–14 days during wet periods.
PREVENTION:
  • Remove and destroy fallen infected leaves.
  • Maintain open canopy through proper shoot positioning and leaf removal.
  • Avoid overhead irrigation.
SEVERITY: Moderate. Rarely causes direct berry loss but defoliation weakens vines and reduces next year's fruitfulness.
URGENCY: Protect canopy integrity through to harvest — late-season defoliation is especially harmful.`,
  },

  {
    label: 'Grape___healthy',
    title: 'Healthy Grape',
    keywords: ['grape', 'healthy', 'normal', 'grapevine'],
    content: `PLANT: Grapevine (Vitis vinifera) — Healthy
The grapevine appears healthy. Recommended care:
  • Prune to 2-bud spurs or canes according to your training system each dormant season.
  • Monitor for downy mildew (Plasmopara viticola) and powdery mildew (Erysiphe necator) — both common in humid conditions.
  • Apply potassium at veraison (colour change) to improve fruit quality.
  • Check soil pH; grapes prefer 5.5–6.5. Apply lime if too acidic.
  • Scout for grape berry moth and mealybug during the growing season.`,
  },

  // ── ORANGE ────────────────────────────────────────────────────────────────

  {
    label: 'Orange___Haunglongbing_(Citrus_greening)',
    title: 'Citrus Greening (HLB)',
    keywords: ['orange', 'citrus', 'greening', 'HLB', 'huanglongbing', 'yellow shoots', 'blotchy mottling', 'psyllid', 'lopsided fruit'],
    content: `DISEASE: Huanglongbing / Citrus Greening (Candidatus Liberibacter asiaticus — bacterial, vectored by Asian citrus psyllid)
AFFECTED PLANT: All citrus species, especially Orange, Mandarin, Lemon, Grapefruit
SYMPTOMS: Asymmetric, blotchy yellow mottling on leaves (unlike nutrient deficiency which is symmetric). "Greening" — fruit remains partially green and tastes bitter. Lopsided fruit with aborted seeds. Progressive decline and dieback.
TREATMENT:
  • NO CURE exists — infected trees cannot be cured and will decline.
  • Remove and immediately destroy infected trees to prevent psyllid spread.
  • Aggressively control the Asian citrus psyllid (Diaphorina citri) with imidacloprid, spirotetramat, or horticultural oil on remaining trees.
  • Nutritional support (foliar micronutrients) may extend productive life but does not cure.
PREVENTION:
  • Source trees from certified HLB-free nurseries only.
  • Establish psyllid monitoring with yellow sticky traps.
  • Apply systemic insecticides to protect against psyllid colonisation.
  • Inspect new plantings and quarantine any suspicious trees immediately.
SEVERITY: CRITICAL — the most destructive citrus disease worldwide. There is no recovery once infected.
URGENCY: Inspect every 2 weeks during flush periods; any suspected tree must be reported to local agricultural authorities immediately.`,
  },

  {
    label: 'Orange__Healthy_Leaf',
    title: 'Healthy Orange',
    keywords: ['orange', 'citrus', 'healthy', 'normal'],
    content: `PLANT: Orange / Citrus — Healthy
The citrus plant appears healthy. Key care practices:
  • Irrigate deeply but allow top 5 cm to dry between waterings — citrus is drought-tolerant once established.
  • Apply citrus-specific slow-release fertiliser 3 times per year (spring, summer, autumn).
  • Monitor for Asian citrus psyllid (small, waxy white tubes on new flush) — highest risk during spring and autumn flush.
  • Check for citrus leafminer on new growth — look for silvery serpentine mines in young leaves.
  • Maintain mulch 15 cm from trunk to conserve moisture and suppress weeds.`,
  },

  // ── PEACH ─────────────────────────────────────────────────────────────────

  {
    label: 'Peach___Bacterial_spot',
    title: 'Peach Bacterial Spot',
    keywords: ['peach', 'bacterial spot', 'xanthomonas', 'water-soaked lesions', 'shot holes', 'fruit pitting'],
    content: `DISEASE: Peach Bacterial Spot (Xanthomonas arboricola pv. pruni — bacterial)
AFFECTED PLANT: Peach, Nectarine, Plum, Cherry (Prunus spp.)
SYMPTOMS: Small, water-soaked lesions on leaves that turn angular and dark. Centers fall out creating "shot holes". Fruit shows small, sunken, water-soaked spots that crack. Severe defoliation weakens trees significantly.
TREATMENT:
  • Apply copper-based bactericides (copper hydroxide, copper sulphate) from early shoot growth.
  • Oxytetracycline (where legally permitted) is effective.
  • Remove and destroy infected tissue.
  • Note: resistance to copper is increasing; rotate with other permitted bactericides.
PREVENTION:
  • Plant resistant or tolerant peach varieties.
  • Avoid overhead irrigation — water splashes spread bacteria.
  • Site orchards to maximise airflow and leaf drying.
  • Avoid excessive nitrogen which promotes susceptible succulent growth.
SEVERITY: High in warm, wet, windy conditions. Can cause complete defoliation and unmarketable fruit.
URGENCY: Begin copper sprays at shuck split; maintain programme throughout wet periods.`,
  },

  {
    label: 'Peach___healthy',
    title: 'Healthy Peach',
    keywords: ['peach', 'healthy', 'normal'],
    content: `PLANT: Peach (Prunus persica) — Healthy
The peach tree appears healthy. Recommended care:
  • Thin fruit to 15–20 cm apart when marble-sized to improve fruit size and reduce limb breakage.
  • Apply dormant copper spray to prevent peach leaf curl (Taphrina deformans).
  • Monitor for oriental fruit moth and peach twig borer from bloom onwards.
  • Prune annually to an open-centre shape for maximum light penetration.
  • Peaches need 600–900 chill hours; verify your variety suits your climate.`,
  },

  // ── PEPPER ────────────────────────────────────────────────────────────────

  {
    label: 'Pepper,_bell___Bacterial_spot',
    title: 'Pepper Bacterial Spot',
    keywords: ['pepper', 'bell pepper', 'bacterial spot', 'xanthomonas', 'water-soaked', 'scab', 'capsicum'],
    content: `DISEASE: Pepper Bacterial Spot (Xanthomonas euvesicatoria — bacterial)
AFFECTED PLANT: Bell Pepper, Chilli Pepper (Capsicum annuum and related spp.)
SYMPTOMS: Small, water-soaked, irregular lesions on leaves that enlarge and turn dark brown with yellow halos. Lesions on fruit appear as raised, scab-like spots. Severe defoliation and fruit loss can occur.
TREATMENT:
  • Apply copper hydroxide or copper sulphate + mancozeb mixtures preventatively.
  • Remove heavily infected plants to reduce inoculum spread.
  • Avoid working in the field when plants are wet.
PREVENTION:
  • Use certified disease-free or hot-water-treated seed (50°C for 25 minutes).
  • Plant resistant varieties where available.
  • Avoid overhead irrigation; use drip irrigation.
  • Rotate crops — avoid planting Solanaceae in the same field for 2–3 years.
SEVERITY: High in warm, wet conditions. A single rainstorm can spread bacteria across an entire field.
URGENCY: Start copper sprays before first symptom in high-risk periods. Reactive treatment is much less effective.`,
  },

  {
    label: 'Pepper,_bell___healthy',
    title: 'Healthy Bell Pepper',
    keywords: ['pepper', 'bell pepper', 'capsicum', 'healthy', 'normal'],
    content: `PLANT: Bell Pepper (Capsicum annuum) — Healthy
The pepper plant appears healthy. Key care tips:
  • Maintain consistent soil moisture — irregular watering causes blossom end rot.
  • Fertilise with moderate nitrogen; excess nitrogen delays fruiting.
  • Support plants with stakes at 30 cm height to prevent stem breakage.
  • Monitor for aphids on growing tips and for thrips (silvery scarring on fruit).
  • Peppers prefer daytime temperatures of 21–29°C; fruit set drops above 32°C.`,
  },

  // ── POTATO ────────────────────────────────────────────────────────────────

  {
    label: 'Potato___Early_blight',
    title: 'Potato Early Blight',
    keywords: ['potato', 'early blight', 'alternaria', 'target spots', 'concentric rings', 'solanum'],
    content: `DISEASE: Potato Early Blight (Alternaria solani — fungal)
AFFECTED PLANT: Potato (Solanum tuberosum); also affects Tomato
SYMPTOMS: Dark brown to black, circular to angular lesions with distinctive concentric rings (target-board or bull's-eye pattern). Lesions have yellow halos. Lower leaves affected first; disease progresses upward. Severe defoliation reduces tuber yield.
TREATMENT:
  • Apply chlorothalonil, mancozeb, or azoxystrobin fungicides preventatively.
  • Begin applications 2–3 weeks before the expected appearance of symptoms.
  • Maintain 7–10 day spray intervals during wet weather.
PREVENTION:
  • Use certified disease-free seed potatoes.
  • Maintain plant nutrition — stressed, nutrient-deficient plants are most susceptible.
  • Destroy volunteer potatoes and crop debris after harvest.
  • Practice 3–4 year crop rotation.
SEVERITY: Moderate–High. Most severe during warm (24–29°C), humid conditions with heavy dews.
URGENCY: Begin protective spray programme at row closure (canopy closure). Don't wait for symptoms.`,
  },

  {
    label: 'Potato___Late_blight',
    title: 'Potato Late Blight',
    keywords: ['potato', 'late blight', 'phytophthora', 'water-soaked', 'grey mould', 'famine', 'rotting tuber'],
    content: `DISEASE: Potato Late Blight (Phytophthora infestans — oomycete / water mould)
AFFECTED PLANT: Potato (Solanum tuberosum); also affects Tomato
SYMPTOMS: Pale green to brown, water-soaked lesions that rapidly expand — often with a greasy appearance. White, cottony sporulation visible on leaf undersides in humid conditions. Infected tubers show reddish-brown internal rotting. Disease can spread from field to field within days.
TREATMENT:
  • Apply cymoxanil, metalaxyl-M (mefenoxam), mandipropamid, or fluopicolide fungicides.
  • For established infections, systemic fungicides (metalaxyl-M) are essential; contact fungicides alone are insufficient.
  • Destroy affected haulms (top growth) before harvest if infection is severe.
PREVENTION:
  • Use certified disease-free seed; avoid planting infected tubers.
  • Plant resistant varieties (e.g. Sarpo Mira, Defender).
  • Apply preventative fungicides when conditions favour disease (cool: 10–20°C, wet/humid).
  • Destroy cull piles and volunteer potatoes — major inoculum sources.
  • Avoid overhead irrigation; water in the morning.
SEVERITY: CRITICAL — caused the Irish Potato Famine (1845–1849). Can destroy an unprotected crop within 2 weeks in favourable conditions.
URGENCY: Respond immediately — this is the most urgent plant disease in the knowledge base. Call your local agricultural extension officer if unsure.`,
  },

  {
    label: 'Potato___healthy',
    title: 'Healthy Potato',
    keywords: ['potato', 'healthy', 'normal'],
    content: `PLANT: Potato (Solanum tuberosum) — Healthy
The potato plant appears healthy. Key management points:
  • Hill (mound soil around stems) twice during the season to increase tuber production and prevent greening.
  • Monitor weekly for Colorado potato beetle — hand-pick egg masses from leaf undersides.
  • Ensure adequate potassium for tuber quality; deficiency shows as scorched leaf margins.
  • Avoid wetting foliage when irrigating — reduces late blight risk.
  • Harvest when vines have died back; cure tubers at 10–15°C for 2 weeks before storage.`,
  },

  // ── STRAWBERRY ────────────────────────────────────────────────────────────

  {
    label: 'Strawberry___Leaf_scorch',
    title: 'Strawberry Leaf Scorch',
    keywords: ['strawberry', 'leaf scorch', 'diplocarpon', 'purple spots', 'scorched margins', 'fragaria'],
    content: `DISEASE: Strawberry Leaf Scorch (Diplocarpon earlianum — fungal)
AFFECTED PLANT: Strawberry (Fragaria × ananassa)
SYMPTOMS: Numerous small, dark purple to red spots on the upper leaf surface with no distinct centre (unlike leaf spot). Spots coalesce, giving the leaf a "scorched" appearance. Leaf undersides may show grey sporulation. Severe infection causes foliage death.
TREATMENT:
  • Apply captan, myclobutanil, or azoxystrobin fungicides.
  • Remove and destroy heavily infected leaves.
  • Improve air circulation around plants.
PREVENTION:
  • Plant resistant varieties.
  • Use drip irrigation rather than overhead; wet leaves spread spores.
  • Renovate matted rows after harvest — mow, thin, and fertilise to promote healthy regrowth.
  • Remove old, infected foliage in autumn.
SEVERITY: Moderate. Severe outbreaks reduce vigour and fruit production the following year.
URGENCY: Begin fungicide programme at first signs; control before flowering to protect yield.`,
  },

  {
    label: 'Strawberry___healthy',
    title: 'Healthy Strawberry',
    keywords: ['strawberry', 'healthy', 'normal', 'fragaria'],
    content: `PLANT: Strawberry (Fragaria × ananassa) — Healthy
The strawberry plant appears healthy. Care recommendations:
  • Mulch with straw to keep fruit clean, retain moisture, and suppress weeds.
  • Remove runners to concentrate energy in mother plants for June-bearing varieties.
  • Apply potassium-rich fertiliser after harvest to support root and crown development.
  • Monitor for grey mould (Botrytis cinerea) during fruiting — the most common strawberry fruit disease.
  • Replace plantings every 3–4 years to maintain productivity and disease control.`,
  },

  // ── TOMATO ────────────────────────────────────────────────────────────────

  {
    label: 'Tomato___Early_blight',
    title: 'Tomato Early Blight',
    keywords: ['tomato', 'early blight', 'alternaria', 'target spots', 'bull eye', 'concentric rings', 'lower leaves'],
    content: `DISEASE: Tomato Early Blight (Alternaria solani — fungal)
AFFECTED PLANT: Tomato (Solanum lycopersicum)
SYMPTOMS: Dark, leathery lesions with concentric rings (bull's-eye pattern) on older lower leaves first. Yellow halo surrounds lesions. Fruit stem-end rot may also occur (collar rot). Disease moves upward progressively.
TREATMENT:
  • Apply chlorothalonil, mancozeb, or azoxystrobin preventatively.
  • Remove infected lower leaves and dispose of off-site (do not compost).
  • Maintain spray coverage on undersides of leaves.
PREVENTION:
  • Stake or cage plants to keep foliage off the ground.
  • Use soaker hoses / drip irrigation — avoid wetting foliage.
  • Mulch heavily to prevent soil splash onto lower leaves.
  • Rotate crops — do not plant tomatoes or potatoes in the same spot for 3 years.
SEVERITY: Moderate. Rarely kills plants but reduces yield and shortens productive season.
URGENCY: Begin prevention at transplanting in areas with a history of early blight.`,
  },

  {
    label: 'Tomato___Late_blight',
    title: 'Tomato Late Blight',
    keywords: ['tomato', 'late blight', 'phytophthora', 'water-soaked', 'white mould', 'greasy patches', 'rapid collapse'],
    content: `DISEASE: Tomato Late Blight (Phytophthora infestans — oomycete)
AFFECTED PLANT: Tomato (Solanum lycopersicum)
SYMPTOMS: Large, irregular, pale green to brown, greasy-looking lesions on leaves. White cottony sporulation on undersides in humid conditions. Rapidly turns black and papery. Stems show dark, sunken lesions. Fruit shows firm, brown, corrugated rotting.
TREATMENT:
  • Apply mandipropamid, cymoxanil, or metalaxyl-M (mefenoxam) at first sign.
  • Copper-based fungicides are effective preventatively.
  • Remove and bag infected plant parts immediately — do not compost.
PREVENTION:
  • Plant resistant varieties (e.g. Defiant, Mountain Merit, Jasper cherry).
  • Apply preventative fungicides during cool (10–20°C), wet/humid conditions.
  • Avoid overhead watering; water at base in the morning.
  • Remove potato volunteers near the tomato garden — shared inoculum source.
SEVERITY: CRITICAL. Can destroy an entire tomato crop within 1–2 weeks in favourable conditions.
URGENCY: Act immediately — remove all visibly infected material today and apply systemic fungicide.`,
  },

  {
    label: 'Tomato___Bacterial_spot',
    title: 'Tomato Bacterial Spot',
    keywords: ['tomato', 'bacterial spot', 'xanthomonas', 'greasy spots', 'scab', 'defoliation'],
    content: `DISEASE: Tomato Bacterial Spot (Xanthomonas perforans / X. vesicatoria — bacterial)
AFFECTED PLANT: Tomato (Solanum lycopersicum)
SYMPTOMS: Small, water-soaked, irregular spots on leaves that turn dark brown with yellow halos. Raised, scab-like lesions on fruit. Severe defoliation exposes fruit to sun scald. Spread rapidly during rain and wind.
TREATMENT:
  • Apply copper hydroxide + mancozeb mixture preventatively and at first sign.
  • Remove and destroy heavily infected plant material.
  • Avoid working with plants when wet.
PREVENTION:
  • Use certified disease-free seed; treat with hot water (50°C for 25 min) if unsure.
  • Plant resistant varieties.
  • Drip irrigation only — no overhead watering.
  • 2–3 year rotation away from Solanaceae.
SEVERITY: High. Warm (24–30°C), wet, windy conditions enable explosive spread.
URGENCY: Begin copper sprays before first symptom in wet seasons. Curative options are limited.`,
  },

  {
    label: 'Tomato___Leaf_Mold',
    title: 'Tomato Leaf Mould',
    keywords: ['tomato', 'leaf mold', 'leaf mould', 'passalora', 'cladosporium', 'yellow patches', 'olive mould', 'greenhouse tomato'],
    content: `DISEASE: Tomato Leaf Mould (Passalora fulva — fungal, formerly Cladosporium fulvum)
AFFECTED PLANT: Tomato (Solanum lycopersicum) — primarily greenhouse/polytunnel crops
SYMPTOMS: Pale yellowish-green patches on upper leaf surface. Corresponding velvety, olive-grey to brown mould on undersides. Infected leaves curl, yellow, and drop. Disease spreads rapidly in high-humidity enclosed environments.
TREATMENT:
  • Reduce greenhouse humidity below 85% — improve ventilation immediately.
  • Apply chlorothalonil, mancozeb, or azoxystrobin.
  • Remove infected leaves; bag and remove from greenhouse.
PREVENTION:
  • Plant resistant varieties with Cf resistance genes (e.g. Durinta, Roterno).
  • Maintain relative humidity below 85% and avoid water condensation on leaves.
  • Space plants adequately; remove suckers regularly.
  • Disinfect greenhouse structures between crops.
SEVERITY: Moderate–High in glasshouse production. Rarely a serious problem outdoors.
URGENCY: Ventilate immediately when first symptoms appear; leaf mould spreads extremely fast in enclosed environments.`,
  },

  {
    label: 'Tomato___Septoria_leaf_spot',
    title: 'Tomato Septoria Leaf Spot',
    keywords: ['tomato', 'septoria', 'leaf spot', 'white centre', 'dark border', 'tiny spots', 'circular spots'],
    content: `DISEASE: Tomato Septoria Leaf Spot (Septoria lycopersici — fungal)
AFFECTED PLANT: Tomato (Solanum lycopersicum)
SYMPTOMS: Many small (3–6 mm), circular spots with dark brown borders and grey-white centres. Tiny black dots (pycnidia) visible in spot centres with a hand lens. Lower leaves first; progresses upward. Severe infection causes complete defoliation from the bottom up.
TREATMENT:
  • Apply chlorothalonil, mancozeb, or copper fungicides at first sign.
  • Remove and destroy infected leaves immediately.
  • Maintain 7–10 day spray intervals during wet weather.
PREVENTION:
  • Mulch soil heavily to prevent soil-splash dispersal of spores.
  • Use stakes/cages to keep foliage off ground.
  • Drip irrigation; avoid wetting foliage.
  • 3-year crop rotation.
SEVERITY: Moderate–High. One of the most common tomato foliar diseases in humid regions.
URGENCY: Early intervention is highly effective — act at the first spotted leaf.`,
  },

  {
    label: 'Tomato___Target_Spot',
    title: 'Tomato Target Spot',
    keywords: ['tomato', 'target spot', 'corynespora', 'concentric rings', 'brown lesions', 'target lesion'],
    content: `DISEASE: Tomato Target Spot (Corynespora cassiicola — fungal)
AFFECTED PLANT: Tomato (Solanum lycopersicum)
SYMPTOMS: Brown, irregular to circular lesions with concentric rings (target-spot pattern) on leaves, stems, and fruit. Lesions have a yellow halo. Fruit lesions are sunken and dark. Defoliation weakens plants significantly.
TREATMENT:
  • Apply azoxystrobin, chlorothalonil, or tebuconazole.
  • Improve airflow through pruning (remove lower leaves and suckers).
  • Remove infected plant material from the field.
PREVENTION:
  • Avoid dense planting; maintain 60 cm minimum spacing.
  • Use drip irrigation and avoid leaf wetness.
  • Rotate with non-host crops for 2+ years.
SEVERITY: Moderate–High in warm, humid tropical and subtropical climates.
URGENCY: Treat early; target spot can progress quickly once established.`,
  },

  {
    label: 'Tomato___Spider_mites Two-spotted_spider_mite',
    title: 'Tomato Spider Mites (Two-Spotted)',
    keywords: ['tomato', 'spider mite', 'two spotted', 'tetranychus', 'webbing', 'stippling', 'bronze leaves', 'mite'],
    content: `PEST: Two-Spotted Spider Mite (Tetranychus urticae — arachnid, not a fungal disease)
AFFECTED PLANT: Tomato (and many other crops); especially severe in hot, dry conditions
SYMPTOMS: Fine stippling (tiny pale dots) on upper leaf surface — leaves take on a bronzed or silvery appearance. Fine webbing on undersides of leaves and between stems. Leaves eventually dry out, turn brown, and fall. Populations explode rapidly in hot, dry weather.
TREATMENT:
  • Spray plants forcefully with water to dislodge mites (undersides of leaves).
  • Apply insecticidal soap or neem oil (2–3 applications, 5–7 days apart).
  • For severe infestations: abamectin, bifenazate, or spiromesifen miticides.
  • Introduce predatory mites (Phytoseiulus persimilis) in greenhouse settings.
  • IMPORTANT: Rotate miticide modes of action — resistance develops quickly.
PREVENTION:
  • Maintain adequate plant hydration — water-stressed plants are most susceptible.
  • Avoid excessive nitrogen (produces lush growth that attracts mites).
  • Preserve natural enemies (avoid broad-spectrum insecticides that kill predators).
  • Monitor weekly — populations can double every 3–5 days in summer.
SEVERITY: High in hot, dry conditions. Can kill plants if uncontrolled.
URGENCY: Act at first stippling; mite populations grow exponentially.`,
  },

  {
    label: 'Tomato___Tomato_Yellow_Leaf_Curl_Virus',
    title: 'Tomato Yellow Leaf Curl Virus (TYLCV)',
    keywords: ['tomato', 'yellow leaf curl', 'TYLCV', 'virus', 'whitefly', 'curled leaves', 'stunted', 'begomovirus'],
    content: `DISEASE: Tomato Yellow Leaf Curl Virus (TYLCV — Begomovirus, vectored by Bemisia tabaci whitefly)
AFFECTED PLANT: Tomato (Solanum lycopersicum)
SYMPTOMS: Upward and inward leaf curling, especially on young leaves. Leaves turn yellow with purple veins. Severe stunting — plants may be only 20–30% of normal height. Flower drop; little or no fruit set. Infected plants cannot recover.
TREATMENT:
  • NO CURE — remove and destroy infected plants immediately to prevent further spread.
  • Control whitefly populations aggressively with imidacloprid (soil drench at transplant), spirotetramat, or pymetrozine.
  • Yellow sticky traps to monitor and reduce whitefly numbers.
PREVENTION:
  • Plant TYLCV-resistant or tolerant varieties (Ty-1, Ty-2, Ty-3 resistance genes) — this is the most effective strategy.
  • Use reflective silver mulch to deter whiteflies.
  • Install insect-proof netting in greenhouse/tunnel production.
  • Inspect transplants carefully — do not introduce whitefly-infested plants.
  • Eliminate weed hosts of both whitefly and virus around the planting area.
SEVERITY: CRITICAL — infected plants will not produce a commercial crop. One whitefly can transmit virus within 15–30 minutes of feeding.
URGENCY: Remove infected plants immediately — every hour of delay risks further spread via whitefly.`,
  },

  {
    label: 'Tomato___Tomato_mosaic_virus',
    title: 'Tomato Mosaic Virus (ToMV)',
    keywords: ['tomato', 'mosaic virus', 'ToMV', 'TMV', 'mottled leaves', 'mosaic pattern', 'distorted leaves', 'virus'],
    content: `DISEASE: Tomato Mosaic Virus (ToMV) / Tobacco Mosaic Virus (TMV) — Tobamovirus
AFFECTED PLANT: Tomato, Pepper, and other Solanaceae
SYMPTOMS: Light and dark green mosaic mottling on leaves. Leaves may be distorted, fern-like (filiform), or blistered. Plants may be stunted. Fruit shows yellow mottling, uneven ripening, and internal browning. Extremely stable virus — survives on tools and surfaces for years.
TREATMENT:
  • NO CURE — remove and destroy infected plants.
  • Disinfect all tools with 10% bleach solution or 70% alcohol after every cut.
  • Wash hands thoroughly before and after handling plants.
PREVENTION:
  • Plant ToMV/TMV-resistant varieties (Tm-2² resistance gene).
  • Use certified virus-free seed; treat seed with 10% trisodium phosphate for 15 minutes.
  • Do not smoke near plants — tobacco products can carry TMV.
  • Control aphids (ToMV is not aphid-transmitted but aphids transmit other mosaic viruses).
  • Disinfect greenhouse benches, stakes, and equipment between crops.
SEVERITY: Moderate–High. Yield losses of 10–50% possible; resistant varieties nearly eliminate the problem.
URGENCY: Remove infected plants today to prevent mechanical spread through tool contact.`,
  },

  {
    label: 'Tomato___healthy',
    title: 'Healthy Tomato',
    keywords: ['tomato', 'healthy', 'normal'],
    content: `PLANT: Tomato (Solanum lycopersicum) — Healthy
The tomato plant appears healthy. Key care tips:
  • Remove suckers (side shoots in leaf axils) weekly on indeterminate varieties.
  • Fertilise with high-potassium feed once flowering starts; avoid excess nitrogen after that point.
  • Water consistently at the base — irregular watering causes blossom end rot and fruit cracking.
  • Stake or cage plants before they need it — retroactive staking damages roots.
  • Scout weekly for early blight, late blight, and spider mites.`,
  },

  // ── GUAVA ─────────────────────────────────────────────────────────────────

  {
    label: 'guava___healthy',
    title: 'Healthy Guava',
    keywords: ['guava', 'healthy', 'normal', 'psidium'],
    content: `PLANT: Guava (Psidium guajava) — Healthy
The guava plant appears healthy. Care recommendations:
  • Water deeply but infrequently; guava is moderately drought-tolerant once established.
  • Fertilise 3–4 times per year with balanced NPK; increase potassium before flowering.
  • Prune after each harvest to stimulate new flush and remove dead wood.
  • Monitor for guava fruit fly (Bactrocera dorsalis) — use protein bait traps.
  • Mulch around base to conserve moisture and regulate soil temperature.`,
  },

  {
    label: 'guava___anthracnose',
    title: 'Guava Anthracnose',
    keywords: ['guava', 'anthracnose', 'colletotrichum', 'fruit rot', 'dark lesions', 'sunken spots'],
    content: `DISEASE: Guava Anthracnose (Colletotrichum gloeosporioides — fungal)
AFFECTED PLANT: Guava (Psidium guajava)
SYMPTOMS: Small, water-soaked lesions on fruit that enlarge to dark brown/black, sunken, circular spots. In humid conditions, salmon-pink spore masses appear in lesion centres. Severe infection leads to fruit drop. Leaves show irregular brown spots with yellow halos.
TREATMENT:
  • Apply mancozeb, copper oxychloride, or thiophanate-methyl at fruit set and every 10–14 days.
  • Remove and destroy infected fruit promptly.
  • Harvest fruit slightly early in high-disease-pressure seasons.
PREVENTION:
  • Prune for open canopy to improve airflow and reduce humidity.
  • Avoid mechanical injury to fruit during cultural operations.
  • Post-harvest hot water treatment (52°C for 5 min) reduces post-harvest anthracnose.
SEVERITY: High — a leading cause of guava post-harvest losses in tropical regions.
URGENCY: Apply fungicides preventatively during wet seasons; reactive sprays are less effective.`,
  },

  {
    label: 'guava___insect_bite',
    title: 'Guava Insect Damage',
    keywords: ['guava', 'insect bite', 'insect damage', 'pest', 'holes', 'chewing damage'],
    content: `PEST: Guava Insect Damage (multiple species)
AFFECTED PLANT: Guava (Psidium guajava)
COMMON CULPRITS: Guava fruit fly (Bactrocera correcta), mealybugs, aphids, leaf-eating caterpillars, bark borers.
SYMPTOMS: Irregular holes in leaves or fruit; tunnelling in fruit interior (fruit fly larvae); cottony white masses on stems (mealybug); sticky honeydew with sooty mould (aphids/mealybugs).
TREATMENT:
  • For fruit fly: protein bait traps (Methyl Eugenol + insecticide); bag individual fruit with paper or muslin.
  • For mealybug: spray with neem oil, insecticidal soap, or imidacloprid.
  • For caterpillars: Bacillus thuringiensis (Bt) spray; hand-pick egg masses.
  • For bark borers: inject dichlorvos into entry holes; seal with mud.
PREVENTION:
  • Install sticky traps and pheromone traps for fruit fly monitoring.
  • Collect and destroy fallen fruit weekly — breaks fruit fly cycle.
  • Encourage beneficial insects (parasitic wasps, ladybirds) by avoiding broad-spectrum insecticides.
SEVERITY: Variable — fruit fly can cause 100% crop loss if unmanaged.
URGENCY: Identify the specific pest before treating; different pests require different approaches.`,
  },

  {
    label: 'guava___multiple',
    title: 'Guava — Multiple Issues',
    keywords: ['guava', 'multiple disease', 'multiple problems', 'complex', 'combined'],
    content: `CONDITION: Guava — Multiple Simultaneous Issues
AFFECTED PLANT: Guava (Psidium guajava)
DESCRIPTION: The plant shows signs of more than one problem simultaneously. This is common in stressed or neglected plants, where weakened immunity allows multiple pathogens and pests to establish.
APPROACH:
  1. PRIORITISE: Address the most immediately damaging issue first (usually active disease spreading to healthy tissue).
  2. IMPROVE GENERAL HEALTH: Correct soil nutrition (fertilise), optimise irrigation, prune dead and diseased wood.
  3. TREAT DISEASES: Apply a broad-spectrum copper-based fungicide to address fungal and bacterial issues.
  4. TREAT PESTS: Identify and treat specific insects separately.
  5. MONITOR WEEKLY: Reassess progress after 2 weeks of treatment.
  Key guava diseases to check: anthracnose, algal spot, wilt (Fusarium/Phytophthora), fruit canker.
  Key guava pests to check: fruit fly, mealybug, psyllid, bark borer.
SEVERITY: High — multiple stressors compound each other and can cause rapid decline.
URGENCY: Begin a structured inspection and treatment plan immediately.`,
  },

  {
    label: 'guava___scorch',
    title: 'Guava Leaf Scorch',
    keywords: ['guava', 'scorch', 'burnt leaves', 'margin burn', 'brown edges', 'drought stress'],
    content: `CONDITION: Guava Leaf Scorch
AFFECTED PLANT: Guava (Psidium guajava)
CAUSES: Primarily abiotic — heat stress, drought, salt accumulation in soil, wind burn, or root damage. Can also be caused by Xanthomonas bacterial infection (late stage).
SYMPTOMS: Browning and drying at leaf margins and tips progressing inward. Affected leaves eventually die and fall. Whole-plant decline in severe cases.
TREATMENT:
  • Water deeply and consistently — scorch from drought often responds quickly to improved irrigation.
  • Flush soil with clean water if salt buildup is suspected.
  • Apply balanced foliar fertiliser if nutritional deficiency is suspected.
  • If bacterial origin: apply copper-based bactericide.
PREVENTION:
  • Mulch heavily around the root zone to conserve moisture.
  • Provide wind breaks in exposed sites.
  • Avoid fertilising during drought stress — salt concentration can worsen scorch.
  • Ensure proper drainage — waterlogged roots also cause scorch symptoms.
SEVERITY: Moderate. Rarely fatal if cause is identified and corrected early.
URGENCY: Identify root cause (abiotic vs. biotic) before treating.`,
  },

  {
    label: 'guava___yld',
    title: 'Guava Yield / Decline Issues',
    keywords: ['guava', 'yld', 'yield decline', 'poor fruiting', 'wilt', 'decline'],
    content: `CONDITION: Guava Yield Decline / General Decline
AFFECTED PLANT: Guava (Psidium guajava)
POSSIBLE CAUSES: Fusarium wilt, Phytophthora root rot, nutritional deficiency, overcrowding, poor pollination, nematode infestation, or age-related decline.
SYMPTOMS PATTERN:
  • Sudden wilt of individual branches or the entire tree (Fusarium wilt).
  • Progressive yellowing from oldest to newest leaves (nitrogen/iron deficiency).
  • Poor or absent fruit set (pollination issues or boron deficiency).
  • Galls on roots visible at excavation (root-knot nematodes).
TREATMENT:
  • For wilt: remove infected trees; no effective curative treatment for Fusarium wilt.
  • For nutrition: soil-test and apply appropriate fertiliser; foliar iron chelate for iron chlorosis.
  • For nematodes: apply neem cake to soil; consider resistant rootstocks for future replanting.
  • Rejuvenation pruning may help aged, unproductive trees.
PREVENTION:
  • Plant certified nematode-free material.
  • Improve soil drainage before planting.
  • Maintain balanced soil nutrition annually.
SEVERITY: High when Fusarium wilt is involved; moderate for nutritional causes.
URGENCY: Investigate root health by excavating a section of root to check for rot or nematode galls.`,
  },

  // ── HIBISCUS ──────────────────────────────────────────────────────────────

  {
    label: 'hibiscus___healthy',
    title: 'Healthy Hibiscus',
    keywords: ['hibiscus', 'healthy', 'normal', 'rosemallow'],
    content: `PLANT: Hibiscus (Hibiscus rosa-sinensis) — Healthy
The hibiscus plant appears healthy. Care tips:
  • Water regularly but ensure excellent drainage — hibiscus does not tolerate waterlogged roots.
  • Fertilise every 2 weeks during the growing season with high-potassium fertiliser for abundant blooms.
  • Prune by one-third in early spring to encourage bushy growth and more flowers.
  • Monitor for aphids on new growth and mealybugs in leaf axils.
  • Hibiscus prefers full sun (6+ hours) and temperatures above 15°C.`,
  },

  {
    label: 'hibiscus___blight',
    title: 'Hibiscus Blight',
    keywords: ['hibiscus', 'blight', 'botrytis', 'phytophthora', 'grey mould', 'stem rot', 'dying shoots'],
    content: `DISEASE: Hibiscus Blight (Botrytis cinerea / Phytophthora spp. — fungal/oomycete)
AFFECTED PLANT: Hibiscus (Hibiscus rosa-sinensis and related spp.)
SYMPTOMS: Water-soaked lesions on stems and leaf petioles that rapidly turn brown/black. Grey, fuzzy sporulation (Botrytis) or absence of sporulation (Phytophthora). Whole branches wilt and die quickly. Flowers and buds may also be affected.
TREATMENT:
  • For Botrytis: apply iprodione, fludioxonil, or Bacillus subtilis biocontrol.
  • For Phytophthora: apply metalaxyl-M, fosetyl-aluminium, or phosphite.
  • Remove all affected shoots 10 cm below visible symptoms; sterilise tools.
  • Improve ventilation and reduce humidity around plants.
PREVENTION:
  • Avoid overhead watering and leaf wetness.
  • Remove dead flowers and fallen plant debris promptly.
  • Space plants adequately; avoid overcrowding.
  • Do not over-fertilise with nitrogen.
SEVERITY: Moderate–High. Botrytis thrives in cool, wet, humid conditions; Phytophthora in wet, warm soils.
URGENCY: Prune out affected stems immediately; blight can spread rapidly during humid weather.`,
  },

  {
    label: 'hibiscus___scorch',
    title: 'Hibiscus Leaf Scorch',
    keywords: ['hibiscus', 'scorch', 'burnt leaves', 'brown edges', 'sun scorch', 'drought hibiscus'],
    content: `CONDITION: Hibiscus Leaf Scorch
AFFECTED PLANT: Hibiscus (Hibiscus rosa-sinensis)
CAUSES: Most commonly abiotic — intense afternoon sun, drought stress, hot dry winds, salt buildup in soil. Bacterial blight (Xanthomonas) can also cause scorch-like symptoms.
SYMPTOMS: Browning and drying of leaf margins, progressing inward. Yellowing before browning is more indicative of abiotic stress; brown patches without yellowing may indicate bacterial infection.
TREATMENT:
  • Move potted plants to a position with bright but indirect afternoon light.
  • Water deeply; ensure pot drainage is unobstructed.
  • Flush soil with clean water if salt buildup suspected.
  • If bacterial: apply copper-based spray.
PREVENTION:
  • Provide afternoon shade in hot climates (above 35°C).
  • Mulch heavily to retain soil moisture.
  • Water in the early morning.
SEVERITY: Low–Moderate. Primarily cosmetic; rarely fatal with corrective care.`,
  },

  {
    label: 'hibiscus___death_leaf',
    title: 'Hibiscus Leaf Death / Necrosis',
    keywords: ['hibiscus', 'death leaf', 'dead leaves', 'necrosis', 'dying', 'leaf death'],
    content: `CONDITION: Hibiscus Leaf Necrosis / Death
AFFECTED PLANT: Hibiscus (Hibiscus rosa-sinensis)
CAUSES: Advanced fungal disease (Phytophthora, Colletotrichum), severe bacterial infection, root rot, extreme temperature stress, or complete dehydration.
SYMPTOMS: Large portions of leaves turning completely brown and dry, or black and water-soaked. May progress from margins inward (abiotic) or appear as irregular patches (biotic). Leaf drop follows.
ASSESSMENT GUIDE:
  • Uniform margin browning + soil dry → drought stress or heat.
  • Irregular dark patches + soil wet → root rot or fungal disease.
  • Spots with yellow halos → fungal or bacterial leaf disease.
  • Entire leaves black + mushy → Phytophthora or severe fungal rot.
TREATMENT:
  • Check root health — healthy roots are white/cream; rotted roots are brown/black and mushy.
  • If root rot: repot in fresh dry mix; treat with fosetyl-aluminium.
  • If fungal leaf disease: apply appropriate fungicide and remove dead material.
  • If abiotic: address underlying stress (water, shade, temperature).
SEVERITY: High — indicates the plant is in significant distress.
URGENCY: Identify root cause immediately; dead tissue cannot recover but prompt action saves the rest of the plant.`,
  },

  // ── ROSE ──────────────────────────────────────────────────────────────────

  {
    label: 'rose___healthy',
    title: 'Healthy Rose',
    keywords: ['rose', 'healthy', 'normal', 'rosa'],
    content: `PLANT: Rose (Rosa spp.) — Healthy
The rose plant appears healthy. Care recommendations:
  • Water at the base; keep foliage dry to prevent black spot and powdery mildew.
  • Fertilise every 4–6 weeks during the growing season with rose-specific fertiliser.
  • Deadhead spent blooms to encourage repeat flowering on modern varieties.
  • Monitor weekly for aphids on new growth, black spot (Diplocarpon rosae), and powdery mildew.
  • Apply preventative fungicide spray in spring before symptoms appear in high-risk areas.`,
  },

  {
    label: 'rose___blight',
    title: 'Rose Blight',
    keywords: ['rose', 'blight', 'botrytis', 'grey mould', 'dieback', 'stem rot', 'cane blight'],
    content: `DISEASE: Rose Blight / Cane Blight (Botrytis cinerea / Leptosphaeria coniothyrium — fungal)
AFFECTED PLANT: Rose (Rosa spp.)
SYMPTOMS: Botrytis: grey, fuzzy mould on flowers and young shoots in cool, humid conditions; flowers turn brown and mushy. Cane Blight: brown, sunken cankers on canes, often at pruning wounds; canes die above the canker.
TREATMENT:
  • For Botrytis: apply iprodione, fenhexamid, or Bacillus subtilis. Improve ventilation.
  • For cane blight: prune 10 cm below visible canker into healthy white wood; seal large cuts with wound paint; sterilise secateurs in bleach solution between each cut.
  • Remove all infected material from the garden — do not compost.
PREVENTION:
  • Make clean, angled pruning cuts just above an outward-facing bud.
  • Space roses to allow air circulation.
  • Avoid wetting foliage when watering.
  • Remove dead petals and fallen leaves promptly.
SEVERITY: Moderate. Botrytis on flowers is cosmetically damaging; cane blight can kill entire canes.
URGENCY: Prune out cane blight promptly to prevent canker from reaching the main stem.`,
  },

  // ── CRAPE JASMINE ─────────────────────────────────────────────────────────

  {
    label: 'crape_jasmine___healthy',
    title: 'Healthy Crape Jasmine',
    keywords: ['crape jasmine', 'tabernaemontana', 'healthy', 'normal', 'pinwheel flower'],
    content: `PLANT: Crape Jasmine (Tabernaemontana divaricata) — Healthy
The crape jasmine plant appears healthy. Care tips:
  • Prefers well-drained, slightly acidic to neutral soil.
  • Water regularly but allow top soil to dry slightly between waterings.
  • Apply slow-release fertiliser in spring and mid-summer.
  • Prune lightly after the main flowering flush to maintain shape.
  • Milky sap is toxic — wear gloves when pruning.`,
  },

  {
    label: 'crape_jasmine___insect_bite',
    title: 'Crape Jasmine Insect Damage',
    keywords: ['crape jasmine', 'insect bite', 'insect damage', 'pest', 'holes', 'caterpillar'],
    content: `PEST: Crape Jasmine Insect Damage (multiple species)
AFFECTED PLANT: Crape Jasmine (Tabernaemontana divaricata)
COMMON PESTS: Oleander hawk moth caterpillars (Daphnis nerii), aphids, scale insects, mealybugs.
SYMPTOMS: Large irregular holes in leaves (caterpillars); sticky honeydew + sooty mould (aphids/scale/mealybug); cottony white masses in leaf axils (mealybug).
TREATMENT:
  • Caterpillars: hand-pick; apply Bacillus thuringiensis (Bt) spray for heavy infestations.
  • Aphids: strong water jet to dislodge; insecticidal soap or neem oil spray.
  • Scale/mealybug: horticultural oil or systemic insecticide (imidacloprid as soil drench).
PREVENTION:
  • Inspect new growth weekly.
  • Encourage natural predators (birds, parasitic wasps, ladybirds).
  • Avoid excessive nitrogen — promotes lush growth attractive to pests.
SEVERITY: Low–Moderate. Hawk moth caterpillars can completely defoliate a plant rapidly.
URGENCY: Check plant daily if caterpillars detected — populations grow extremely fast.`,
  },

  {
    label: 'crape_jasmine___yld',
    title: 'Crape Jasmine Yield / Bloom Decline',
    keywords: ['crape jasmine', 'yld', 'no flowers', 'poor blooming', 'decline', 'yellowing'],
    content: `CONDITION: Crape Jasmine Bloom / Growth Decline
AFFECTED PLANT: Crape Jasmine (Tabernaemontana divaricata)
POSSIBLE CAUSES: Insufficient sunlight (needs 4–6 hours minimum), root-bound in container, excess nitrogen (promotes leaves over flowers), root rot, or nutrient deficiency.
SYMPTOMS: Reduced flowering, yellowing leaves, stunted new growth, or leaf drop without apparent disease.
TREATMENT:
  • Relocate to a position with more sun if flowering is poor.
  • Switch to a low-nitrogen, high-phosphorus fertiliser to promote blooms.
  • If root-bound: repot into a container one size larger with fresh well-draining mix.
  • Check for root rot by inspecting roots — treat as needed.
PREVENTION:
  • Plant in full to partial sun (minimum 4 hours direct sunlight).
  • Use a balanced fertiliser with slightly elevated phosphorus.
  • Repot container plants every 2–3 years.
SEVERITY: Low. Primarily a cultural management issue.`,
  },

  // ── NIGHT-FLOWERING JASMINE ───────────────────────────────────────────────

  {
    label: 'night_flowering_jasmine___healthy',
    title: 'Healthy Night-Flowering Jasmine',
    keywords: ['night flowering jasmine', 'nyctanthes', 'harsingar', 'healthy', 'parijat'],
    content: `PLANT: Night-Flowering Jasmine (Nyctanthes arbor-tristis) — Healthy
The night-flowering jasmine (Parijat / Harsingar) appears healthy. Care tips:
  • Prefers well-drained soil and full sun to partial shade.
  • Water moderately; avoid waterlogging.
  • Fertilise in spring and early summer with balanced NPK.
  • Flowers open at dusk and fall by morning — fallen flowers indicate healthy flowering, not disease.
  • Prune lightly after flowering to maintain shape.`,
  },

  {
    label: 'night_flowering_jasmine___red_spot',
    title: 'Night-Flowering Jasmine Red Spot',
    keywords: ['night flowering jasmine', 'nyctanthes', 'red spot', 'red lesion', 'leaf spot', 'harsingar'],
    content: `DISEASE: Night-Flowering Jasmine Red Spot (likely Cercospora spp. or Alternaria spp. — fungal)
AFFECTED PLANT: Night-Flowering Jasmine (Nyctanthes arbor-tristis)
SYMPTOMS: Reddish to reddish-brown circular spots on leaves, sometimes with darker borders. Spots may coalesce. Premature leaf drop in severe cases.
TREATMENT:
  • Apply mancozeb or copper oxychloride fungicide spray every 10–14 days.
  • Remove and destroy infected leaves.
  • Improve airflow around the plant through pruning.
PREVENTION:
  • Avoid overhead watering — use base irrigation.
  • Mulch to prevent soil splash onto lower leaves.
  • Maintain plant vigour through regular feeding and watering.
SEVERITY: Low–Moderate. Rarely fatal but can cause cosmetic damage and defoliation.`,
  },

  {
    label: 'night_flowering_jasmine___early_blight',
    title: 'Night-Flowering Jasmine Early Blight',
    keywords: ['night flowering jasmine', 'nyctanthes', 'early blight', 'alternaria', 'harsingar blight'],
    content: `DISEASE: Night-Flowering Jasmine Early Blight (Alternaria spp. — fungal)
AFFECTED PLANT: Night-Flowering Jasmine (Nyctanthes arbor-tristis)
SYMPTOMS: Dark brown to black lesions with concentric ring patterns (similar to early blight on tomato/potato). Lower and older leaves first affected. Yellow halos may appear around lesions.
TREATMENT:
  • Apply mancozeb, copper-based fungicide, or azoxystrobin every 10–14 days.
  • Remove affected leaves and dispose of off-site.
PREVENTION:
  • Ensure good drainage and avoid waterlogging.
  • Water at the base in the morning.
  • Maintain balanced nutrition — stressed plants are more susceptible.
SEVERITY: Moderate. Manageable with prompt treatment.
URGENCY: Act at first lesion observation — early blight spreads during warm, humid conditions.`,
  },

];
