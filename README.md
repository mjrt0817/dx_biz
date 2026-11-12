# DXビジネス検定 学習管理アプリ Web v2.4

**問題403問、用語・企業サービスカード140件。**

## 学習内容

- 実戦形式10問／20問：アップロードいただいた問題例の傾向に沿った **オリジナル51問**から出題。
- 今日の10問、サービス事例10問、分野別10／20問、苦手問題の復習。
- 12問／48問／96問の模試（時間制限あり、旧問題と実戦問題の混在）。
- 解答後の解説と選択肢の説明、毎回の正答位置シャッフル。
- 用語・企業事例カード、学習履歴閲覧、ローカルバックアップとGoogle同期。

## 設置方法

1. フォルダの内容を**まとめて**Webサーバーの公開ディレクトリへ配置します（Firebase Hosting、Vercel、Xserverなどの静的ホスティングで可）。
2. HTTPSで公開してください。Googleログインは `file://` では動作しません。
3. `firebase-config.js` は既に提供済みの `dx-biz` プロジェクトのWebアプリ設定が入っています。Firebase Consoleで Google 認証を有効にしてください。
4. Firebase Authentication → Settings → Authorized domains に、公開先ドメインを登録してください。
5. Firestore Databaseのルールに `FIRESTORE_RULES.txt` を参考にした本人のみアクセス可能なルールを設定してください。
6. Googleでログインし、画面の「接続テスト」→「今すぐ同期」を実行します。

`firebase.json` はFirebase Hosting用です。設定済みのサイトがある場合は、既存のディレクトリ構成を維持したまま差し替えてください。

## v2.3からの移行

- **同じURLで上書きデプロイ**する場合はLocalStorageに記録済みの学習履歴を通常は維持できます。
- 同じGoogleアカウントでログインすればFirestore上の履歴にアクセスできます。
- 念のため更新前に、メニューの「データ管理」→「履歴を書き出し」からJSONをバックアップしてください。
- URLやブラウザを変更する際は、v2.4へJSONをインポート→Googleでログイン→「今すぐ同期」で引き継げます。
- 既存の `Q001`〜`Q352` はIDを変更していません。新しい問題は `Q353`〜`Q403` です。
- データが消失しないよう、旧環境と新環境の両方で頻繁に同期する運用は避けてください。

## ファイル

- `index.html` / `styles.css` / `app.js`：画面・UI・学習ロジック
- `data.js`：ブラウザで利用するデータ（403問+140カード）
- `learning_data_403.json`：追加後の全データ
- `exam_style_questions_added.csv`：実戦51問の編集用CSV
- `questions_352.csv`, `service_case_questions_152.csv`, `terms_140.csv`：旧版の元データ
- `firebase-config.js`：Google認証設定
- `FIRESTORE_RULES.txt`：本人のみ許可するFirestoreルール例
- `CHANGELOG_v2_4.md`：変更内容

## 位置づけと注意点

このアプリは公式問題・公式eラーニングの転載物ではなく、学習用に新しく作成した非公式教材です。アップロードいただいた問題例から出題傾向を読み取り、事例を理解して回答する力を訓練するよう設計しています。既存の基礎問題の中には実際の試験より易しい選択肢が残ります。**エキスパート合格の目安には実戦問題の解答と購入済み公式eラーニングの結果を優先**してください。

### 追加問題の事例確認元（抜粋）

- https://www.sumitomocorp.com/ja/jp/news/topics/2026/group/20260421 （Any Wear, Anywhere）
- https://hacobu.jp/movo-fleet/ （MOVO Fleet）
- https://www.mellow.jp/ （Mellow / SHOP STOP）
- https://mosh.jp/ （MOSH）
- https://www.ibank.co.jp/faq/ （Wallet+）
- https://www.creema.jp/page/legal/terms-of-use （Creema）

※事業者の機能・運営主体・料金は変更され得ます。事例問題の事実関係は公式情報で確認してください。
