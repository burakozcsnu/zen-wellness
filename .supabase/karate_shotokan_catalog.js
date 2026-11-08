const source = 'Türkiye Karate Federasyonu Shotokan Kyu/Dan sınav soruları';
const sourceUrl = 'https://www.karate.gov.tr/uploads/sayfa_belgeler/sp_1779187264_9175.pdf';

const kataNames = [
  ['Taikyoku Shodan', '6. Kyu (Sarı)'], ['Taikyoku Nidan', '5. Kyu'],
  ['Taikyoku Sandan', '4. Kyu'],
  ['Heian Shodan', '6. Kyu (Sarı)'], ['Heian Nidan', '6. Kyu (Sarı)'],
  ['Heian Sandan', '5. Kyu'], ['Heian Yondan', '4. Kyu'],
  ['Heian Godan', '3. Kyu'], ['Tekki Shodan', '2. Kyu'],
  ['Bassai Dai', '1. Kyu'], ['Jion', '1. Dan'], ['Kanku Dai', '1. Dan'],
  ['Empi', '1. Dan'], ['Tekki Nidan', '2. Dan'], ['Tekki Sandan', '2. Dan'],
  ['Bassai Sho', '2. Dan'], ['Kanku Sho', '2. Dan'], ['Jitte', '2. Dan'],
  ['Hangetsu', '2. Dan'], ['Gankaku', '2. Dan'], ['Chinte', '2. Dan'],
  ['Unsu', '2. Dan'], ['Nijushiho', '2. Dan'], ['Sochin', '2. Dan'],
  ['Wankan', '2. Dan'], ['Meikyo', '2. Dan']
];

const syllabus = [
  ['6. Kyu (Sarı)', [
    'Oi Zuki Jodan', 'Oi Zuki Chudan', 'Nihon Zuki', 'Age Uke - Gyaku Zuki',
    'Soto Uke - Gyaku Zuki', 'Uchi Uke - Gyaku Zuki', 'Gedan Barai - Gyaku Zuki',
    'Shuto Uke - Tate Nukite', 'Kizami Mae Geri - Mae Geri', 'Kizami Yoko Geri - Yoko Geri',
    'Kizami Mawashi Geri - Mawashi Geri', 'Ushiro Geri'
  ], ['Gohon Kumite: Oi Zuki Jodan', 'Gohon Kumite: Oi Zuki Chudan', 'Gohon Kumite: Mae Geri Chudan']],
  ['5. Kyu', [
    'Sanbon Zuki', 'Age Uke - Gyaku Zuki - Age Empi Uchi',
    'Soto Uke - Yoko Empi Uchi - Gyaku Zuki', 'Uchi Uke - Kizami Zuki - Gyaku Zuki',
    'Gedan Barai - Uraken Uchi - Gyaku Zuki', 'Mae Geri - Oi Zuki',
    'Yoko Geri Kekomi - Gyaku Zuki', 'Mawashi Geri - Gyaku Zuki'
  ], ['Gohon Kumite: Mae Geri Chudan', 'Kihon Ippon Kumite: Oi Zuki Jodan', 'Kihon Ippon Kumite: Oi Zuki Chudan']],
  ['4. Kyu', [
    'Age Uke - Gyaku Zuki - Mae Geri', 'Soto Uke - Yoko Empi Uchi - Gyaku Zuki',
    'Uchi Uke - Kizami Zuki - Gyaku Zuki - Mae Empi Uchi',
    'Gedan Barai - Uraken Uchi - Gyaku Zuki - Mae Geri',
    'Shuto Uke - Kizami Mae Geri - Gyaku Zuki', 'Mawashi Geri - Oi Zuki - Gyaku Zuki',
    'Ushiro Geri - Gyaku Zuki', 'Ren Zuki with Zenkutsu Dachi'
  ], ['Sanbon Kumite: Oi Zuki Jodan', 'Sanbon Kumite: Oi Zuki Chudan', 'Sanbon Kumite: Mae Geri Chudan']],
  ['3. Kyu', [
    'Kizami Zuki - Gyaku Zuki - Mae Geri', 'Age Uke - Gyaku Zuki - Mawashi Geri',
    'Soto Uke - Kizami Zuki - Gyaku Zuki - Yoko Geri Kekomi',
    'Uchi Uke - Gyaku Zuki - Ushiro Geri', 'Gedan Barai - Oi Zuki - Gyaku Zuki',
    'Shuto Uke - Mae Geri - Gyaku Zuki', 'Mawashi Geri - Gyaku Zuki - Ushiro Geri',
    'Renraku Waza: Jodan-Chudan-Gedan'
  ], ['Kihon Ippon Kumite: Mae Geri', 'Kihon Ippon Kumite: Yoko Geri', 'Jiyu Kumite: controlled entry']],
  ['2. Kyu', [
    'Kizami Zuki - Gyaku Zuki - Mae Geri - Mawashi Geri',
    'Age Uke - Gyaku Zuki - Ushiro Geri', 'Soto Uke - Gyaku Zuki - Yoko Geri',
    'Uchi Uke - Kizami Zuki - Gyaku Zuki - Mae Geri',
    'Gedan Barai - Uraken - Gyaku Zuki - Mawashi Geri',
    'Shuto Uke - Kizami Mae Geri - Gyaku Zuki - Ushiro Geri',
    'Yoko Geri Kekomi - Oi Zuki - Gyaku Zuki', 'Renraku Waza with stance transition'
  ], ['Kihon Ippon Kumite: Mawashi Geri', 'Kihon Ippon Kumite: Ushiro Geri', 'Jiyu Kumite: distance and timing']],
  ['1. Kyu', [
    'Jodan Oi Zuki - Chudan Gyaku Zuki - Mae Geri',
    'Kizami Zuki - Gyaku Zuki - Mawashi Geri - Ushiro Geri',
    'Age Uke - Gyaku Zuki - Yoko Geri Kekomi - Gyaku Zuki',
    'Soto Uke - Kizami Zuki - Gyaku Zuki - Mawashi Geri',
    'Uchi Uke - Gyaku Zuki - Mae Empi Uchi - Gyaku Zuki',
    'Gedan Barai - Uraken Uchi - Gyaku Zuki - Ushiro Geri',
    'Shuto Uke - Nukite - Mae Geri', 'Renraku Waza: free combination'
  ], ['Kihon Ippon Kumite: combination attacks', 'Jiyu Kumite: attack and counter', 'Jiyu Kumite: controlled free sparring']],
  ['1. Dan', [
    'Oi Zuki - Gyaku Zuki - Mae Geri - Mawashi Geri',
    'Kizami Zuki - Gyaku Zuki - Yoko Geri Kekomi - Ushiro Geri',
    'Age Uke - Gyaku Zuki - Mae Empi Uchi - Uraken Uchi',
    'Soto Uke - Kizami Zuki - Gyaku Zuki - Mae Geri',
    'Uchi Uke - Gyaku Zuki - Mawashi Geri - Ushiro Geri',
    'Gedan Barai - Gyaku Zuki - Yoko Geri - Gyaku Zuki',
    'Shuto Uke - Kizami Mae Geri - Gyaku Zuki', 'Tokui Waza: individual combination'
  ], ['Jiyu Ippon Kumite: Jodan', 'Jiyu Ippon Kumite: Chudan', 'Jiyu Kumite: ippon control']],
  ['2. Dan', [
    'Kihon combination with all three levels', 'Renraku Waza: changing attack rhythm',
    'Kizami Zuki - Gyaku Zuki - Ura Mawashi Geri', 'Gyaku Zuki - Mae Geri - Ushiro Geri',
    'Age Uke - Gyaku Zuki - Mawashi Geri - Uraken Uchi',
    'Soto Uke - Gyaku Zuki - Yoko Geri Kekomi - Ushiro Geri',
    'Shuto Uke - Nukite - Mae Geri - Gyaku Zuki', 'Tokui Waza under pressure'
  ], ['Jiyu Ippon Kumite: all attacks', 'Jiyu Kumite: tactical control', 'Jiyu Kumite: free application']]
];

const makeExercise = (name, rank, drill, bodyPart = 'Tüm Vücut') => ({
  name: `Shotokan ${name}`,
  branch: 'Karate',
  bodyPart,
  muscles: ['Core', 'Tüm Vücut'],
  equipment: 'Vücut ağırlığı',
  level: rank.includes('Dan') ? 'İleri' : 'Orta',
  classification: ['Compound', 'Bölgesel', 'Fasyal'],
  drill,
  rank,
  style: 'Shotokan',
  source,
  sourceUrl
});

module.exports = [
  ...kataNames.map(([name, rank]) => makeExercise(name, rank, 'Kata')),
  ...syllabus.flatMap(([rank, kihon, kumite]) => [
    ...kihon.map(item => makeExercise(`${rank} Kihon: ${item}`, rank, 'Kihon')),
    ...kumite.map(item => makeExercise(`${rank} ${item}`, rank, 'Kumite'))
  ])
];
