// 画面をまたいで使う文。ここに集めて、段ごとの画面でも同じ文を使う

export const STAGES = [
  { n: 1, route: 'stage1', name: '聞き分け', desc: '2つの 音の どちらが 高いかを 聞き分けます' },
  { n: 2, route: 'stage2', name: '声の 地図', desc: 'あなたが 楽に 出せる 高さを 測ります' },
  { n: 3, route: 'stage3', name: 'すべらせて 止める', desc: '声を ゆっくり 上げて、目標で 止めます' },
  { n: 4, route: 'stage4', name: '1音 合わせ', desc: 'お手本と 同じ 高さの 声を 出します' },
  { n: 5, route: 'stage5', name: '短い メロディ', desc: '2〜5音の 短い メロディを 歌います' },
  { n: 6, route: 'stage6', name: '好きな 曲', desc: '買った 曲で、お手本の 線（目安）と 重ねて 練習します' },
];

// 安全の一言（welcome・safety・warmup に出す）
export const SAFETY_LINES = [
  '苦しい・痛いと 感じたら、すぐ やめましょう。',
  'のどの 痛みや 声がれが 続くとき（目安として 4週間ほど）は、耳鼻咽喉科で 相談して ください。',
  '急に 声が 出なく なった・強い 痛みが ある ときは、早めに 耳鼻咽喉科へ。',
  'この アプリは 医療・リハビリ・診断の 代わりでは ありません。うまく なる 早さには 個人差が あります。',
];

export const PRIVACY_LINE =
  'マイクを 使います。声は この スマホの 中だけで 使い、外には 送りません。録った 声も 保存しません。';

// 段2を測る前に、段3〜5へ出す一言
export const MAP_FIRST_HINT = '先に 声の 地図を 測ると、あなたの 高さで 練習できます';

// 段6 曲の一覧と追加の画面の文
export const STAGE6_TEXT = {
  title: '好きな 曲',
  earphone: '曲に 合わせて 歌う ときは、イヤホンが 必要です。音量は 小さめに して、自分の 声も 聞こえる くらいに しましょう。',
  highCare: '高い 所を 無理に くり返さない ように しましょう。何回か 歌ったら、ひと休み しましょう。',
  rights: '自分で 買った 曲や、自分の CD から 取り込んだ 曲を 使って ください。ファイルと お手本の 線は この スマホの 中だけで 使い、外には 送りません。',
  empty: 'まだ 曲が ありません。',
  add: '＋ 曲を 足す',
  titleLabel: '曲名',
  pickFile: '曲の ファイルを 選ぶ',
  pickVocal: '歌声だけの ファイルを 選ぶ',
  guide: '歌声だけの ファイルの 作り方 ›',
  submit: '追加する',
  cancel: 'やめる',
  needTitle: '曲名を 入れて ください',
  needFile: 'ファイルを 1つ 以上 選んで ください',
  unreadable: 'この ファイルは 読めません',
  mismatch: '同じ 曲か 確かめて ください',
  mixed: '伴奏が まざって いるので、線は 目安です',
  building: 'お手本の 線を 作って います…',
  saveFailed: '保存できませんでした。ほかの 曲を 消すと 入る ことが あります',
  saveFailedOther: '保存できませんでした。もう一度 ためして ください',
  refile: 'ファイルを もう一度 選んで ください',
  refileButton: 'ファイルを 選びなおす',
  refileNote: '同じ 曲の ファイルを 選んで ください。保存した 区間と 前回の 自分の 線は そのまま 残ります。',
  refileSubmit: '読みこむ',
  readFailed: 'ファイルを 読みこめませんでした。少し 待ってから、もう一度 ためして ください',
  retry: 'もう一度 読みこむ',
  confirmDelete: 'この 曲を 消しますか？（スマホの中の ファイルも 消えます）',
  toSong: '曲の 画面へ',
  remove: '消す',
  ytNotEmbeddable: 'この 動画は 持ち主の 設定で、アプリの 中では 流せません',
  ytNotFound: 'この 動画は 見つかりません。アドレスを 確かめて ください',
  ytBadId: 'アドレスを 読み取れません',
  ytNoReferer: 'この 画面から YouTube を 開けませんでした。ブラウザで 開きなおして みて ください',
  ytOther: 'YouTube を 再生できませんでした',
  ytOffline: '電波が ない ときは YouTube は 使えません。買った 曲の ファイルは 電波なしで 使えます',
  ytEarphone: '曲に 合わせて 歌う ときは、イヤホンが 必要です',
  ytButton: 'YouTube',
  ytLabel: 'YouTube の アドレス（あとからでも 足せます）',
  ytSave: '保存',
  ytNotice: 'YouTube の プレーヤーを 読み込みます（YouTube に 接続します）。声は スマホの 外に 出ません。曲の ダウンロードは しません',
  ytPractice: 'YouTube で 練習',
  ytLoading: 'YouTube を 読み込んで います…',
  ytPlay: '▶ 再生',
  ytSetStart: 'ここを 始まりに',
  ytSetEnd: 'ここを 終わりに',
  ytLoop: '▶ 区間を くり返す',
  ytRange: (from, to) => `区間：${from} 〜 ${to}`,
  ytPickFirst: '先に 「ここを 始まりに」「ここを 終わりに」で 区間を 選んで ください',
  ytBadRange: '終わりは 始まりより 0.5秒 より 後ろに して ください',
};
