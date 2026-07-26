import { body, param } from 'express-validator';

const platforms = ['windows', 'macos', 'linux'] as const;
const architectures = ['x64', 'arm64'] as const;
const installerTypes = [
  'exe',
  'msi',
  'dmg',
  'pkg',
  'appimage',
  'deb',
  'rpm',
  'zip',
] as const;
const releaseTypes = ['stable', 'beta', 'alpha'] as const;

const fileRules = (prefix: string) => [
  body(`${prefix}.platform`)
    .isIn([...platforms])
    .withMessage('platform must be windows, macos, or linux'),
  body(`${prefix}.architecture`)
    .isIn([...architectures])
    .withMessage('architecture must be x64 or arm64'),
  body(`${prefix}.installerType`)
    .isIn([...installerTypes])
    .withMessage('installerType is invalid'),
  body(`${prefix}.fileName`)
    .isString()
    .trim()
    .notEmpty()
    .withMessage('fileName is required'),
  body(`${prefix}.fileSize`)
    .isInt({ min: 1 })
    .withMessage('fileSize must be a positive integer'),
  body(`${prefix}.checksum`)
    .isString()
    .trim()
    .notEmpty()
    .withMessage('checksum is required'),
  body(`${prefix}.storageUrl`)
    .isString()
    .trim()
    .notEmpty()
    .isURL({ require_protocol: true })
    .withMessage('storageUrl must be a valid URL'),
  body(`${prefix}.latest`).optional().isBoolean(),
];

export const createVersionRules = [
  body('version')
    .isString()
    .trim()
    .notEmpty()
    .matches(/^\d+\.\d+\.\d+(-[\w.-]+)?$/)
    .withMessage('version must be semver (e.g. 1.0.0 or 1.0.0-beta.1)'),
  body('buildNumber')
    .isInt({ min: 1 })
    .withMessage('buildNumber must be a positive integer'),
  body('releaseType')
    .optional()
    .isIn([...releaseTypes])
    .withMessage('releaseType must be stable, beta, or alpha'),
  body('minimumSupportedVersion')
    .optional()
    .isString()
    .trim()
    .notEmpty(),
  body('forceUpdate').optional().isBoolean(),
  body('mandatory').optional().isBoolean(),
  body('isPublished').optional().isBoolean(),
  body('releaseNotes').optional().isArray(),
  body('releaseNotes.*').optional().isString().trim(),
  body('files')
    .isArray({ min: 1 })
    .withMessage('files must contain at least one installer'),
  ...fileRules('files.*'),
];

export const addVersionFilesRules = [
  param('version')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('version is required'),
  body('files')
    .isArray({ min: 1 })
    .withMessage('files must contain at least one installer'),
  body('markLatest').optional().isBoolean(),
  ...fileRules('files.*'),
];
