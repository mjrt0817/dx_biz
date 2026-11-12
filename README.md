# DXビジネス検定 学習管理 Web v2.6

**585問・196カード**。前版 v2.5 を基準にした更新版です。

## 新規追加

- ユーザー提供の60問のスクリーンショットを1〜60番まで目視確認し、論点に分類。
- 既存485問を維持して**独自予想問題100問（Q486〜Q585）**を追加。
- **追加カード35件（T162〜T196）**を追加。
- **今回の予想問題10問／20問** メニューを追加。前回の82問演習は残した。
- 新規100問は実戦形式の出題プールにも含む。
- 用語カードで「今回の追加カード」のフィルタを利用可能。
- 「今日の10問」や実戦形式で、先頭の旧問題だけに抽選が偏る問題を改善。
- 業務アプリ風デザイン、Googleログイン、Firestore同期、履歴読込／書出しを維持。

## 更新と履歴

1. 更新前に「データ管理」→「履歴を書き出し」でバックアップ。
2. ZIPを展開し、その中のフォルダのファイルを既存ホスティングへ上書きデプロイ。
3. 同じGoogleアカウントでログインし、クラウドから履歴を取得できることを確認。
4. 接続テストと今すぐ同期を確認。

問題ID Q001〜Q485は変更せず、T001〜T161も維持。LocalStorageキー・Firestoreの保存パス・Firebase設定ファイルに変更はありません。

## 問題の品質・位置づけ

- 追加問題は**スクリーンショットの文面を複製したものではありません**。出題傾向から新たな設問・選択肢・解説を作成。
- 選択肢は4択で、正解番号の固定配分は**各25問**。実際の表示時もランダム化。
- 誤答には各選択肢に対応する理由を用意。
- 企業・サービス固有の機能は公開情報に基づき作問。料金・数値など変動しやすい細部は出題対象外とした。
- **公式問題の転載でも、出題・合格を保証するものでもありません。** 公式eラーニングを主教材として併用してください。

## ファイル

- `index.html`, `app.js`, `styles.css`, `data.js`：アプリ本体
- `firebase-config.js`, `FIRESTORE_RULES.txt`：既存の接続設定
- `learning_data_585.json`, `questions_585.csv`：全問題データ
- `new_prediction_questions_100_v26.csv`：今回の新問100問
- `new_terms_v26.csv`：今回の追加カード35件
- `new_source_60_topic_index.csv`：いただいた60問の論点分類（本文は非転載）
- `ANALYSIS_v2_6.md`：今回の分析・差分・品質対策

## 主な外部参照先（例）
- [清水建設 DX-Core](https://www.shimz.co.jp/solution/tech373/index.html)
- [ユニファ ルクミー](https://unifa-e.com/service/)
- [EDEYANS Jtas](https://jtas-service.com/saas/)
- [eBrevia 契約分析](https://www.ebrevia.com/jp/contract-analyzer)
- [AGRIST ロボット](https://agrist.com/products/robot)
- [THEO](https://www.money-design.com/)
- [STORES](https://faq.stores.jp/hc/ja/articles/52834710423449-)
- [NEC 顔認証決済](https://jpn.nec.com/fintech/face_settlement/index.html)
- [ADDress](https://address.love/join?from=lp_socialize)
- [イルヨ](https://www.akachan.jp/company/news_release/article/240131_2/)
