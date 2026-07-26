import mongoose from 'mongoose';
import VersionModel from '../models/edaCleanerVersion.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';

export type Platform = 'windows' | 'macos' | 'linux';
export type Architecture = 'x64' | 'arm64';
export type InstallerType =
  | 'exe'
  | 'msi'
  | 'dmg'
  | 'pkg'
  | 'appimage'
  | 'deb'
  | 'rpm'
  | 'zip';
export type ReleaseType = 'stable' | 'beta' | 'alpha';

export interface VersionFileInput {
  platform: Platform;
  architecture: Architecture;
  installerType: InstallerType;
  fileName: string;
  fileSize: number;
  checksum: string;
  storageUrl: string;
  latest?: boolean;
}

export interface CreateVersionInput {
  version: string;
  buildNumber: number;
  releaseType?: ReleaseType;
  minimumSupportedVersion?: string;
  forceUpdate?: boolean;
  mandatory?: boolean;
  isPublished?: boolean;
  releaseNotes?: string[];
  files: VersionFileInput[];
}

export interface AddVersionFilesInput {
  files: VersionFileInput[];
  markLatest?: boolean;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export class VersionService {
  async getNextBuildNumber(): Promise<number> {
    const latest = await VersionModel.findOne()
      .sort({ buildNumber: -1 })
      .select({ buildNumber: 1 })
      .lean();

    return (latest?.buildNumber ?? 0) + 1;
  }

  async create(input: CreateVersionInput) {
    const version = normalizeVersion(input.version);

    const existing = await VersionModel.findOne({ version }).lean();
    if (existing) {
      throw ApiError.conflict(`Version ${version} already exists`);
    }

    const markFilesLatest = input.isPublished === true;

    const doc = await VersionModel.create({
      version,
      buildNumber: input.buildNumber,
      releaseType: input.releaseType ?? 'stable',
      minimumSupportedVersion: input.minimumSupportedVersion ?? '1.0.0',
      forceUpdate: input.forceUpdate ?? false,
      mandatory: input.mandatory ?? false,
      isPublished: input.isPublished ?? false,
      releaseNotes: input.releaseNotes ?? [],
      files: input.files.map((file) => ({
        ...file,
        latest: file.latest ?? markFilesLatest,
      })),
    });

    if (markFilesLatest) {
      await this.clearOtherLatestFlags(
        doc._id as mongoose.Types.ObjectId,
        input.files,
      );
    }

    return doc.toObject();
  }

  async addFiles(versionRaw: string, input: AddVersionFilesInput) {
    const version = normalizeVersion(versionRaw);
    const doc = await VersionModel.findOne({ version });

    if (!doc) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }

    const markLatest = input.markLatest === true || doc.isPublished;

    const currentFiles = doc.files.map((item) => ({
      platform: item.platform,
      architecture: item.architecture,
      installerType: item.installerType,
      fileName: item.fileName,
      fileSize: item.fileSize,
      checksum: item.checksum,
      storageUrl: item.storageUrl,
      latest: item.latest,
    }));

    for (const file of input.files) {
      const nextFile = {
        platform: file.platform,
        architecture: file.architecture,
        installerType: file.installerType,
        fileName: file.fileName,
        fileSize: file.fileSize,
        checksum: file.checksum,
        storageUrl: file.storageUrl,
        latest: file.latest ?? markLatest,
      };

      const existingIndex = currentFiles.findIndex(
        (item) =>
          item.platform === file.platform &&
          item.architecture === file.architecture &&
          item.installerType === file.installerType,
      );

      if (existingIndex >= 0) {
        currentFiles[existingIndex] = nextFile;
      } else {
        currentFiles.push(nextFile);
      }
    }

    doc.set('files', currentFiles);
    if (input.markLatest === true) {
      doc.isPublished = true;
    }
    await doc.save();

    if (markLatest) {
      await this.clearOtherLatestFlags(
        doc._id as mongoose.Types.ObjectId,
        input.files,
      );
    }

    return doc.toObject();
  }

  async getByVersion(versionRaw: string) {
    const version = normalizeVersion(versionRaw);
    const doc = await VersionModel.findOne({ version }).lean();

    if (!doc) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }

    return doc;
  }

  async getLatestPublished() {
    const doc = await VersionModel.findOne({ isPublished: true })
      .sort({ buildNumber: -1 })
      .lean();

    if (!doc) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }

    return {
      version: doc.version,
      buildNumber: doc.buildNumber,
      releaseType: doc.releaseType,
      releaseDate: doc.releaseDate,
      releaseNotes: doc.releaseNotes,
      forceUpdate: doc.forceUpdate,
      mandatory: doc.mandatory,
      minimumSupportedVersion: doc.minimumSupportedVersion,
      files: (doc.files ?? []).map((file) => ({
        platform: file.platform,
        architecture: file.architecture,
        installerType: file.installerType,
        fileName: file.fileName,
        fileSize: file.fileSize,
        checksum: file.checksum,
        latest: file.latest,
      })),
    };
  }

  async resolveDownloadTarget(input: {
    platform: Platform;
    architecture?: Architecture;
    version?: string;
  }) {
    const doc = input.version
      ? await VersionModel.findOne({
          version: normalizeVersion(input.version),
          isPublished: true,
        }).lean()
      : await VersionModel.findOne({ isPublished: true })
          .sort({ buildNumber: -1 })
          .lean();

    if (!doc) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }

    const files = doc.files ?? [];
    const platformFiles = files.filter((file) => file.platform === input.platform);

    if (platformFiles.length === 0) {
      throw ApiError.notFound(
        `No installer available for platform: ${input.platform}`,
      );
    }

    let file = input.architecture
      ? platformFiles.find((item) => item.architecture === input.architecture)
      : undefined;

    if (!file) {
      file =
        platformFiles.find((item) => item.latest) ??
        platformFiles.find((item) => item.architecture === 'x64') ??
        platformFiles[0];
    }

    if (!file?.storageUrl || !file.fileName) {
      throw ApiError.notFound('Installer file metadata is incomplete');
    }

    return {
      version: doc.version,
      releaseType: doc.releaseType,
      file: {
        platform: file.platform as Platform,
        architecture: file.architecture as Architecture,
        installerType: file.installerType as InstallerType,
        fileName: file.fileName,
        fileSize: file.fileSize ?? 0,
        checksum: file.checksum ?? '',
        storageUrl: file.storageUrl,
      },
    };
  }

  async remove(versionRaw: string): Promise<void> {
    const version = normalizeVersion(versionRaw);
    const result = await VersionModel.deleteOne({ version });

    if (result.deletedCount === 0) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }
  }

  /**
   * Ensure only the given version's platform/arch/type files stay marked latest.
   */
  private async clearOtherLatestFlags(
    versionId: mongoose.Types.ObjectId,
    files: Array<{ platform: string; architecture: string; installerType: string }>,
  ): Promise<void> {
    for (const file of files) {
      await VersionModel.updateMany(
        {
          _id: { $ne: versionId },
          files: {
            $elemMatch: {
              platform: file.platform,
              architecture: file.architecture,
              installerType: file.installerType,
            },
          },
        },
        {
          $set: { 'files.$[elem].latest': false },
        },
        {
          arrayFilters: [
            {
              'elem.platform': file.platform,
              'elem.architecture': file.architecture,
              'elem.installerType': file.installerType,
            },
          ],
        },
      );
    }
  }
}

export const versionService = new VersionService();
