import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["windows", "macos", "linux"],
      required: true,
    },

    architecture: {
      type: String,
      enum: ["x64", "arm64"],
      required: true,
    },

    installerType: {
      type: String,
      enum: [
        "exe",
        "msi",
        "dmg",
        "pkg",
        "appimage",
        "deb",
        "rpm",
        "zip",
      ],
      required: true,
    },

    fileName: String,

    fileSize: Number,

    checksum: String,

    storageUrl: String,

    latest: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const VersionSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      unique: true,
    },

    buildNumber: {
      type: Number,
      required: true,
    },

    releaseType: {
      type: String,
      enum: ["stable", "beta", "alpha"],
      default: "stable",
    },

    releaseDate: {
      type: Date,
      default: Date.now,
    },

    minimumSupportedVersion: {
      type: String,
      default: "1.0.0",
    },

    forceUpdate: {
      type: Boolean,
      default: false,
    },

    mandatory: {
      type: Boolean,
      default: false,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    releaseNotes: {
      type: [String],
      default: [],
    },

    files: [FileSchema],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Version", VersionSchema);