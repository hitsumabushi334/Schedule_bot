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
    try {
      const LINE_END_POINT =
        "https://api-data.line.me/v2/bot/message/" + messageId + "/content";
      const res = getImage(LINE_END_POINT, reply_token);

      // res がnullでないことを確認
      if (res) {
        let responseData;
        try {
          // objはJSONレスポンスオブジェクト
          let responseArray = [];
          for (const obj of res) {
            if (obj.name.includes("石田") || obj.mc.includes("石田")) {
              responseArray.push(obj);
            }
          }
          responseData = JSON.stringify(responseArray);
          CacheService.getScriptCache().put("data", responseData, 1800);
          CacheService.getScriptCache().put("status", "ready", 1800);
          let replyText = "";
          responseArray.forEach((scheduleItem, index) => {
            replyText += `【予定${index + 1}】\n`;
            replyText += `📅 日付: ${scheduleItem.date || "不明"}\n`;
            replyText += `📝 発表者: ${scheduleItem.name || "不明"}\n`;
            replyText += `⚡️タスク: ${scheduleItem.task || "不明"}\n`;
            replyText += `👨‍🏫座長: ${scheduleItem.mc || "不明"}\n`;
            replyText += `備考欄: ${scheduleItem.others || "不明"}\n`;
            // 最後の項目でなければ区切り線を追加
            if (index < responseArray.length - 1) {
              replyText += "\n\n------------------\n\n";
            }
          });
          sendMessage(
            reply_token,
            `画像を解析しました。\n${replyText}この内容でよろしいですか？`,
            true
          );
        } catch (jsonError) {
          console.error("JSON解析エラー:", jsonError);
          sendMessage(
            reply_token,
            "画像の解析中にエラーが発生しました。",
            false
          );
        }
      } else {
        sendMessage(reply_token, "画像の処理中にエラーが発生しました。", false);
      }
    } catch (e) {
      console.error("画像処理エラー:", e);
      sendMessage(reply_token, "画像の処理中にエラーが発生しました。", false);
    }
  } else if (messageType === "text") {
    // テキストメッセージが送られてきた場合の処理
    const cache = CacheService.getScriptCache();
    const status = cache.get("status");

    // メッセージとステータスの組み合わせで分岐
    switch (true) {
      case messageText === "はい" && status === "ready":
        const registrationResponse = registerCalender();
        sendMessage(reply_token, registrationResponse);
        cache.remove("data");
        cache.remove("status");
        break;

      case messageText === "いいえ" &&
        (status === "ready" || status === "delete"):
        cache.remove("data");
        cache.remove("status");
        sendMessage(reply_token, "キャンセルしました");
        break;

      case messageText.includes("/delete"):
        sendMessage(reply_token, "削除したい予定を記入してください。", false);
        cache.put("status", "deleteReady", 1800);
        break;

      case status === "deleteReady":
        searchSchedule(messageText)
          .then((result) => {
            try {
              if (!result) {
                sendMessage(
                  reply_token,
                  "削除対象が見つかりませんでした。",
                  false
                );
                return;
              }
              const parsedResult = JSON.parse(result);
              const parsedResults = parsedResult[0];
              if (!parsedResults.id || !parsedResults.startDate) {
                sendMessage(
                  reply_token,
                  "削除対象が見つかりませんでした。",
                  false
                );
                return;
              } else {
                let replyText = "次の予定が見つかりました。\n";
                replyText += `📅 日付: ${parsedResults.startDate || "不明"}\n`;
                replyText += `📝 予定: ${parsedResults.result || "不明"}\n`;
                replyText += "削除してもよろしいですか?";

                sendMessage(reply_token, replyText, true);
                cache.put("data", JSON.stringify(parsedResults), 1800);
                cache.put("status", "delete", 1800);
              }
            } catch (e) {
              sendMessage(reply_token, "発見できませんでした");
            }
          })
          .catch((error) => {
            console.error("削除エラー:", error);
            sendMessage(reply_token, "処理中にエラーが発生しました。", false);
          });
        break;

      case messageText === "はい" && status === "delete":
        const data = cache.get("data");
        const parsedData = JSON.parse(data);
        const calendar = CalendarApp.getCalendarById("primary");
        const event = calendar.getEventById(parsedData.id);
        event.deleteEvent();
        cache.remove("data");
        cache.remove("status");
        eraseSchedule(parsedData.id);
        sendMessage(reply_token, "予定を削除しました");
        break;

      default:
        // extractScheduleの結果を処理
        extractSchedule(messageText)
          .then((responseText) => {
            try {
              // JSON文字列をパースして配列として取得
              const responseData = JSON.parse(responseText);
              cashTest(responseText);
              if (
                !responseData ||
                !Array.isArray(responseData) ||
                responseData.length === 0
              ) {
                // 予定データが見つからない場合
                sendMessage(
                  reply_token,
                  "予定情報を解析できませんでした。もう一度入力してください。"
                );
                return;
              }

              // 予定が複数ある場合は全て表示する
              let replyText = "";

              if (responseData.length === 1) {
                // 単一の予定の場合
                const scheduleItem = responseData[0];
                replyText = `📅 日付: ${scheduleItem.date || "不明"}\n`;
                replyText += `📝 予定: ${scheduleItem.task || "不明"}\n`;
                replyText += `⏱️ かかる時間: ${
                  scheduleItem.eventTerm || "不明"
                }\n`;
                replyText += `🔚 終了予定: ${scheduleItem.endtime || "不明"}`;

                // その他の情報があれば追加
                if (scheduleItem.others && scheduleItem.others.length > 0) {
                  replyText += `\n📌 その他: ${scheduleItem.others.join(", ")}`;
                }
              } else {
                // 複数の予定がある場合
                replyText = `${responseData.length}件の予定を検出しました：\n\n`;

                responseData.forEach((scheduleItem, index) => {
                  replyText += `【予定${index + 1}】\n`;
                  replyText += `📅 日付: ${scheduleItem.date || "不明"}\n`;
                  replyText += `📝 予定: ${scheduleItem.task || "不明"}\n`;
                  replyText += `⏱️ かかる時間: ${
                    scheduleItem.eventTerm || "不明"
                  }\n`;
                  replyText += `🔚 終了予定: ${
                    scheduleItem.endtime || "不明"
                  }\n`;

                  // その他の情報があれば追加
                  if (scheduleItem.others && scheduleItem.others.length > 0) {
                    replyText += `\n📌 その他: ${scheduleItem.others.join(
                      ", "
                    )}`;
                  }

                  // 最後の項目でなければ区切り線を追加
                  if (index < responseData.length - 1) {
                    replyText += "\n\n------------------\n\n";
                  }
                });
              }
              // キャッシュにデータを保存
              CacheService.getScriptCache().put("data", responseText, 1800);
              CacheService.getScriptCache().put("status", "ready", 1800);
              // メッセージを送信
              sendMessage(reply_token, replyText, true);
            } catch (error) {
              console.error("JSON解析エラー:", error);
              console.log("受信したテキスト:", responseText);
              sendMessage(
                reply_token,
                "データの解析中にエラーが発生しました。もう一度入力してください。"
              );
            }
          })
          .catch((error) => {
            console.error("APIエラー:", error);
            sendMessage(
              reply_token,
              "予定の処理中にエラーが発生しました。後でもう一度お試しください。"
            );
          });
        break;
    }
  } else {
    const messageNotImage = "画像またはテキストメッセージを送信してください";
    sendMessage(reply_token, messageNotImage);
  }
  return;
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
    const imageBlob = res
      .getBlob()
      .getAs("image/png")
      .setName("LINE画像_" + formattedDate + ".png");

    // saveImageの戻り値を返す
    return saveImage(imageBlob, reply_token);
  } catch (e) {
    Logger.log(e.message);
    return null;
  }
}

// 画像をGoogle Driveのフォルダーに画像を保存（アップロード）する関数
function saveImage(imageBlob, reply_token) {
  try {
    // 画像をGoogle Driveのフォルダーに画像を保存（アップロード）
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(imageBlob);
    const res = generateText(folderId);
    return res;
  } catch (e) {
    // 例外エラーが起きた時にログを残す
    Logger.log(e);
    sendMessage(reply_token, "画像の保存中にエラーが発生しました。");
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
function cashTest(responseText) {
  const cash = CacheService.getScriptCache();
  cash.put("responseText", responseText);
  console.log(cash.get("responseText"));
}
function test() {
  const prompt =
    "3月5日から3月7日まで大阪出張、初日は午後3時からホテルでチェックイン、2日目は終日会議";
  const responseText = extractSchedule(prompt);
  cashTest(responseText);
}
function registerCalender() {
  let replyText = "";
  const data = CacheService.getScriptCache().get("data");
  const schedules = JSON.parse(data);
  console.log(schedules);
  const calendar = CalendarApp.getCalendarById("primary");
  let ids = [];
  schedules.forEach((schedule) => {
    // 開始日時の処理 - schedule.dateを使用
    console.log("入力された日付データ:", schedule.date);
    console.log(
      "パース後の日付データ:",
      Moment.moment(schedule.date, "YYYY/MM/DD HH:mm").format()
    );
    const startDateTime = Moment.moment(
      schedule.date,
      "YYYY/MM/DD HH:mm"
    ).toDate();

    // 終了時間の計算 - schedule.endtimeを使用または開始時間から1時間後
    let endDateTime;
    if (schedule.endtime) {
      endDateTime = Moment.moment(
        schedule.endtime,
        "YYYY/MM/DD HH:mm"
      ).toDate();
    } else {
      endDateTime = Moment.moment(schedule.date, "YYYY/MM/DD HH:mm")
        .add(1, "hours")
        .toDate();
    }

    // イベント作成
    const event = calendar.createEvent(
      schedule.task || "予定",
      startDateTime,
      endDateTime,
      {
        description:
          `${schedule.others},👨‍🏫座長: ${schedule.mc || "不明"}` || "",
      }
    );
    ids.push(event.getId());
    // フォーマット済みの日時を表示用に作成
    const formattedStart =
      Moment.moment(startDateTime).format("YYYY/MM/DD HH:mm");
    const formattedEnd = Moment.moment(endDateTime).format("YYYY/MM/DD HH:mm");

    replyText += `イベント: ${event.getTitle()} を ${formattedStart} から ${formattedEnd} まで\n`;
  });
  writeSchedule(schedules, ids);
  replyText += "カレンダーに登録しました。";
  return replyText;
}
