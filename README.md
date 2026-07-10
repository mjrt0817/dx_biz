# DXビジネス検定 700点突破アプリ Web版 v2.0

v1.3を基準に、Googleアカウント同期と履歴閲覧を追加したWeb版です。

## 主な機能

- 200問演習
- 用語カード80語
- 今日の10問
- 分野別演習
- 苦手問題復習
- ミニ模試 12問・8分
- ハーフ模試 48問・30分
- 本番模試 96問・60分
- 選択肢ランダム表示
- 正解位置の偏り解消済み
- 学習履歴のJSON書き出し／読み込み
- Googleアカウントログイン
- Firestoreによるクラウド同期
- 詳細な学習履歴画面

## Google同期の仕組み

ログインしたGoogleアカウントごとに、以下の場所へ学習履歴を保存します。

```text
users/{uid}/apps/dxBizTrainer
```

保存される内容は、問題別正答履歴、演習・模試履歴、用語カードの状態、最終学習日などです。

## 初期設定

### 1. Firebaseプロジェクトを作成

Firebase Consoleで新規プロジェクトを作成します。

### 2. Webアプリを追加

プロジェクト設定からWebアプリを追加し、表示される `firebaseConfig` をコピーします。

### 3. firebase-config.js を差し替え

`firebase-config.js` の中身を、自分のFirebase設定値に差し替えます。

```js
window.DX_BIZ_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### 4. Googleログインを有効化

Firebase Consoleで以下を設定します。

```text
Authentication > Sign-in method > Google > 有効化
```

### 5. Firestoreを作成

Firestore Databaseを作成します。

### 6. Firestoreルールを設定

`FIRESTORE_RULES.txt` の内容をFirestoreルールに設定してください。

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/apps/{appId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 7. デプロイ

Vercel、GitHub Pages、Firebase Hostingなどに配置できます。

Googleログインを使う場合は、`file://` で直接開くのではなく、`https://` のWebサイトとして公開してください。ローカル検証は `localhost` が無難です。

## 既存履歴の引き継ぎ

v1.3以前の履歴を引き継ぐ場合は、次の手順です。

1. 旧アプリで「履歴を書き出し」
2. v2.0を開く
3. 「履歴を読み込み」
4. Googleログイン
5. 「今すぐ同期」

これでクラウド側にも保存されます。

## 同期ボタンの意味

| ボタン | 用途 |
|---|---|
| 今すぐ同期 | 端末履歴とクラウド履歴を統合します |
| クラウドから読込 | クラウド履歴でこの端末を上書きします |
| この端末を保存 | この端末の履歴をクラウドへ保存します |

通常は「今すぐ同期」を使えば十分です。

## 注意

- このアプリの問題は学習用のオリジナル問題です。公式問題そのものではありません。
- FirebaseのAPIキーは一般的にクライアント側に含まれる前提の識別子ですが、Firestoreルールでユーザー本人以外が読めないように制御してください。
- Googleログインの許可ドメインに、公開先ドメインを追加してください。
