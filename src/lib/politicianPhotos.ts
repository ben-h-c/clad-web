/**
 * Portrait URLs for politician cards (Wikimedia Commons via Wikipedia REST).
 * Use the exact thumbnail URLs returned by the API — Wikimedia only serves
 * pre-generated sizes; rewriting e.g. 330px→440px yields HTTP 400 and blank photos.
 *
 * Prefer loading via /api/politician-photo/[slug] (same-origin proxy) so browsers
 * are not blocked by third-party quirks.
 */
export const POLITICIAN_PHOTOS: Record<string, string> = {
  "abdul-el-sayed": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Abdul_El-Sayed_meet-and-greet_by_Conlan_Houston_5_%28cropped%29.jpg/330px-Abdul_El-Sayed_meet-and-greet_by_Conlan_Houston_5_%28cropped%29.jpg",
  "amy-klobuchar": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Amy_Klobuchar%2C_official_portrait%2C_113th_Congress.jpg/330px-Amy_Klobuchar%2C_official_portrait%2C_113th_Congress.jpg",
  "andy-beshear": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Andy_Beshear_in_April_2026_%28cropped%29.jpg/330px-Andy_Beshear_in_April_2026_%28cropped%29.jpg",
  "angela-alsobrooks": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Sen._Angela_Alsobrooks_official_Senate_photo%2C_119th_Congress.jpg/330px-Sen._Angela_Alsobrooks_official_Senate_photo%2C_119th_Congress.jpg",
  "angie-craig": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Angie_Craig%2C_official_portrait_%28119th_Congress%29.jpg/330px-Angie_Craig%2C_official_portrait_%28119th_Congress%29.jpg",
  "annie-andrews": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Annie_Andrews_Greenville_%28cropped%29.jpg/330px-Annie_Andrews_Greenville_%28cropped%29.jpg",
  "aoc": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Alexandria_Ocasio-Cortez_Official_Portrait.jpg/330px-Alexandria_Ocasio-Cortez_Official_Portrait.jpg",
  "barack-obama": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/President_Barack_Obama.jpg/330px-President_Barack_Obama.jpg",
  "benjamin-netanyahu": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Benjamin_Netanyahu%2C_February_2023.jpg/330px-Benjamin_Netanyahu%2C_February_2023.jpg",
  "bernie-moreno": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Sen._Bernie_Moreno_official_photo%2C_119th_Congress_%28HR%29.jpg/330px-Sen._Bernie_Moreno_official_photo%2C_119th_Congress_%28HR%29.jpg",
  "bernie-sanders": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Bernie_Sanders_February_2026_%28cropped%29.jpg/330px-Bernie_Sanders_February_2026_%28cropped%29.jpg",
  "brian-kemp": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Brian_Kemp_portrait%2C_2024_%28cropped%29.jpg/330px-Brian_Kemp_portrait%2C_2024_%28cropped%29.jpg",
  "chris-murphy": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/Chris_Murphy_in_Paris%2C_France_2025_%28cropped%29.jpg/330px-Chris_Murphy_in_Paris%2C_France_2025_%28cropped%29.jpg",
  "chris-pappas": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Chris_Pappas%2C_official_portrait%2C_116th_Congress.jpg/330px-Chris_Pappas%2C_official_portrait%2C_116th_Congress.jpg",
  "chuck-schumer": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Chuck_Schumer_official_photo.jpg/330px-Chuck_Schumer_official_photo.jpg",
  "colin-allred": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Colin_Allred%2C_official_portrait%2C_117th_Congress.jpg/330px-Colin_Allred%2C_official_portrait%2C_117th_Congress.jpg",
  "cory-booker": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Cory_Booker%2C_official_portrait_%28119th_Congress%29.jpg/330px-Cory_Booker%2C_official_portrait_%28119th_Congress%29.jpg",
  "darline-graham-nordone": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Darline_Graham_Swearing_In.png/330px-Darline_Graham_Swearing_In.png",
  "dave-mccormick": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/McCormick_Portrait_%28HR%29.jpg/330px-McCormick_Portrait_%28HR%29.jpg",
  "deb-fischer": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Deb_Fischer_118th_Congress.jpg/330px-Deb_Fischer_118th_Congress.jpg",
  "dick-durbin": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Dick_Durbin_2022_official_portrait_%28cropped%29.jpg/330px-Dick_Durbin_2022_official_portrait_%28cropped%29.jpg",
  "donald-trump": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Official_Presidential_Portrait_of_President_Donald_J._Trump_%282025%29_%28cropped%29%282%29.jpg/330px-Official_Presidential_Portrait_of_President_Donald_J._Trump_%282025%29_%28cropped%29%282%29.jpg",
  "elissa-slotkin": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Elissa_Slotkin_2026_Official_Portrait_%28cropped%29.jpg/330px-Elissa_Slotkin_2026_Official_Portrait_%28cropped%29.jpg",
  "elizabeth-warren": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Elizabeth_Warren_by_Gage_Skidmore.jpg/330px-Elizabeth_Warren_by_Gage_Skidmore.jpg",
  "eric-hovde": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/2024_United_States_Senate_election_in_Wisconsin_results_map_by_county.svg/330px-2024_United_States_Senate_election_in_Wisconsin_results_map_by_county.svg.png",
  "gary-peters": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Gary_Peters_official_photo_115th_congress.jpg/330px-Gary_Peters_official_photo_115th_congress.jpg",
  "gavin-newsom": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Governor_of_California_Gavin_Newsom_%28cropped_3x4%29.jpg/330px-Governor_of_California_Gavin_Newsom_%28cropped_3x4%29.jpg",
  "glenn-youngkin": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Youngkin_Governor_Portrait.jpg/330px-Youngkin_Governor_Portrait.jpg",
  "graham-platner": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Platner_headshot.jpg/330px-Platner_headshot.jpg",
  "greg-abbott": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Greg_Abbott_at_NASA_2024_%28cropped%29.jpg/330px-Greg_Abbott_at_NASA_2024_%28cropped%29.jpg",
  "gretchen-whitmer": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/2025_Gretchen_Whitmer_%28cropped%29.jpg/330px-2025_Gretchen_Whitmer_%28cropped%29.jpg",
  "hakeem-jeffries": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Rep-Hakeem-Jeffries-Official-Portrait_%28cropped%29.jpg/330px-Rep-Hakeem-Jeffries-Official-Portrait_%28cropped%29.jpg",
  "haley-stevens": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Haley_Stevens%2C_official_portrait%2C_116th_Congress.jpg/330px-Haley_Stevens%2C_official_portrait%2C_116th_Congress.jpg",
  "jacky-rosen": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Senator_Jacky_Rosen_Official_Portrait_%282022%29.jpg/330px-Senator_Jacky_Rosen_Official_Portrait_%282022%29.jpg",
  "james-talarico": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/James_Talarico_Press_Conference_%28cropped%29.jpg/330px-James_Talarico_Press_Conference_%28cropped%29.jpg",
  "jb-pritzker": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Governor_JB_Pritzker_official_portrait_2019_%28crop%29.jpg/330px-Governor_JB_Pritzker_official_portrait_2019_%28crop%29.jpg",
  "jd-vance": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_%28head-and-shoulders_cropped%29.jpg/330px-March_2026_Official_Vice_Presidential_Portrait_of_JD_Vance_%28head-and-shoulders_cropped%29.jpg",
  "jeanne-shaheen": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Sen._Jeanne_Shaheen_%28D-NH%29%2C_Official_Portrait%2C_117th_Congress.jpg/330px-Sen._Jeanne_Shaheen_%28D-NH%29%2C_Official_Portrait%2C_117th_Congress.jpg",
  "jim-banks": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Senator_Banks_Official_Portrait.jpg/330px-Senator_Banks_Official_Portrait.jpg",
  "joe-biden": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Joe_Biden_presidential_portrait.jpg/330px-Joe_Biden_presidential_portrait.jpg",
  "joe-lombardo": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Joe_Lombardo_by_Gage_Skidmore_%283x4_cropped%29.jpg/330px-Joe_Lombardo_by_Gage_Skidmore_%283x4_cropped%29.jpg",
  "john-cornyn": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/John_Cornyn.jpg/330px-John_Cornyn.jpg",
  "john-fetterman": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/John_Fetterman_official_portrait.jpg/330px-John_Fetterman_official_portrait.jpg",
  "john-hickenlooper": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/John_Hickenlooper%2C_official_portrait%2C_117th_Congress.jpeg/330px-John_Hickenlooper%2C_official_portrait%2C_117th_Congress.jpeg",
  "john-sununu": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/John_E._Sununu.jpg/330px-John_E._Sununu.jpg",
  "jon-husted": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Sen._Jon_Husted_official_portrait%2C_119th_Congress.jpg/330px-Sen._Jon_Husted_official_portrait%2C_119th_Congress.jpg",
  "jon-ossoff": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jon_Ossoff_Senate_Portrait_2021.jpg/330px-Jon_Ossoff_Senate_Portrait_2021.jpg",
  "jon-tester": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/JonTester.jpg/330px-JonTester.jpg",
  "josh-shapiro": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Josh_Shapiro_December_2025.jpg/330px-Josh_Shapiro_December_2025.jpg",
  "justin-trudeau": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Prime_Minister_Trudeau%27s_message_on_Christmas_2023_%280m29s%29_%28cropped%29.jpg/330px-Prime_Minister_Trudeau%27s_message_on_Christmas_2023_%280m29s%29_%28cropped%29.jpg",
  "kamala-harris": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Kamala_Harris_Vice_Presidential_Portrait.jpg/330px-Kamala_Harris_Vice_Presidential_Portrait.jpg",
  "kari-lake": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Kari_Lake_by_Gage_Skidmore_4.jpg/330px-Kari_Lake_by_Gage_Skidmore_4.jpg",
  "kathy-hochul": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Kathy_Hochul_March_2024.jpg/330px-Kathy_Hochul_March_2024.jpg",
  "katie-hobbs": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Katie_Hobbs_2026.jpg/330px-Katie_Hobbs_2026.jpg",
  "keir-starmer": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Prime_Minister_Keir_Starmer_Portrait_%28cropped%29.jpg/330px-Prime_Minister_Keir_Starmer_Portrait_%28cropped%29.jpg",
  "ken-paxton": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/K_Paxton.jpg/330px-K_Paxton.jpg",
  "larry-hogan": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Larry_Hogan_%282021%29_%28cropped%29.jpg/330px-Larry_Hogan_%282021%29_%28cropped%29.jpg",
  "lindsey-graham": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/U.S._Senator_Lindsey_Graham%2C_Official_Photo%2C_113th_Congress_%283x4_cropped%29.jpg/330px-U.S._Senator_Lindsey_Graham%2C_Official_Photo%2C_113th_Congress_%283x4_cropped%29.jpg",
  "marco-rubio": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Official_portrait_of_Secretary_Marco_Rubio_%28cropped%29%282%29.jpg/330px-Official_portrait_of_Secretary_Marco_Rubio_%28cropped%29%282%29.jpg",
  "mark-carney": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/2025-11-14_InaugurationREM_Deux-Montagnes_Mark_Carney.jpg/330px-2025-11-14_InaugurationREM_Deux-Montagnes_Mark_Carney.jpg",
  "mark-kelly": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Sen._Mark_Kelly_%28D-AZ%29%2C_Official_Portrait%2C_119th_Congress.jpg/330px-Sen._Mark_Kelly_%28D-AZ%29%2C_Official_Portrait%2C_119th_Congress.jpg",
  "michael-bennet": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Senator_Mike_Bennett.jpg/330px-Senator_Mike_Bennett.jpg",
  "michael-whatley": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Michael_Whatley_%2854670563614%29_%28cropped%29.jpg/330px-Michael_Whatley_%2854670563614%29_%28cropped%29.jpg",
  "mike-collins": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/Rep._Mike_Collins_official_photo%2C_118th_Congress.jpg/330px-Rep._Mike_Collins_official_photo%2C_118th_Congress.jpg",
  "mike-johnson": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Speaker_Mike_Johnson_Official_Portrait_%28cropped%29%28b%29.jpg/330px-Speaker_Mike_Johnson_Official_Portrait_%28cropped%29%28b%29.jpg",
  "mike-rogers": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Mike-Rogers-Head-Shot-2_%283x4_cropped%29.jpg/330px-Mike-Rogers-Head-Shot-2_%283x4_cropped%29.jpg",
  "mitch-mcconnell": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Mitch_McConnell_2016_official_photo_%281%29_%28cropped%29.jpg/330px-Mitch_McConnell_2016_official_photo_%281%29_%28cropped%29.jpg",
  "nigel-farage": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Official_portrait_of_Nigel_Farage_MP_%283x4_cropped%29.jpg/330px-Official_portrait_of_Nigel_Farage_MP_%283x4_cropped%29.jpg",
  "nikki-haley": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Nikki_Haley_official_photo.jpg/330px-Nikki_Haley_official_photo.jpg",
  "peggy-flanagan": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/2026PeggyFlanagan_%28newcropped%29.jpg/330px-2026PeggyFlanagan_%28newcropped%29.jpg",
  "pete-ricketts": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Sen._Pete_Ricketts_Official_Portrait%2C_118th_Congress.jpg/330px-Sen._Pete_Ricketts_Official_Portrait%2C_118th_Congress.jpg",
  "phil-weiser": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/AG_Phil_Weiser.jpg/330px-AG_Phil_Weiser.jpg",
  "raphael-warnock": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Raphael_Warnock_official_photo.jpg/330px-Raphael_Warnock_official_photo.jpg",
  "rfk-jr": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Robert_F._Kennedy_Jr.%2C_official_portrait_%282025%29_%28cropped_3-4%29_%28b%29.jpg/330px-Robert_F._Kennedy_Jr.%2C_official_portrait_%282025%29_%28cropped_3-4%29_%28b%29.jpg",
  "ron-desantis": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Ron_DeSantis_official_photo.jpg/330px-Ron_DeSantis_official_photo.jpg",
  "roy-cooper": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Roy_Cooper_in_November_2023_%28cropped2%29.jpg/330px-Roy_Cooper_in_November_2023_%28cropped2%29.jpg",
  "ruben-gallego": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Senator_Ruben_Gallego_Official_Portrait.jpg/330px-Senator_Ruben_Gallego_Official_Portrait.jpg",
  "sarah-huckabee-sanders": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Governor_Sarah_Huckabee_Sanders_2026.jpg/330px-Governor_Sarah_Huckabee_Sanders_2026.jpg",
  "scott-brown": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Ambassador_Scott_Brown.jpg/330px-Ambassador_Scott_Brown.jpg",
  "sherrod-brown": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Sen._Sherrod_Brown_%28D-Ohio%29%2C_Official_Portrait%2C_117th_Congress.jpg/330px-Sen._Sherrod_Brown_%28D-Ohio%29%2C_Official_Portrait%2C_117th_Congress.jpg",
  "steve-daines": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Steve_Daines%2C_Official_Portrait%2C_116th_Congress.jpg/330px-Steve_Daines%2C_Official_Portrait%2C_116th_Congress.jpg",
  "susan-collins": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Senator_Susan_Collins_2014_official_portrait.jpg/330px-Senator_Susan_Collins_2014_official_portrait.jpg",
  "tammy-baldwin": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Tammy_Baldwin%2C_official_portrait%2C_113th_Congress.jpg/330px-Tammy_Baldwin%2C_official_portrait%2C_113th_Congress.jpg",
  "ted-cruz": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Ted_Cruz_official_116th_portrait_%283x4_cropped%29.jpg/330px-Ted_Cruz_official_116th_portrait_%283x4_cropped%29.jpg",
  "thom-tillis": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bc/Sen._Thom_Tillis_%28R-NC%29%2C_Official_Portrait%2C_117th_Congress_%28cropped%29.jpg/330px-Sen._Thom_Tillis_%28R-NC%29%2C_Official_Portrait%2C_117th_Congress_%28cropped%29.jpg",
  "tim-scott": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Tim_Scott_official_portrait.jpg/330px-Tim_Scott_official_portrait.jpg",
  "tim-sheehy": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Sen._Tim_Sheehy%2C_alternate_portrait%2C_119th_Congress.jpg/330px-Sen._Tim_Sheehy%2C_alternate_portrait%2C_119th_Congress.jpg",
  "tina-smith": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Sen._Tina_Smith_%28D-MN%29%2C_Official_Portrait%2C_116th_Congress.jpg/330px-Sen._Tina_Smith_%28D-MN%29%2C_Official_Portrait%2C_116th_Congress.jpg",
  "tony-evers": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Tony_Evers_-_2022_%28a%29.jpg/330px-Tony_Evers_-_2022_%28a%29.jpg",
  "vivek-ramaswamy": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Vivek_Ramaswamy_%2855241367373%29_%28cropped%29.jpg/330px-Vivek_Ramaswamy_%2855241367373%29_%28cropped%29.jpg",
  "vladimir-putin": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/%D0%92%D0%BB%D0%B0%D0%B4%D0%B8%D0%BC%D0%B8%D1%80_%D0%9F%D1%83%D1%82%D0%B8%D0%BD_%2808-03-2024%29_%28cropped%29_%28higher_res%29_2.jpg/330px-%D0%92%D0%BB%D0%B0%D0%B4%D0%B8%D0%BC%D0%B8%D1%80_%D0%9F%D1%83%D1%82%D0%B8%D0%BD_%2808-03-2024%29_%28cropped%29_%28higher_res%29_2.jpg",
  "volodymyr-zelenskyy": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Volodymyr_Zelensky_2022_official_portrait_%28cropped%29.jpg/330px-Volodymyr_Zelensky_2022_official_portrait_%28cropped%29.jpg",
  "wes-moore": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Wes_Moore_Official_Governor_Portrait.jpg/330px-Wes_Moore_Official_Governor_Portrait.jpg",
  "xi-jinping": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Xi_Jinping_meets_Putin_May_2026.jpg/330px-Xi_Jinping_meets_Putin_May_2026.jpg",
  "zohran-mamdani": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Zohran_Mamdani_05.25.25_%28b%29_%28cropped%29.jpg/330px-Zohran_Mamdani_05.25.25_%28b%29_%28cropped%29.jpg",
};

/** Wikipedia article title used to resolve the portrait. */
export const POLITICIAN_WIKI: Record<string, string> = {
  "abdul-el-sayed": "Abdul_El-Sayed",
  "amy-klobuchar": "Amy_Klobuchar",
  "andy-beshear": "Andy_Beshear",
  "angela-alsobrooks": "Angela_Alsobrooks",
  "angie-craig": "Angie_Craig",
  "annie-andrews": "Annie_Andrews_(physician)",
  "aoc": "Alexandria_Ocasio-Cortez",
  "barack-obama": "Barack_Obama",
  "benjamin-netanyahu": "Benjamin_Netanyahu",
  "bernie-moreno": "Bernie_Moreno",
  "bernie-sanders": "Bernie_Sanders",
  "bob-casey": "Bob_Casey",
  "brian-kemp": "Brian_Kemp",
  "chris-murphy": "Chris_Murphy",
  "chris-pappas": "Chris_Pappas_(American_politician)",
  "chuck-schumer": "Chuck_Schumer",
  "colin-allred": "Colin_Allred",
  "cory-booker": "Cory_Booker",
  "darline-graham-nordone": "Darline_Graham_Nordone",
  "dave-mccormick": "Dave_McCormick",
  "deb-fischer": "Deb_Fischer",
  "dick-durbin": "Dick_Durbin",
  "donald-trump": "Donald_Trump",
  "elissa-slotkin": "Elissa_Slotkin",
  "elizabeth-warren": "Elizabeth_Warren",
  "eric-hovde": "Eric_Hovde",
  "gary-peters": "Gary_Peters",
  "gavin-newsom": "Gavin_Newsom",
  "glenn-youngkin": "Glenn_Youngkin",
  "graham-platner": "Graham_Platner",
  "greg-abbott": "Greg_Abbott",
  "gretchen-whitmer": "Gretchen_Whitmer",
  "hakeem-jeffries": "Hakeem_Jeffries",
  "haley-stevens": "Haley_Stevens",
  "jacky-rosen": "Jacky_Rosen",
  "james-talarico": "James_Talarico",
  "jb-pritzker": "J._B._Pritzker",
  "jd-vance": "JD_Vance",
  "jeanne-shaheen": "Jeanne_Shaheen",
  "jim-banks": "Jim_Banks",
  "joe-biden": "Joe_Biden",
  "joe-lombardo": "Joe_Lombardo",
  "john-cornyn": "John_Cornyn",
  "john-fetterman": "John_Fetterman",
  "john-hickenlooper": "John_Hickenlooper",
  "john-sununu": "John_E._Sununu",
  "jon-husted": "Jon_Husted",
  "jon-ossoff": "Jon_Ossoff",
  "jon-tester": "Jon_Tester",
  "josh-shapiro": "Josh_Shapiro",
  "justin-trudeau": "Justin_Trudeau",
  "kamala-harris": "Kamala_Harris",
  "kari-lake": "Kari_Lake",
  "kathy-hochul": "Kathy_Hochul",
  "katie-hobbs": "Katie_Hobbs",
  "keir-starmer": "Keir_Starmer",
  "ken-paxton": "Ken_Paxton",
  "larry-hogan": "Larry_Hogan",
  "lindsey-graham": "Lindsey_Graham",
  "marco-rubio": "Marco_Rubio",
  "mark-carney": "Mark_Carney",
  "mark-kelly": "Mark_Kelly",
  "michael-bennet": "Michael_Bennet",
  "michael-whatley": "Michael_Whatley",
  "mike-collins": "Mike_Collins_(politician)",
  "mike-johnson": "Mike_Johnson_(Louisiana_politician)",
  "mike-rogers": "Mike_Rogers_(Michigan_politician)",
  "mitch-mcconnell": "Mitch_McConnell",
  "nigel-farage": "Nigel_Farage",
  "nikki-haley": "Nikki_Haley",
  "peggy-flanagan": "Peggy_Flanagan",
  "pete-ricketts": "Pete_Ricketts",
  "phil-weiser": "Phil_Weiser",
  "raphael-warnock": "Raphael_Warnock",
  "rfk-jr": "Robert_F._Kennedy_Jr.",
  "ron-desantis": "Ron_DeSantis",
  "roy-cooper": "Roy_Cooper",
  "ruben-gallego": "Ruben_Gallego",
  "sam-brown": "Sam_Brown",
  "sarah-huckabee-sanders": "Sarah_Huckabee_Sanders",
  "scott-brown": "Scott_Brown_(politician)",
  "sherrod-brown": "Sherrod_Brown",
  "steve-daines": "Steve_Daines",
  "susan-collins": "Susan_Collins",
  "tammy-baldwin": "Tammy_Baldwin",
  "ted-cruz": "Ted_Cruz",
  "thom-tillis": "Thom_Tillis",
  "tim-scott": "Tim_Scott",
  "tim-sheehy": "Tim_Sheehy",
  "tina-smith": "Tina_Smith",
  "tony-evers": "Tony_Evers",
  "vivek-ramaswamy": "Vivek_Ramaswamy",
  "vladimir-putin": "Vladimir_Putin",
  "volodymyr-zelenskyy": "Volodymyr_Zelenskyy",
  "wes-moore": "Wes_Moore",
  "xi-jinping": "Xi_Jinping",
  "zohran-mamdani": "Zohran_Mamdani",
};

export function photoForSlug(slug: string): string | null {
  return POLITICIAN_PHOTOS[slug] ?? null;
}

export function wikiTitleForSlug(slug: string): string | null {
  return POLITICIAN_WIKI[slug] ?? null;
}

/** Guess a Wikipedia article title from a display name. */
export function wikiTitleFromName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[’']/g, "'");
}

/** Initials for monogram fallback (e.g. "Jon Ossoff" → "JO"). */
export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Same-origin photo URL used in the UI.
 * Always return the proxy path — the API resolves static maps, live KV, or Wikipedia by name.
 * Avatars keep a monogram underneath; img onerror removes a missing portrait.
 */
export function photoSrc(slug: string): string {
  return `/api/politician-photo/${encodeURIComponent(slug)}`;
}
