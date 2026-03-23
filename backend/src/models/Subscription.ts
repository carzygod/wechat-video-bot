import { Schema, model, type InferSchemaType } from "mongoose";

const subscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "linked", "expired", "failed"],
      required: true,
      default: "pending",
      index: true,
    },
    qrSessionId: { type: String, index: true },
    qrCodeUrl: { type: String },
    qrExpiresAt: { type: Date },
    errorMessage: { type: String },
    linkedAt: { type: Date },
    weixinAccountId: { type: String },
    weixinUserId: { type: String },
    botSession: { type: Schema.Types.Mixed },
    pendingVideoIds: [{ type: Schema.Types.ObjectId, ref: "Video" }],
  },
  {
    timestamps: true,
  },
);

export type SubscriptionDocument = InferSchemaType<typeof subscriptionSchema> & {
  _id: Schema.Types.ObjectId;
};

export const SubscriptionModel = model("Subscription", subscriptionSchema);
