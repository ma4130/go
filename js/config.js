// ゲーム全体の設定。数字はここを変えれば調整できます。

export const GAME_NAME = 'あるいてモンスター（仮）';

// 地図の初期位置（位置情報が取れないとき・デバッグ時）: 東京駅
export const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 };

// キャラの出現
export const SPAWN = {
  cellDeg: 0.001,     // 地図を区切るマス目の大きさ（約100m）
  windowMin: 15,      // 何分ごとに出現が入れ替わるか
  viewRadiusM: 200,   // 自分の周り何mのキャラを表示するか
  catchRadiusM: 50,   // 何m以内なら捕まえられるか
  revealRadiusM: 110, // これより遠いキャラは草むらが揺れるだけ（姿は見えない）
  chanceOne: 0.5,     // 1マスに1匹出る確率
  chanceTwo: 0.08,    // 1マスに2匹出る確率
};

// スポット
export const SPOT = {
  useRadiusM: 50,     // 何m以内なら使えるか
  cooldownMin: 5,     // 同じスポットを再び使えるまでの分数
  ballsMin: 3,
  ballsMax: 5,
};

export const START_BALLS = 20;

// これより速く移動しているときは遊べない（乗り物対策）: 時速30km
export const SPEED_LIMIT_MS = 30 / 3.6;

// レア度ごとの設定
//   weight: 出やすさ / baseCatch: 基本の捕まえやすさ / flee: 逃げる確率
export const RARITY = {
  common: { label: 'ふつう', weight: 10, baseCatch: 0.5, flee: 0.08 },
  rare: { label: 'レア', weight: 3, baseCatch: 0.25, flee: 0.15 },
  super: { label: '超レア', weight: 1, baseCatch: 0.1, flee: 0.25 },
};

// 経験値
export const XP = {
  catch: 100,
  newSpecies: 500,
  nice: 10,
  great: 50,
  excellent: 100,
  curve: 10,
  spot: 50,
};

// 投げ方の倍率（遊んでみて調整してください）
export const THROW = {
  curveMultiplier: 1.7,
  // サークルの大きさ(1=最大)ごとの判定の境目
  niceAbove: 0.7,   // 0.7〜1.0 → ナイス
  greatAbove: 0.3,  // 0.3〜0.7 → グレート、0.3未満 → エクセレント
  ringPeriodMs: 2200, // サークルが大きくなって小さくなる周期
  // 投げる強さ（スマホに合わせて調整してください）
  idealSpeedPerPx: 4.3, // ちょうど届くスワイプの速さ ＝ ボールの置き場所からキャラまでの距離(px) × この数（距離350pxなら秒速約1500px）
  powerMin: 0.4,        // これより弱いと「とどかない」（ちょうどの何倍か）
  powerMax: 2.6,        // これより強いと「とびすぎ」
  curveDrift: 1.45,     // カーブボールが横に曲がる量（サークルの大きさの何倍か）
  aimAssist: 0.6,       // 横のずれを何倍にするか（1=補正なし、小さいほど当てやすい）
};
