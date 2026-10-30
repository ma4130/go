# あるいてモンスター（仮）

ポケモンGO風の位置情報ゲーム（Webブラウザで遊ぶ版）。友だち同士で遊ぶ前提です。

## ページ

| URL | 内容 |
|---|---|
| `index.html` | ゲーム本体（地図・キャラ出現・捕獲・スポット・図鑑） |
| `admin.html` | 管理画面：ユーザー一覧と詳細（URLを開くだけで使える） |
| `spots.html` | スポット管理：地図をタップしてスポットを追加・名前変更・移動・削除 |

## 使っているもの

- 地図：Leaflet 1.9.4 ＋ OpenStreetMap（CDNから読み込み）
- データ保存：Firebase Cloud Firestore（無料プラン）
  - `js/firebase-config.js` が `null` のあいだは **ローカル保存モード**（そのブラウザの中だけに保存）で動きます
- 公開：GitHub Pages（ビルド不要。HTML/CSS/JavaScriptだけ）

## ファイル

```
index.html / admin.html / spots.html
css/style.css
js/config.js           数字の設定（出現範囲・ボール数・捕まえやすさなど）
js/characters.js       仮キャラ20種類（あとで差し替え）
js/spawn.js            出現のしくみ（マス目＋時間で決まる）
js/capture.js          捕獲画面（サークル・スワイプ・カーブ・揺れ）
js/game.js             ゲーム本体
js/admin.js            管理画面
js/spots.js            スポット管理
js/store*.js           データ保存（ローカル / Firebase）
js/firebase-config.js  Firebaseの設定を貼る場所
firestore.rules        Firestoreのセキュリティルール
```

## データの形（Firestore）

```
users/{名前}                 名前, 始めた日, 最後に遊んだ日, ボール数, XP, 歩いた距離,
                             捕まえた数, 図鑑, 最後にいた場所, スポットの使用時刻 など
users/{名前}/catches/{id}    キャラID, 捕まえた日時, 場所, 投げ方の判定, カーブ
spots/{id}                   名前, 緯度, 経度
```

## パソコンで動作確認する

位置情報はHTTPSか `localhost` でしか使えません。

```bash
python3 -m http.server 8000
```

- ゲーム：http://localhost:8000/
- デバッグ（GPSなしで、地図タップや矢印キーで移動）：http://localhost:8000/?debug=1
- 管理画面：http://localhost:8000/admin.html
- スポット管理：http://localhost:8000/spots.html

## 決めたこと（仕様）

- ログイン：名前だけ。同じ名前を入れるとそのデータで遊べる（2回目からは自動ログイン）
- 出現：半径200m以内に5〜10匹。50m以内に近づくと捕まえられる。15分ごとに入れ替わる
- 捕獲：ポケモンGOと同じ流れ（サークル、上スワイプ、カーブ、ナイス/グレート/エクセレント、3回揺れ、逃げる）
- ボール：最初20個。スポットで3〜5個補充（同じスポットは5分ごと）
- 安全：初回に注意画面。時速30km以上で動いているときは遊べない
- 後回し：キャラ管理画面、ズル対策（Cloud Functions）、イベント、交換・バトル
