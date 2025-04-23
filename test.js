const GeminiApiKey =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
const genAI = new GeminiApp(GeminiApiKey);
function test01() {
  const folderId = PropertiesService.getScriptProperties().getProperty(
    "GOOGLE_DRIVE_FOLDER_ID"
  );
  const fileName = "IMG_20210516_195729.jpg";
  const file = DriveApp.getFilesByName(fileName).next();
  const fileId = file.getId();
  console.log("File ID:", fileId);
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

async function runTextAndImages() {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-04-17",
  });

  const prompt = "画像について説明してください";

  const imageParts = [
    fileToGenerativePart("1HOscnl6V1P19JukxRM-BrhodAmgLa7df"),
  ];

  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  const text = response.text();
  console.log(text);
}
// TODO Gemini関数呼び出し機能のテストをする。
