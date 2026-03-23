declare module "weixin-claw-bot-sdk" {
  export { WeixinBot } from "../../../../node_modules/weixin-claw-bot-sdk/dist/bot.js";
  export { WeixinAuthManager } from "../../../../node_modules/weixin-claw-bot-sdk/dist/auth.js";
  export { WeixinApiClient } from "../../../../node_modules/weixin-claw-bot-sdk/dist/client.js";
  export {
    FileSessionStore,
    MemorySessionStore,
  } from "../../../../node_modules/weixin-claw-bot-sdk/dist/session-store.js";
  export {
    downloadMedia,
    resolveUploadMediaType,
    sendDocument,
    sendImage,
    sendVideo,
    uploadMedia,
  } from "../../../../node_modules/weixin-claw-bot-sdk/dist/media.js";
  export {
    DEFAULT_BASE_URL,
    DEFAULT_CDN_BASE_URL,
    DEFAULT_BOT_TYPE,
  } from "../../../../node_modules/weixin-claw-bot-sdk/dist/constants.js";
  export {
    MissingContextTokenError,
    SessionExpiredError,
    WeixinSdkError,
  } from "../../../../node_modules/weixin-claw-bot-sdk/dist/errors.js";
  export type {
    DownloadMediaOptions,
    DownloadMediaResult,
    InputFile,
    LoginResult,
    LoginSession,
    OnTextListener,
    PollingOptions,
    SendCommonOptions,
    SendMediaOptions,
    SessionStore,
    WaitForLoginOptions,
    WeixinBotMessage,
    WeixinMessageMedia,
    WeixinRawMessage,
    WeixinSession,
  } from "../../../../node_modules/weixin-claw-bot-sdk/dist/types.js";
}
