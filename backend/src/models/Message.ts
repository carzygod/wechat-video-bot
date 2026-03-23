import { Schema, model, type InferSchemaType } from "mongoose";

const messageSchema = new Schema(
  {
    subscription: { type: Schema.Types.ObjectId, ref: "Subscription", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true, index: true },
    source: { type: String, enum: ["user", "bot", "admin", "broadcast"], required: true },
    weixinUserId: { type: String },
    text: { type: String, required: true },
    messageId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  },
);

export type MessageDocument = InferSchemaType<typeof messageSchema> & {
  _id: Schema.Types.ObjectId;
};

export const MessageModel = model("Message", messageSchema);
