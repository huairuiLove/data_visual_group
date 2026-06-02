const multer = require('multer');

class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = true;
  }
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new AppError(413, 'UPLOAD_TOO_LARGE', '上传文件不能超过 200MB');
    }
    return new AppError(400, error.code || 'UPLOAD_ERROR', '文件上传失败');
  }

  return new AppError(500, 'INTERNAL_SERVER_ERROR', '服务器处理请求时发生错误');
}

function sendError(res, error, logLabel = 'Request error') {
  const normalized = normalizeError(error);
  console.error(`${logLabel}:`, error);

  return res.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  });
}

module.exports = { AppError, normalizeError, sendError };
