export const googleDriveConfig = () => ({
  enabled: process.env.ENABLE_GOOGLE_DRIVE_SYNC !== 'false',
  webhookUrl: process.env.GOOGLE_DRIVE_WEBHOOK_URL || '',
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
});
