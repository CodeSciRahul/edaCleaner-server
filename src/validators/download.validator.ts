import { query } from 'express-validator';

export const downloadLatestRules = [
  query('platform')
    .isIn(['windows', 'macos', 'linux'])
    .withMessage('platform must be windows, macos, or linux'),
  query('architecture')
    .optional()
    .isIn(['x64', 'arm64'])
    .withMessage('architecture must be x64 or arm64'),
  query('installerType')
    .optional()
    .isIn(['exe', 'msi', 'dmg', 'pkg', 'appimage', 'deb', 'rpm', 'zip'])
    .withMessage('installerType is invalid'),
];
