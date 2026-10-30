// 仮のキャラ。あとで name / emoji を差し替えたり、image（画像のパス）を足したりできます。
// rarity: common（ふつう）/ rare（レア）/ super（超レア）

export const CHARACTERS = [
  { id: 'c01', name: 'ニャンコロ', emoji: '🐱', rarity: 'common' },
  { id: 'c02', name: 'ワンタ', emoji: '🐶', rarity: 'common' },
  { id: 'c03', name: 'ケロッパ', emoji: '🐸', rarity: 'common' },
  { id: 'c04', name: 'チュッピ', emoji: '🐭', rarity: 'common' },
  { id: 'c05', name: 'ピョンタ', emoji: '🐰', rarity: 'common' },
  { id: 'c06', name: 'ピヨリ', emoji: '🐤', rarity: 'common' },
  { id: 'c07', name: 'カメノスケ', emoji: '🐢', rarity: 'common' },
  { id: 'c08', name: 'ギョギョ', emoji: '🐟', rarity: 'common' },
  { id: 'c09', name: 'モソモソ', emoji: '🐛', rarity: 'common' },
  { id: 'c10', name: 'ノロロ', emoji: '🐌', rarity: 'common' },
  { id: 'c11', name: 'チュンピ', emoji: '🐦', rarity: 'common' },
  { id: 'c12', name: 'リスリス', emoji: '🐿️', rarity: 'common' },
  { id: 'c13', name: 'コンコン', emoji: '🦊', rarity: 'rare' },
  { id: 'c14', name: 'ホーホ', emoji: '🦉', rarity: 'rare' },
  { id: 'c15', name: 'タコリン', emoji: '🐙', rarity: 'rare' },
  { id: 'c16', name: 'ヒラリー', emoji: '🦋', rarity: 'rare' },
  { id: 'c17', name: 'ガルル', emoji: '🐺', rarity: 'rare' },
  { id: 'c18', name: 'トカゲッタ', emoji: '🦎', rarity: 'rare' },
  { id: 'c19', name: 'リュウオウ', emoji: '🐉', rarity: 'super' },
  { id: 'c20', name: 'ユニコーネ', emoji: '🦄', rarity: 'super' },
];

const byId = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getChar(id) {
  return byId.get(id) || { id, name: '？？？', emoji: '❓', rarity: 'common' };
}
