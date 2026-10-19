import mongoose from 'mongoose';
import VersionModel from '../models/edaCleanerVersion.model.js';
import { s3Service } from './s3.service.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';

export interface CleanupPreviousVersionsResult {
  deletedFilesCount: number;
  deletedVersionsCount: number;
  deletedVersionNames: string[];
}

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
  readonly REQUIRED_PLATFORMS: Platform[] = ['windows', 'macos', 'linux'];

  hasAllPlatforms(files: Array<{ platform: string }>): boolean {
    const platforms = new Set(files.map((f) => f.platform));
    return this.REQUIRED_PLATFORMS.every((p) => platforms.has(p as Platform));
  }

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

    let cleanup: CleanupPreviousVersionsResult | null = null;
    if (this.hasAllPlatforms(doc.files as VersionFileInput[])) {
      cleanup = await this.cleanupPreviousVersions(
        doc._id as mongoose.Types.ObjectId,
        doc.version,
      );
    }

    return {
      ...doc.toObject(),
      cleanup,
    };
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

    let cleanup: CleanupPreviousVersionsResult | null = null;
    if (this.hasAllPlatforms(doc.files as VersionFileInput[])) {
      cleanup = await this.cleanupPreviousVersions(
        doc._id as mongoose.Types.ObjectId,
        doc.version,
      );
    }

    return {
      ...doc.toObject(),
      cleanup,
    };
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
    installerType?: InstallerType;
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
    let candidates = files.filter((file) => file.platform === input.platform);

    if (candidates.length === 0) {
      throw ApiError.notFound(
        `No installer available for platform: ${input.platform}`,
      );
    }

    if (input.architecture) {
      const byArch = candidates.filter(
        (item) => item.architecture === input.architecture,
      );
      if (byArch.length > 0) candidates = byArch;
    }

    if (input.installerType) {
      const byType = candidates.filter(
        (item) => item.installerType === input.installerType,
      );
      if (byType.length === 0) {
        throw ApiError.notFound(
          `No installer available for ${input.platform}/${input.installerType}`,
        );
      }
      candidates = byType;
    }

    // Prefer native packages over portable AppImage for Linux defaults.
    const linuxPreference: InstallerType[] = ['deb', 'rpm', 'appimage'];

    let file: (typeof candidates)[number] | undefined;

    if (input.installerType) {
      file = candidates[0];
    } else if (input.platform === 'linux') {
      file =
        linuxPreference
          .map((type) =>
            candidates.find(
              (item) => item.installerType === type && item.latest !== false,
            ),
          )
          .find(Boolean) ??
        linuxPreference
          .map((type) => candidates.find((item) => item.installerType === type))
          .find(Boolean) ??
        candidates.find((item) => item.latest) ??
        candidates[0];
    } else {
      file =
        candidates.find((item) => item.latest) ??
        candidates.find((item) => item.architecture === 'x64') ??
        candidates[0];
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
    const doc = await VersionModel.findOne({ version });

    if (!doc) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }

    const storageUrls = (doc.files ?? [])
      .map((f) => f.storageUrl)
      .filter((url): url is string => Boolean(url));

    if (storageUrls.length > 0) {
      await s3Service.deleteObjects(storageUrls);
    }

    try {
      await s3Service.deletePrefix(`uploads/releases/${version}/`);
    } catch (err) {
      console.warn(`[VersionService] Failed to clean prefix for ${version}:`, err);
    }

    const result = await VersionModel.deleteOne({ _id: doc._id });

    if (result.deletedCount === 0) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }
  }

  async cleanupPreviousByVersion(
    versionRaw: string,
  ): Promise<CleanupPreviousVersionsResult> {
    const version = normalizeVersion(versionRaw);
    const doc = await VersionModel.findOne({ version });

    if (!doc) {
      throw ApiError.notFound(MESSAGES.VERSION_NOT_FOUND);
    }

    if (!this.hasAllPlatforms(doc.files as VersionFileInput[])) {
      throw ApiError.badRequest(
        `Version ${version} does not yet have files for all required platforms (windows, macos, linux). Previous downloadable files cannot be deleted until all OS files are uploaded.`,
      );
    }

    return this.cleanupPreviousVersions(
      doc._id as mongoose.Types.ObjectId,
      doc.version,
    );
  }

  async cleanupPreviousVersions(
    currentVersionId: mongoose.Types.ObjectId,
    currentVersion: string,
  ): Promise<CleanupPreviousVersionsResult> {
    const otherVersions = await VersionModel.find({
      _id: { $ne: currentVersionId },
    });

    if (otherVersions.length === 0) {
      return {
        deletedFilesCount: 0,
        deletedVersionsCount: 0,
        deletedVersionNames: [],
      };
    }

    const storageUrls: string[] = [];
    const versionNames: string[] = [];

    for (const v of otherVersions) {
      if (v.version) versionNames.push(v.version);
      for (const f of v.files ?? []) {
        if (f.storageUrl) {
          storageUrls.push(f.storageUrl);
        }
      }
    }

    if (storageUrls.length > 0) {
      const { deleted, errors } = await s3Service.deleteObjects(storageUrls);
      console.log(
        `[VersionService] Deleted ${deleted.length} S3 objects for previous versions: ${versionNames.join(', ')}. Errors: ${errors.length}`,
      );
    }

    for (const vName of versionNames) {
      try {
        await s3Service.deletePrefix(`uploads/releases/${vName}/`);
      } catch (err) {
        console.warn(
          `[VersionService] Error cleaning prefix for version ${vName}:`,
          err,
        );
      }
    }

    const deleteResult = await VersionModel.deleteMany({
      _id: { $ne: currentVersionId },
    });

    console.log(
      `[VersionService] Removed ${deleteResult.deletedCount} previous version records from MongoDB (retained version ${currentVersion})`,
    );

    return {
      deletedFilesCount: storageUrls.length,
      deletedVersionsCount: deleteResult.deletedCount ?? 0,
      deletedVersionNames: versionNames,
    };
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
