import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    xId: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    name: { type: String, required: true },
    avatarUrl: { type: String },
    accessToken: { type: String },
    refreshToken: { type: String },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const UserModel = model("User", userSchema);
