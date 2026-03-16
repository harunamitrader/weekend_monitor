# Weekend Monitor

公開ページ: https://harunamitrader.github.io/weekend_monitor/

IG 証券の weekend 11 銘柄を 15 分ごとに取得し、GitHub Pages で公開するためのシンプルな監視ページです。

平日は前営業日の終値、土日は金曜日の終値を基準に変化量を表示することを目標にしており、そのために日次の終値スナップショットを保存します。

## 構成

- `docs/`: 公開用の静的ページ
- `docs/data/latest.json`: フロントエンドが読む最新データ
- `scripts/`: スクレイピングとデータ生成スクリプト
- `data/markets.json`: 監視対象 11 銘柄の固定定義
- `data/snapshots/baselines.json`: 前日終値・金曜終値の保存状態
- `data/history/YYYY-MM-DD.json`: 15 分ごとの価格履歴
- `data/history/index.json`: 履歴ファイル一覧
- `.github/workflows/update-data.yml`: GitHub Actions による定期更新

## 使い方

### ローカルでデータ生成

```bash
npm run build:data
```

必要であれば、日時を指定してスナップショットのロールオーバー挙動を確認できます。

```bash
$env:BUILD_NOW="2026-03-21T00:05:00+09:00"
npm run build:data
```

監視対象の 11 銘柄 URL は `data/markets.json` に固定で保持しており、検索ページから自動再取得はしない。

## 基準価格ロジック

### 優先順位

1. 保存済みの終値スナップショットを使う
2. スナップショットがまだ無い場合だけ、IG ページ上の公開差分から逆算する

### スナップショットの動き

- 毎回の取得で当日分の終値候補を更新する
- 日付が変わったタイミングで、前日の最終取得値を「終値」として繰り上げる
- 月曜から金曜の終値だけを `previousWeekdayClose` として保持する
- 金曜日の終値は `fridayClose` として別枠でも保持する
- 土曜日と日曜日は `fridayClose` を優先する

### 立ち上げ直後の注意

- リポジトリを公開した直後はスナップショット履歴が無いため、しばらくは `fallback` 表示になる
- 少なくとも 1 回は平日クローズをまたぐと、翌営業日から `前日終値基準` が効き始める
- 金曜クローズをまたぐと、その週末から `金曜終値基準` が効く

## 履歴データの保持

15 分ごとの取得結果は、最新値だけでなく履歴として永続保存する。

### 保存形式

- `data/history/YYYY-MM-DD.json` に、その日の取得ランを時系列で追加する
- 1 ランごとに 11 銘柄ぶんの価格データを保存する
- `data/history/index.json` に、保存済み日付とラン数をまとめる

### 1 ランで保存する内容

- 取得時刻
- 基準モード
- 銘柄ごとの `bid`, `offer`, `currentPrice`
- `baselinePrice`, `change`, `changePercent`
- `high`, `low`
- `baselineSource`
- `stale`, `error`

### 使い道

- 後から価格推移を見返す
- 将来的にチャートやダウンロード機能を追加する
- スクレイピング失敗や価格の歪みを検証する

## GitHub 公開手順

1. このフォルダを新規 public GitHub リポジトリとして push する
2. GitHub の `Settings > Actions > General` で Workflow permissions を `Read and write permissions` にする
3. GitHub の `Settings > Pages` で `Deploy from a branch` を選ぶ
4. ブランチは `main`、公開フォルダは `/docs` を指定する
5. `Actions` タブから `Update weekend market data` を一度手動実行して初回データを作る
6. `docs/data/latest.json`、`data/snapshots/baselines.json`、`data/history/` が更新されることを確認する

## 動作確認

### ローカル確認

- `npm run build:data`
- `docs/index.html` を静的サーバー経由で開く

### 公開確認

- GitHub Pages 上で 11 銘柄が表示される
- 最終更新時刻が出る
- 各銘柄の `Open` ボタンで IG ページへ飛べる
- スナップショットが溜まった後は `fallback` 表示が減る

## メモ

- GitHub Actions のスケジュールは遅延する場合がある
- IG 側の HTML 構造が変わるとパーサの調整が必要になる
- 監視対象一覧は検索ページではなく `data/markets.json` の固定 URL を使う
- 初回や履歴不足時は、商品ページに公開されている価格差分から基準価格を算出する
