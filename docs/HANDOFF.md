# ローカルのチャットに貼るプロンプト

下の枠の中をそのまま貼ってください。

---

```
GitHubリポジトリ ma4130/go にある、ポケモンGO風の位置情報Webゲーム「あるいてモンスター（仮）」の続きをお願いします。
ゲーム本体・管理画面・スポット管理画面はもうできていて、残りは Firebase と GitHub Pages の設定です。

## 今の状態
- ブランチ claude/compassionate-heisenberg-oa9hds に全部のコードがあります。リポジトリにはまだこのブランチしかなく、main ブランチはありません。
- HTML/CSS/JavaScriptだけで、ビルドは不要です。
- js/firebase-config.js が null のあいだは「ローカル保存モード」（ブラウザの中だけに保存）で動きます。
- ここに Firebase の設定を貼ると、自動で Firestore を使うようになります（js/store-firebase.js、Firebase JS SDK 10.12.2 をCDNから読み込み）。
- 詳しくは README.md を見てください。

## やってほしいこと（順番に、1つずつ説明しながら進めてください）
1. claude/compassionate-heisenberg-oa9hds から main ブランチを作り、main をデフォルトブランチにする（作ってよいか、先に私に確認してください）
2. Firebase プロジェクトを作る
   - 無料プラン（Spark）のまま。有料プラン（Blaze）にはしない
   - Google アナリティクスは不要
3. Cloud Firestore を作る
   - 場所は asia-northeast1（東京）
   - 本番モードで作り、リポジトリの firestore.rules の中身をルールに貼って公開する
4. Firebase にウェブアプリを登録し、出てきた firebaseConfig を js/firebase-config.js に貼る
   - Firebase Hosting の設定はしない（公開は GitHub Pages を使う）
   - Authentication も使わない（ログインは名前だけ、管理画面はURLで開くだけ、という仕様）
5. リポジトリ ma4130/go を公開（Public）にする（GitHub Pages を無料で使うため。公開してよいか、先に私に確認してください）
6. GitHub Pages を有効にする（main ブランチの / (root) から公開）
7. 公開されたURL（https://ma4130.github.io/go/）で動くか確認する
   - ゲーム：/ 、管理画面：/admin.html 、スポット管理：/spots.html
   - スポット管理で、私の家の近くにスポットをいくつか置く手伝いをしてほしい
8. 必要なら、Firebase の承認済みドメインに ma4130.github.io を追加する

## 私の好み
- 手順は1つずつ説明してください
- コンピューターユースを積極的に使ってよいですが、使う前に確認してください
- ログインが必要なものはアプリ内ブラウザを使わないでください（いつものブラウザでやります）
- 必要な知識は調べてから教えてください

## 注意
- Firebase の Web 用 apiKey は公開しても問題ない種類のものですが、firestore.rules は「だれでも読み書きできる」設定です（友だち同士で遊ぶ前提）。一般公開するなら厳しくする必要があります。
- ローカル保存モードで遊んだデータは Firebase には移りません。
```
