import { Schema, model, type InferSchemaType } from "mongoose";

const videoSchema = new Schema(
  {
    sourceId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    pageUrl: { type: String, required: true },
    downloadUrl: { type: String, required: true },
    localPath: { type: String, required: true },
    mimeType: { type: String, default: "video/mp4" },
    sizeBytes: { type: Number },
    sourceSite: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

export type VideoDocument = InferSchemaType<typeof videoSchema> & { _id: Schema.Types.ObjectId };
export const VideoModel = model("Video", videoSchema);
