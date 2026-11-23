# 🎾 ダブルス次の一手

テニスのダブルスで「1ポイントの中の次の1手」を考える、詰将棋風のスマホ向けトレーニングアプリです。

- サーブ〜ラリーがコート図で再生され、**あなたが打つ直前**で止まります
- 選択肢を選ぶと、相手の返球と味方の動きが再生され、**同じポイントの次の場面**へ
- 悪手を選ぶとその結果を再生し、解説のあと「正解の流れ」を再生
- 球種（フラット／トップスピン／スライス／ロブ／ボレー／ドロップ／スマッシュ）ごとに軌道・高さ・球速変化が異なります
  - 軌跡のドットは一定時間ごと → 間隔が広いほど速い
  - 画面上部の小さなグラフは、横から見た弾道とネットの高さ
- 問題は30問（各4〜5場面）。スコアはブラウザ（localStorage）に保存されます

## 遊び方（ローカル）

ビルド不要の静的サイトです。

```powershell
cd tennis_doubles_puzzle
python -m http.server 8123
# ブラウザで http://localhost:8123 を開く
```

## GitHub Pages で公開する

```powershell
cd tennis_doubles_puzzle
git init -b main
git add .
git commit -m "初回公開"
# GitHub で空のリポジトリ(例: tennis-doubles-puzzle)を作成してから
git remote add origin https://github.com/<ユーザー名>/tennis-doubles-puzzle.git
git push -u origin main
```

GitHub のリポジトリ → **Settings → Pages → Source: Deploy from a branch → main / (root)** を選ぶと、
`https://<ユーザー名>.github.io/tennis-doubles-puzzle/` で公開されます。スマホで開き、
ホーム画面に追加するとアプリのように使えます（オフライン対応）。

## 問題を追加する

`js/problems*.js` に問題を追加します。座標はメートルで、`x:0(左)〜10.97(右)`、`y:0(相手ベースライン)〜23.77(自分ベースライン)`、ネットは `y=11.885`。

```js
T(打つ人, 球種, バウンド位置|null, 終点, 次に打つ人, { eh, mv, say, fin, net })
O('選択肢', ok(2=最善/1=次善/0=悪手), '解説', alt(悪手の結果イベント), '結果の一言')
```

球種は `js/engine.js` の `TYPES` に定義（速度・山なり量・バウンド後の挙動）。

> 球速・弾道は理解しやすさを優先したイメージで、実測値ではありません。戦術は一般的なダブルスの定石に基づく一例です。
