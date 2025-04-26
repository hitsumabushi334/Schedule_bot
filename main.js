//★★LINE Messaging APIのチャネルアクセストークン★★
const LINE_ACCESS_TOKEN =
  PropertiesService.getScriptProperties().getProperty("LINE_API_KEY");

//★★画像を保存するフォルダーID★★
const folderId = PropertiesService.getScriptProperties().getProperty(
  "GOOGLE_DRIVE_FOLDER_ID"
);
const GeminiApiKey =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
const genAI = new GeminiApp(GeminiApiKey);
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
      const imageParts = getImage(LINE_END_POINT);
      if (imageParts) {
        try {
          const res = runTextAndImages([imageParts]).then((res) => {
            const response = res.response;
            const text = response.text();
            // Geminiからの応答はここでログに出力されます
            console.log("Gemini Response:", text);
            sendMessage(reply_token, text, false);
          });
        } catch (error) {
          console.error("テキスト処理エラー:", error);
          sendMessage(
            reply_token,
            "テキスト処理中にエラーが発生しました。",
            false
          );
        }
      }
    } catch (e) {
      console.error("画像処理エラー:", e);
      sendMessage(reply_token, "画像の処理中にエラーが発生しました。", false);
    }
  } else if (messageType === "text") {
    // TODO テキストからカレンダーへの登録処理を書く
    // テキストメッセージが送られてきた場合の処理
    const cache = CacheService.getScriptCache();
    const status = cache.get("status");
    sendMessage(reply_token, "テストです", false);
  }

  // Blob形式で画像を取得する
  function getImage(LINE_END_POINT) {
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
      const imageBlob = res.getBlob();
      const base64EncodedImage = Utilities.base64Encode(imageBlob.getBytes());

      // saveImageの戻り値を返す
      // TODO ここの戻り値は画像のコンフィグ設定のためのオブジェクトにする
      return {
        inlineData: {
          data: base64EncodedImage,
          mimeType: imageBlob.getContentType(),
        },
      };
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

// Gemini経由でGoogleカレンダーにスケジュールを登録する関数
function geminiRegisterSchedule(text) {
  const currentDate = Moment.moment().format("YYYY/MM/DD HH:mm:ss");
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-04-17",
    systemInstruction: `You are a good schedule manager agent and can execute the appropriate function from the given input values and mode information to achieve your objective. Your response must be in the same language as your input. Also, today's date is ${currentDate}.`,
  });
  const registerSchedule = model
    .newFunction()
    .setName("registerSchedule")
    .setDescription("The function to register a schedule in Google Calendar")
    .addParameter("title", "STRING", "The title of the event")
    .addParameter(
      "startTime",
      "STRING",
      "The start time of the event. the format is YYYY/MM/DD HH:mm"
    )
    .addParameter(
      "endTime",
      "STRING",
      "The end time of the event. the format is YYYY/MM/DD HH:mm"
    )
    .addParameter("explain", "STRING", "The explanation of the event");
  const saveScheduleToSheet = model
    .newFunction()
    .setName("saveScheduleToSheet")
    .setDescription(
      "The function to store information about an event in a spreadsheet"
    )
    .addParameter("eventId", "STRING", "The ID of the event")
    .addParameter("title", "STRING", "The title of the event")
    .addParameter(
      "startTime",
      "STRING",
      "The start time of the event. The format is YYYY/MM/DD HH:mm"
    )
    .addParameter(
      "endTime",
      "STRING",
      "The end time of the event. The format is YYYY/MM/DD HH:mm"
    );
  const chat = model
    .startChat()
    .addFunction(registerSchedule)
    .addFunction(saveScheduleToSheet);
  const prompt = `## rule\n
    From the given text or image, perform the appropriate operation according to the mode.If the input is an image, extract the information from the image that seems to be the schedule you want to register and perform the registration.If you cannot find the information you need to register, do not register it and tell us that you cannot find it.\n

  ## mode\n
  There are three types of mode: /register,/search,/delete.\n
  ### /register mode\n
  1. extract necessary information from the input and register the schedule to Google Calendar.\n
  2. After registering the schedule, save the registered schedule in a spreadsheet.\n
  3. inform the user that the registration has been completed.\n
  4. if the schedule registration failed, inform the user of the failure.\n

  ### /search mode\n
  1. Retrieves all events registered in the spreadsheet.\n
  2. retrieve the event closest to the event contained in the input from among the retrieved events.\n
  3. informs the user of the search results.\n
  If the event was not found, informs the user that it was not found.\n

  ### /delete mode\n
  1. Retrieves all events registered in the spreadsheet.\n
  2. retrieve the event closest to the event contained in the input from among the retrieved events.\n
  3. delete the event from Google Calendar using the ID of the matched event.\n
  4. informs the user that the deletion has been completed.\n
  5. if the event was not found, tell the user that it was not found.\n

  ## input\n
  {text}\n

  ##mode\n
  /register\n
`;

  // googleカレンダーに登録する関数
  function registerSchedule(title, startTime, endTime, explain) {
    // Momentライブラリが存在するか確認
    if (typeof Moment === "undefined" || !Moment.moment) {
      throw new Error(
        "Momentライブラリが見つからないか、正しく読み込まれていません。"
      );
    }
    // 日付文字列のフォーマット検証（簡易的）
    const dateTimeFormat = "YYYY/MM/DD HH:mm";
    if (
      !Moment.moment(startTime, dateTimeFormat, true).isValid() ||
      !Moment.moment(endTime, dateTimeFormat, true).isValid()
    ) {
      throw new Error(
        `日付/時刻の形式が無効です。"${dateTimeFormat}" 形式で指定してください。(例: ${startTime}, ${endTime})`
      );
    }

    const startMoment = Moment.moment(startTime, dateTimeFormat);
    const endMoment = Moment.moment(endTime, dateTimeFormat);

    // 終了時刻が開始時刻より前でないか確認
    if (endMoment.isBefore(startMoment)) {
      throw new Error(
        `終了時刻(${endTime})が開始時刻(${startTime})より前になっています。`
      );
    }

    console.log(`Creating event: "${title}" from ${startTime} to ${endTime}`);
    const event = CalendarApp.getDefaultCalendar().createEvent(
      title,
      startMoment.toDate(), // MomentオブジェクトをDateオブジェクトに変換
      endMoment.toDate(), // MomentオブジェクトをDateオブジェクトに変換
      {
        description: explain,
      }
    );
    console.log("Event created successfully in Google Calendar.");
    return event.getId();
  }
  // 登録したスケジュールをスプレッドシートに保存する関数
  function saveScheduleToSheet(eventId, title, startTime, endTime) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow() + 1; // 最終行の次の行に追加
    sheet
      .getRange(lastRow, 1, 1, 4)
      .setValues([[eventId, title, startTime, endTime]]); // 1行4列のデータを追加
    console.log("Schedule saved to Google Sheets successfully.");
    return true;
  }
  // イベントの名前からスプレッドシート内のイベントを取得する関数
  function getEventIdByName(eventName) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues(); // シートの全データを取得
    for (let i = 0; i < data.length; i++) {
      if (data[i][1] === eventName) {
        return data[i]; // イベントを返す
      }
    }
    return null; // イベントが見つからない場合はnullを返す
  }
  // スプレッドシートに登録されているすべてのイベントを取得する関数

  function getAllEvents() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues();
    const events = [];
    for (let i = 0; i < data.length; i++) {
      events.push({
        id: data[i][0],
        title: data[i][1],
        startTime: data[i][2],
        endTime: data[i][3],
      });
    }
    return events;
  }
  // カレンダーからイベントを削除する関数
  function deleteEvent(eventId) {
    const calendar = CalendarApp.getDefaultCalendar();
    const event = calendar.getEventById(eventId);
    if (event) {
      event.deleteEvent(); // イベントを削除
      console.log("Event deleted successfully from Google Calendar.");
      return true;
    } else {
      console.log("Event not found in Google Calendar.");
      return false;
    }
  }
  // スプレッドシートから今日より前のイベントを削除する関数
  function deleteOldEvents() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = sheet.getDataRange().getValues(); // シートの全データを取得
    const now = new Date(); // 現在の日付を取得
    for (let i = data.length - 1; i >= 0; i--) {
      const eventDate = new Date(data[i][3]); // 日付を取得
      if (eventDate < now) {
        sheet.deleteRow(i + 1); // スプレッドシートから行を削除
      }
    }
    console.log("Old events deleted from Google Sheets and Calendar.");
  }
}
