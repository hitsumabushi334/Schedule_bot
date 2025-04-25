function test01() {
  const folderId = PropertiesService.getScriptProperties().getProperty(
    "GOOGLE_DRIVE_FOLDER_ID"
  );
  const fileName = "IMG_20210516_195729.jpg";
  const file = DriveApp.getFilesByName(fileName).next();
  const fileId = file.getId();
  console.log("File ID:", fileId);
  const res = [fileToGenerativePart(fileId)];
  // runTextAndImages を呼び出します。結果は実行ログで確認します。
  runTextAndImages(res);
  // この console.log は不要です。
  // console.log(responce);
}

// Converts a Google Drive image file ID to a GoogleGenerativeAI.Part object
function fileToGenerativePart(id) {
  const file = DriveApp.getFileById(id);
  const imageBlob = file.getBlob();
  const base64EncodedImage = Utilities.base64Encode(imageBlob.getBytes());

  return {
    inlineData: {
      data: base64EncodedImage,
      mimeType: file.getMimeType(),
    },
  };
}

async function runTextAndImages(imageParts) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-04-17",
  });

  const prompt = "画像について説明してください";
  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  const text = response.text();
  // Geminiからの応答はここでログに出力されます
  console.log("Gemini Response:", text);
  return result;
}
// TODO Gemini関数呼び出し機能のテストをする。

//  --- ここからテスト関数を追加 ---

/**
 * registerSchedule 関数のテスト用関数
 * 実行するとデフォルトカレンダーにテストイベントが登録されます。
 */
function testRegisterSchedule() {
  const testTitle = "APIテストイベント";
  // 日付は未来の日付を指定すると確認しやすいです
  const testStartTime = "2025/05/10 14:00"; // 例: YYYY/MM/DD HH:mm 形式
  const testEndTime = "2025/05/10 15:00"; // 例: YYYY/MM/DD HH:mm 形式
  const testExplain = "これは registerSchedule 関数のテスト登録です。";

  try {
    // registerSchedule 関数を呼び出し
    const eventId = registerSchedule(
      testTitle,
      testStartTime,
      testEndTime,
      testExplain
    );
    // 成功した場合、イベントIDをログに出力
    console.log(
      `イベントが正常に登録されました。タイトル: "${testTitle}", イベントID: ${eventId}`
    );
    console.log(
      `Googleカレンダーで ${testStartTime} のイベントを確認してください。`
    );
  } catch (error) {
    // エラーが発生した場合、エラーメッセージをログに出力
    console.error("イベント登録中にエラーが発生しました:", error);
    // Momentライブラリがない場合のエラーメッセージを確認
    if (error.message.includes("Moment")) {
      console.error(
        "Momentライブラリがプロジェクトに追加されていないか、正しく読み込めていない可能性があります。"
      );
    }
    // カレンダーAPIの権限がない場合のエラーも考えられます
    if (error.message.includes("CalendarApp")) {
      console.error(
        "スクリプトにGoogleカレンダーへのアクセス権限が付与されていない可能性があります。"
      );
    }
  }
}

// --- ここまでテスト関数を追加 ---
// 今日以降のイベントすべてを取得しスプレッドシートに書き込む関数
function getEvents() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const calendar = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const events = calendar.getEvents(
    now,
    new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)
  ); // 今から1ヶ月後までのイベントを取得

  // スプレッドシートに書き込む
  sheet
    .getRange(2, 1, events.length, 4)
    .setValues(
      events.map((event) => [
        event.getId(),
        event.getTitle(),
        event.getStartTime(),
        event.getEndTime(),
      ])
    ); // ヘッダー行を追加
}
