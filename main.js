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
          extractScheduleInfoFromImage([imageParts])
            .then((res) => {
              const response = res.response;
              const text = response.text();
              return text;
            })
            .then((text) => {
              // Wait for input to resolve
              geminiRegisterSchedule(text).then((res) => {
                const response = res.response;
                const text = response.text();
                // Geminiからの応答はここでログに出力されます
                console.log("Gemini Response:", text);
                sendMessage(reply_token, text, false);
              });
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
    switch (true) {
      case messageText === "/register":
        PropertiesService.getScriptProperties().setProperty(
          "mode",
          "/register"
        );
        sendMessage(
          reply_token,
          "登録モードに切り替えました。\n 登録したいイベントを記入してください。",
          false
        );
        break;
      case messageText === "/search":
        PropertiesService.getScriptProperties().setProperty("mode", "/search");
        sendMessage(
          reply_token,
          "検索モードに切り替えました。\n 検索したいイベントを記入してください。",
          false
        );
        break;
      case messageText === "/delete":
        PropertiesService.getScriptProperties().setProperty("mode", "/delete");
        sendMessage(
          reply_token,
          "削除モードに切り替えました。\n 削除したいイベントを記入してください。",
          false
        );
        break;
      default:
        try {
          geminiRegisterSchedule(messageText).then((res) => {
            const response = res.response;
            const text = response.text();
            // Geminiからの応答はここでログに出力されます
            console.log("Gemini Response:", text);
            sendMessage(reply_token, text, false);
            PropertiesService.getScriptProperties().setProperty(
              "mode",
              "/register"
            );
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
async function geminiRegisterSchedule(text) {
  const mode = PropertiesService.getScriptProperties().getProperty("mode");
  const currentDate = Moment.moment().format("YYYY/MM/DD HH:mm:ss");
  console.log(currentDate);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
    systemInstruction: `You are a good schedule manager agent and can execute the appropriate function from the given input values and mode information to achieve your objective. Your response must be in the same language as your input.`,
  });
  const RegisterSchedule = model
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
  const SaveScheduleToSheet = model
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
  const GetEventIdByName = model
    .newFunction()
    .setName("getEventIdByName")
    .setDescription(
      "The function to search for an event ID from an event name on a spreadsheet"
    )
    .addParameter("eventName", "STRING", "The name of the event to search for");
  const GetAllEvents = model
    .newFunction()
    .setName("getAllEvents")
    .setDescription(
      "The function to retrieve information about all events registered on the spreadsheet"
    );
  const DeleteEvent = model
    .newFunction()
    .setName("deleteEvent")
    .setDescription(
      "Function to delete events matching an event ID from Google Calendar"
    )
    .addParameter("eventId", "STRING", "The ID of the event to delete");
  const DeleteEventFromSheet = model
    .newFunction()
    .setName("deleteEventFromSheet")
    .setDescription(
      "Function to delete events matching an event ID from the spreadsheet"
    )
    .addParameter("eventId", "STRING", "The ID of the event to delete");
  const chat = model
    .startChat({ temperature: 0.1 })
    .addFunction(RegisterSchedule)
    .addFunction(SaveScheduleToSheet)
    .addFunction(GetAllEvents)
    .addFunction(DeleteEvent)
    .addFunction(DeleteEventFromSheet);
  const prompt = `## rule\n
    The following rules must be strictly observed. Perform only one operation for each input according to the mode, to avoid duplicate registration of the same appointment.
    From the given text or image, perform the appropriate operation according to the mode.If the input is an image, extract the information from the image that seems to be the schedule you want to register and perform the registration.If you cannot find the information you need to register, do not register it and tell us that you cannot find it.Also, do not write the reasoning process in the response statement.If the input does not have a start or end time, then please assume the start time is 10:00 a.m. and the end time is one hour after the start time.Do not performing the same operation multiple times, such as registering the same event twice.Be sure to perform each operation only once each manipulate.Responses must be in Japanese.Please use general common sense in determining the start or end time, morning or afternoon.\n


  ## mode\n
  There are three types of mode: /register,/search,/delete.
  You must follow the procedures for each mode.\n
  
  ### /register mode\n
  1. extract necessary information from the input and register the schedule to Google Calendar.\n
  2. After registering the schedule, save the registered schedule in a spreadsheet.\n
  3. inform the user that the registration has been completed.\n
  4. if the schedule registration failed, inform the user of the failure.\n
  5. The output message should be as follows。
  ｢{イベント名}の登録を{開始時間}から{終了時間}まで完了しました。｣\n

  ### /search mode\n
  1. Retrieves all events registered in the spreadsheet.\n
  2. retrieve the event closest to the event contained in the input from among the retrieved events.\n
  3. informs the user of the search results.\n
  4.  - The output message should be as follows。
  ｢発見されたは次のとおりです。{イベント名}、{開始時間(YYYY/MM/DD HH:mm GMT+9:00)}、{終了時間(YYYY/MM/DD HH:mm GMT+9:00)}、{イベントID}｣\n
  5. If the event was not found, informs the user that it was not found.\n

  ### /delete mode\n
  1. Retrieves all events registered in the spreadsheet.\n
  2. retrieve the event closest to the event contained in the input from among the retrieved events.\n
  3. delete the event from Google Calendar using the ID of the matched event.\n
  4. Delete the corresponding event from the spreadsheet.
  5. informs the user that the deletion has been completed.\n
  6.  - The output message should be as follows。
  ｢{イベント名}の削除が完了しました。｣\n
  7. if the event was not found, tell the user that it was not found.\n
  
  ## input\n
  ${text}\n 

  ## curentdate\n
  ${currentDate}\n

  ##mode\n
  ${mode}\n
`;
  try {
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const answer = response.text();
    console.log("Gemini Response:", answer);
    return result;
  } catch (error) {
    console.error("Error occurred:", error);
    throw error;
  }
}
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
  try {
    const event = CalendarApp.getDefaultCalendar().createEvent(
      title,
      startMoment.toDate(), // MomentオブジェクトをDateオブジェクトに変換
      endMoment.toDate(), // MomentオブジェクトをDateオブジェクトに変換
      {
        description: explain,
      }
    );
    console.log("Event created successfully in Google Calendar.");
    return {
      success: true,
      message: `イベント「${title}」を${startTime}から${endTime}まで登録しました。`,
      title: event.getTitle(),
      startTime: event.getStartTime(),
      endTime: event.getEndTime(),
      eventId: event.getId(),
    };
  } catch (error) {
    console.error("Error creating event in Google Calendar:", error);
    return {
      success: false,
      error: "イベントの作成中にエラーが発生しました。",
    };
  }
}
// 登録したスケジュールをスプレッドシートに保存する関数
function saveScheduleToSheet(eventId, title, startTime, endTime) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow() + 1; // 最終行の次の行に追加
  try {
    sheet
      .getRange(lastRow, 1, 1, 4)
      .setValues([[eventId, title, startTime, endTime]]); // 1行4列のデータを追加
    console.log("Schedule saved to Google Sheets successfully.");
    return {
      success: true,
      message: `スケジュール「${title}」をスプレッドシートに保存しました。`,
      eventId: eventId,
      title: title,
      startTime: startTime,
      endTime: endTime,
    };
  } catch (error) {
    console.error("Error saving schedule to Google Sheets:", error);
    return {
      success: false,
      error: "スケジュールの保存中にエラーが発生しました。",
    };
  }
}
// スプレッドシートに登録されているすべてのイベントを取得する関数

function getAllEvents() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  try {
    const events = [];
    for (let i = 0; i < data.length; i++) {
      events.push({
        id: data[i][0],
        title: data[i][1],
        startTime: data[i][2],
        endTime: data[i][3],
      });
    }
    console.log("All events retrieved from Google Sheets successfully.");
    return { success: true, result: events };
  } catch (error) {
    console.error("Error retrieving events from Google Sheets:", error);
    return {
      success: false,
      error: "イベントの取得中にエラーが発生しました。",
    };
  }
}
// カレンダーからイベントを削除する関数
function deleteEvent(eventId) {
  const calendar = CalendarApp.getDefaultCalendar();
  const event = calendar.getEventById(eventId);
  if (event) {
    event.deleteEvent(); // イベントを削除
    console.log("Event deleted successfully from Google Calendar.");
    return {
      success: true,
      message: `Event "${event.getTitle()}" deleted successfully.`,
      eventId: eventId,
    };
  } else {
    console.log("Event not found in Google Calendar.");
    return {
      success: false,
      message: `Event with ID "${eventId}" not found in Google Calendar.`,
    };
  }
}
// スプレッドシートからイベントIDに一致するイベントを削除する関数
function deleteEventFromSheet(eventId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues(); // シートの全データを取得
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === eventId) {
      sheet.deleteRow(i + 1); // スプレッドシートから行を削除
      console.log("Event deleted from Google Sheets successfully.");
      return {
        success: true,
        message: `Event with ID "${eventId}" deleted from Google Sheets.`,
        eventId: eventId,
      };
    }
  }
  console.log("Event not found in Google Sheets.");
  return {
    success: false,
    message: `Event with ID "${eventId}" not found in Google Sheets.`,
  };
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
// 画像からスケジュール登録に必要な情報を抽出する関数
async function extractScheduleInfoFromImage(imageParts) {
  const currentDate = Moment.moment().format("YYYY/MM/DD HH:mm:ss");
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: `You are a good schedule manager agent and can execute the appropriate function from the given input values and mode information to achieve your objective. Your response must be in the same language as your input.`,
  });
  const prompt = `## rule\n
  Extract the information necessary for schedule registration from the image given as input.The extracted information should be output in a format to be passed to a function for schedule registration.The output should be in the following format.｢イベント名：{Event Name}、開始時間：{Start time(YYYY/MM/DD HH:mm:ss)}、終了時間：{End time(YYYY/MM/DD HH:mm:ss).}、説明文：{explanatory note}｣.\n
  If you do not see any text regarding scheduling in the image, do not schedule and put Null for the various parameters.
  The image may also contain information that has nothing to do with the schedule, in which case, please ignore such information as noise. If the input does not have a start or end time, then please assume the start time is 10:00 a.m. and the end time is one hour after the start time.   Please use general common sense in determining the start or end time, morning or afternoon.
  ## currentDate  ${currentDate}\n`;
  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  const text = response.text();
  console.log("Gemini Response:", text);
  return result;
}
