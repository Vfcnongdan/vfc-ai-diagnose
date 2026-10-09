export const googleDriveConfig = () => ({
  enabled: process.env.ENABLE_GOOGLE_DRIVE_SYNC !== 'false',
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
  clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  keyFilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
});
