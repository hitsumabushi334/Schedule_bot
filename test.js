async function test01() {
  // async を追加するにぇ！
  const folderId = PropertiesService.getScriptProperties().getProperty(
    "GOOGLE_DRIVE_FOLDER_ID"
  );
  const fileName = "IMG_20210516_195729.jpg"; // テストしたい画像ファイル名に変えてにぇ！
  const file = DriveApp.getFilesByName(fileName).next();
  const fileId = file.getId();
  console.log("File ID:", fileId);
  const imageParts = [fileToGenerativePart(fileId)]; // 画像パーツを作るにぇ！

  // ここから書き換えるにぇ！
  try {
    // まず extractScheduleInfoFromImage を呼び出すにぇ！
    extractScheduleInfoFromImage(imageParts)
      .then((extractRes) => {
        // レスポンスからテキストを取り出すにぇ！
        const extractResponse = extractRes.response;
        const extractedText = extractResponse.text();
        console.log("抽出されたテキスト:", extractedText); // 抽出結果を確認するログだにぇ！
        return extractedText; // 次の .then にテキストを渡すにぇ！
      })
      .then((text) => {
        // 抽出したテキストを使って geminiRegisterSchedule を呼び出すにぇ！
        console.log("geminiRegisterSchedule に渡すテキスト:", text); // 渡すテキストを確認するログだにぇ！
        return geminiRegisterSchedule(text).then((registerRes) => {
          // geminiRegisterSchedule も Promise を返すから .then を使うにぇ！
          // geminiRegisterSchedule の結果を処理するにぇ！
          const registerResponse = registerRes.response;
          const registerText = registerResponse.text();
          // Geminiからの最終的な応答はここでログに出力されるにぇ！
          console.log("Gemini Response (最終結果):", registerText);
          // sendMessage はテスト関数内では使わないことが多いからコメントアウトしておくかにぇ？
          // sendMessage(reply_token, registerText, false);
        });
      })
      .catch((error) => {
        // then のチェーン全体のエラーをキャッチするにぇ！
        console.error("処理中にエラーが発生したにぇ！:", error);
        // sendMessage(reply_token, "処理中にエラーが発生しました。", false);
      });
  } catch (error) {
    // try ブロック自体のエラー（例えば fileToGenerativePart でのエラーなど）をキャッチするにぇ！
    console.error("test01 関数の実行中にエラーが発生したにぇ！:", error);
  }
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
    systemInstruction: `あなたは優れた秘書であり私の言葉から適切な情報を取得することができます。日本語で必ず回答し、指示を厳守すること。今日の日付は${currentDate}です。`,
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
function testGeminiRegisterSchedule() {
  // テストで使うテキストメッセージだ
  // カレンダーに登録したい内容を具体的に書くといい
  const testInputText = "寛大来襲";

  console.log(`--- testGeminiRegisterSchedule 開始だにぇ！ ---`);
  console.log(`テスト入力テキスト: "${testInputText}"`);

  try {
    // geminiRegisterSchedule 関数を呼び出す
    // この関数は非同期だけど、Apps Script のトップレベルからは await できないから、
    // 実行ログで Gemini の応答や関数の実行結果を確認する
    const res = geminiRegisterSchedule(testInputText).then((res) => {
      const response = res.response;
      const text = response.text();
      // Geminiからの応答はここでログに出力されます
      console.log("Gemini Response:", text);
    });

    // 注意：↑の呼び出しは非同期だから、このログのすぐ後に結果が出るとは限らない
    // 実行ログを最後までしっかり確認して
    console.log(
      `geminiRegisterSchedule を呼び出したにぇ！ 実行ログで Gemini の応答と、`
    );
    console.log(`Googleカレンダーに「エリート会議」が登録されたか、`);
    console.log(`スプレッドシートにその情報が追記されたかを確認してほしい`);
  } catch (error) {
    // もしエラーが起きたら、ここに表示される
    console.error(
      "testGeminiRegisterSchedule の実行中にエラーが発生したにぇ！:",
      error
    );
    console.error("エラーの詳細:", error.message);
    console.error("スタックトレース:", error.stack);
  } finally {
    // finally はエラーがあってもなくても最後に実行される
    console.log(
      `--- testGeminiRegisterSchedule 終了だにぇ！ 実行ログを確認してにぇ！ ---`
    );
  }
}


