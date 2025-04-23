//★★LINE Messaging APIのチャネルアクセストークン★★
const LINE_ACCESS_TOKEN =
  PropertiesService.getScriptProperties().getProperty("LINE_API_KEY");

//★★画像を保存するフォルダーID★★
const folderId = PropertiesService.getScriptProperties().getProperty(
  "GOOGLE_DRIVE_FOLDER_ID"
);
console.log(folderId);

//ファイル名に使う現在日時をMomentライブラリーを使って取得
const date = Moment.moment(); //現在日時を取得
const formattedDate = date.format("YYYYMMDD_HHmmss");

//LINE Messaging APIからPOST送信を受けたときに起動する
// e はJSON文字列
function doPost(e) {
  if (typeof e === "undefined") {
    return;
  }

  const json = JSON.parse(e.postData.contents);
  const reply_token = json.events[0].replyToken;
  const messageId = json.events[0].message.id;
  const messageType = json.events[0].message.type;
  const messageText = json.events[0].message.text;

  // ログにメッセージタイプを出力して確認する
  Logger.log("Received messageType: " + messageType);

  // 大文字小文字を無視して比較する
  if (messageType === "image") {
    // TODO LINEで送信した画像からデータを抽出するテストを行う
    try {
      const LINE_END_POINT =
        "https://api-data.line.me/v2/bot/message/" + messageId + "/content";
      const res = getImage(LINE_END_POINT, reply_token);
    } catch (e) {
      console.error("画像処理エラー:", e);
      sendMessage(reply_token, "画像の処理中にエラーが発生しました。", false);
    }
  } else if (messageType === "text") {
    // TODO テキストからカレンダーへの登録処理を書く
    // テキストメッセージが送られてきた場合の処理
    const cache = CacheService.getScriptCache();
    const status = cache.get("status");
  }

  // Blob形式で画像を取得する
  function getImage(LINE_END_POINT, reply_token) {
    try {
      const url = LINE_END_POINT;
      const headers = {
        "Content-Type": "application/json; charset=UTF-8",
        Authorization: "Bearer " + LINE_ACCESS_TOKEN,
      };
      const options = {
        method: "get",
        headers: headers,
      };
      const res = UrlFetchApp.fetch(url, options);
      //TODO バイナリデータで問題なくGeminiが動くか確認する
      const imageBlob = res
        .getBlob()
        .getAs("image/png")
        .setName("LINE画像_" + formattedDate + ".png");

      // saveImageの戻り値を返す
      // TODO ここの戻り値は画像のコンフィグ設定のためのオブジェクトにする
      return;
    } catch (e) {
      Logger.log(e.message);
      return null;
    }
  }

  // ユーザーにメッセージを送信する
  function sendMessage(reply_token, text, quickReply) {
    // 返信先URL
    const replyUrl = "https://api.line.me/v2/bot/message/reply";
    const items = [
      {
        type: "action",
        action: {
          type: "message",
          label: "YES",
          text: "はい",
        },
      },
      {
        type: "action",
        action: {
          type: "message",
          label: "NO",
          text: "いいえ",
        },
      },
    ];
    const headers = {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: "Bearer " + LINE_ACCESS_TOKEN,
    };

    const postData = {
      replyToken: reply_token,
      messages: [
        {
          type: "text",
          text: text,
        },
      ],
    };
    if (quickReply) {
      postData.messages[0].quickReply = {
        items: items,
      };
    }

    const options = {
      method: "post",
      headers: headers,
      payload: JSON.stringify(postData),
    };

    // LINE Messaging APIにデータを送信する
    UrlFetchApp.fetch(replyUrl, options);
  }
}
